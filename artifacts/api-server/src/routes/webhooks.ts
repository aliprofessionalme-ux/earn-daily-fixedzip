import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type Request, type Response } from "express";
import {
  creditOfferwallReward,
  handleOfferwallReversal,
  handleRouteError,
  storeManualReviewOfferEvent,
} from "../services/firebase-admin.js";

const router = Router();

type Provider = "monlix" | "tapjoy" | "ayet" | "pubscale";

type ParsedWebhook = {
  deviceId: string;
  externalTransactionId: string;
  payoutUSD?: number;
  coinsOverride?: number | null;
  offerName?: string;
  status: string;
  reason?: string;
  rawPayload: Record<string, unknown>;
};

function sendError(res: Response, err: unknown, fallback: string) {
  const normalized = handleRouteError(err, fallback);
  res.status(normalized.status).json(normalized.body);
}

function asObject(req: Request): Record<string, unknown> {
  const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
  const query = (req.query && typeof req.query === "object" ? req.query : {}) as Record<string, unknown>;
  return { ...query, ...body };
}

function firstString(payload: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) {
      const item = value.find((v) => String(v ?? "").trim());
      if (item != null) return String(item).trim();
    } else if (value != null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
}

function firstNumber(payload: Record<string, unknown>, keys: string[]): number | undefined {
  const raw = firstString(payload, keys);
  if (!raw) return undefined;
  const normalized = raw.replace(/[^0-9.-]/g, "");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : undefined;
}

function safeEq(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function providerSecrets(provider: Provider) {
  if (provider === "monlix") return [process.env["MONLIX_API_SECRET"], process.env["MONLIX_SECRET"]].filter(Boolean) as string[];
  if (provider === "ayet") return [process.env["AYET_POSTBACK_SECRET"]].filter(Boolean) as string[];
  if (provider === "tapjoy") return [process.env["TAPJOY_SECRET_KEY"]].filter(Boolean) as string[];
  return [process.env["PUBSCALE_API_KEY"]].filter(Boolean) as string[];
}

function providerConfigured(provider: Provider): { configured: boolean; reason?: string } {
  if (provider === "monlix") {
    if (!process.env["MONLIX_APP_ID"]) return { configured: false, reason: "MONLIX_APP_ID missing" };
    if (providerSecrets(provider).length === 0) return { configured: false, reason: "MONLIX_API_SECRET or MONLIX_SECRET missing" };
    return { configured: true };
  }
  if (provider === "ayet") {
    if (!process.env["AYET_ACCOUNT_ID"]) return { configured: false, reason: "AYET_ACCOUNT_ID missing" };
    if (!process.env["AYET_ADSLOT_ID"] && !process.env["AYET_PLACEMENT_ID"]) return { configured: false, reason: "AYET_ADSLOT_ID or AYET_PLACEMENT_ID missing" };
    if (!process.env["AYET_API_KEY"]) return { configured: false, reason: "AYET_API_KEY missing" };
    if (process.env["AYET_ANDROID_PACKAGE"] && process.env["AYET_ANDROID_PACKAGE"] !== "com.earndaily.app") {
      return { configured: false, reason: "AYET_ANDROID_PACKAGE must be com.earndaily.app" };
    }
    return { configured: true };
  }
  if (provider === "tapjoy") {
    return process.env["TAPJOY_APP_ID"] && providerSecrets(provider).length > 0
      ? { configured: true }
      : { configured: false, reason: "Tapjoy app ID/secret missing" };
  }
  return process.env["PUBSCALE_APP_ID"] && providerSecrets(provider).length > 0
    ? { configured: true }
    : { configured: false, reason: "PubScale app ID/API key missing" };
}

function canonicalPayload(payload: Record<string, unknown>): string {
  return Object.entries(payload)
    .filter(([key]) => !["hash", "signature", "sig", "secret", "api_key", "apiKey"].includes(key))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(",") : String(value ?? "")}`)
    .join("&");
}

function verifyWebhook(req: Request, provider: Provider, payload: Record<string, unknown>): { trusted: boolean; missingSecret: boolean } {
  const secrets = providerSecrets(provider);
  if (secrets.length === 0) return { trusted: false, missingSecret: true };

  const provided = [
    firstString(payload, ["secret", "api_key", "apiKey", "token"]),
    firstString(payload, ["signature", "sig", "hash"]),
    String(req.headers["x-signature"] ?? ""),
    String(req.headers["x-api-key"] ?? ""),
    String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, ""),
  ].filter(Boolean);

  for (const secret of secrets) {
    if (provided.some((value) => safeEq(value, secret))) return { trusted: true, missingSecret: false };

    const canonical = canonicalPayload(payload);
    const sha256 = createHmac("sha256", secret).update(canonical).digest("hex");
    const sha1 = createHmac("sha1", secret).update(canonical).digest("hex");
    if (provided.some((value) => safeEq(value.toLowerCase(), sha256) || safeEq(value.toLowerCase(), sha1))) {
      return { trusted: true, missingSecret: false };
    }
  }

  return { trusted: false, missingSecret: false };
}

function parseWebhook(req: Request): ParsedWebhook {
  const payload = asObject(req);
  const deviceId = firstString(payload, [
    "userId", "user_id", "subId", "subid", "sub_id", "deviceId", "device_id", "uid", "external_identifier", "externalIdentifier", "click_user_id",
  ]);
  const externalTransactionId = firstString(payload, [
    "transactionId", "transaction_id", "txId", "txid", "tx_id", "txn_id", "conversion_id", "conversionId", "lead_id", "id", "oid",
  ]);
  const payoutUSD = firstNumber(payload, [
    "payoutUSD", "payoutUsd", "payout_usd", "amount_usd", "usd", "revenue", "payout", "amount", "value",
  ]);
  const coinsOverride = firstNumber(payload, [
    "coins", "coin_amount", "coinAmount", "virtual_currency", "virtualCurrency", "virtual_currency_amount", "virtualCurrencyAmount", "vc_amount", "points",
  ]);
  const offerName = firstString(payload, ["offerName", "offer_name", "campaignName", "campaign_name", "adName", "title", "name"]);
  const status = firstString(payload, ["status", "state", "event", "type", "action"]).toLowerCase() || "completed";
  const reason = firstString(payload, ["reason", "rejectionReason", "rejection_reason", "chargeback_reason"]);

  return {
    deviceId,
    externalTransactionId,
    payoutUSD,
    coinsOverride,
    offerName: offerName || undefined,
    status,
    reason: reason || undefined,
    rawPayload: payload,
  };
}

function coinsOverrideFor(parsed: ParsedWebhook): number | null | undefined {
  // If USD payout is present, calculate coins from our 5000 coins/USD rule instead of provider point values.
  return parsed.payoutUSD && parsed.payoutUSD > 0 ? null : parsed.coinsOverride;
}

function isReversalStatus(status: string): boolean {
  return ["rejected", "reject", "chargeback", "reversal", "reverse", "reversed", "fraud", "cancelled", "canceled"].includes(status);
}

async function handleProviderWebhook(req: Request, res: Response, provider: Provider) {
  const config = providerConfigured(provider);
  if (!config.configured) {
    res.status(503).json({ error: `${provider} webhook is not configured: ${config.reason}.`, code: "provider_not_configured" });
    return;
  }

  const parsed = parseWebhook(req);
  if (!parsed.deviceId || parsed.deviceId === "undefined" || parsed.deviceId === "null" || parsed.deviceId.length < 4) {
    res.status(400).json({ error: "Missing userId/deviceId in webhook payload.", code: "missing_user_id" });
    return;
  }
  if (!parsed.externalTransactionId || parsed.externalTransactionId.length < 3) {
    res.status(400).json({ error: "Missing provider transaction ID. Reward was not credited.", code: "missing_transaction_id" });
    return;
  }

  const verification = verifyWebhook(req, provider, parsed.rawPayload);
  if (!verification.trusted) {
    if (provider === "ayet" && verification.missingSecret) {
      try {
        const result = await storeManualReviewOfferEvent({
          deviceId: parsed.deviceId,
          provider,
          externalTransactionId: parsed.externalTransactionId,
          payoutUSD: parsed.payoutUSD,
          coinsOverride: coinsOverrideFor(parsed),
          offerName: parsed.offerName,
          rawPayload: parsed.rawPayload,
          reason: "AYET_POSTBACK_SECRET missing; callback stored without balance credit.",
        });
        res.status(202).json({ ...result, code: "manual_review_missing_ayet_secret" });
      } catch (err) {
        req.log.error({ err, provider }, "Error storing unverified ayeT callback for manual review");
        sendError(res, err, "Unable to store ayeT callback for manual review.");
      }
      return;
    }

    res.status(403).json({ error: "Invalid or missing webhook signature/secret. Reward was not credited.", code: "invalid_webhook_signature" });
    return;
  }

  try {
    if (isReversalStatus(parsed.status)) {
      const result = await handleOfferwallReversal({
        provider,
        externalTransactionId: parsed.externalTransactionId,
        reason: parsed.reason ?? `${provider} ${parsed.status}`,
      });
      res.json(result);
      return;
    }

    const result = await creditOfferwallReward({
      deviceId: parsed.deviceId,
      provider,
      externalTransactionId: parsed.externalTransactionId,
      payoutUSD: parsed.payoutUSD,
      coinsOverride: coinsOverrideFor(parsed),
      offerName: parsed.offerName,
      rawPayload: parsed.rawPayload,
      status: "completed",
    });
    res.json(result);
  } catch (err) {
    req.log.error({ err, provider, deviceId: parsed.deviceId }, `Error processing ${provider} webhook`);
    sendError(res, err, `Unable to process ${provider} reward.`);
  }
}

for (const provider of ["monlix", "tapjoy", "ayet", "pubscale"] as Provider[]) {
  router.get(`/${provider}`, async (req, res) => handleProviderWebhook(req, res, provider));
  router.post(`/${provider}`, async (req, res) => handleProviderWebhook(req, res, provider));
}

export default router;
