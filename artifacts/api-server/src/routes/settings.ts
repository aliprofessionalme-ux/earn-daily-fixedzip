import { Router, type Request } from "express";
import { getAppSettings, handleRouteError } from "../services/firebase-admin.js";

const router = Router();

function sendError(res: import("express").Response, err: unknown, fallback: string) {
  const normalized = handleRouteError(err, fallback);
  res.status(normalized.status).json(normalized.body);
}

function truthyEnv(name: string) {
  return Boolean(String(process.env[name] ?? "").trim());
}

function getPublicBaseUrl(req: Request): string {
  const explicit = String(process.env["PUBLIC_BASE_URL"] || process.env["APP_PUBLIC_URL"] || "").trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const replitDomain = String(process.env["REPLIT_DEV_DOMAIN"] || process.env["REPLIT_DOMAINS"] || process.env["EXPO_PUBLIC_DOMAIN"] || "")
    .split(",")[0]
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  if (replitDomain) return `https://${replitDomain}`;
  return `${req.protocol}://${req.get("host")}`.replace(/\/$/, "");
}

function buildProviderCallbackUrls(req: Request) {
  const base = getPublicBaseUrl(req);
  return {
    monlix: `${base}/api/webhooks/monlix`,
    tapjoy: `${base}/api/webhooks/tapjoy`,
    ayet: `${base}/api/webhooks/ayet`,
    pubscale: `${base}/api/webhooks/pubscale`,
    unity: "Unity rewarded ads are disabled until native SDK server-side verification is implemented.",
  };
}

function buildProviderLaunchStatus() {
  const monlixReady = truthyEnv("MONLIX_APP_ID") && (truthyEnv("MONLIX_API_SECRET") || truthyEnv("MONLIX_SECRET"));
  const ayetBaseReady = truthyEnv("AYET_ACCOUNT_ID") && (truthyEnv("AYET_ADSLOT_ID") || truthyEnv("AYET_PLACEMENT_ID")) && truthyEnv("AYET_API_KEY");
  const ayetSecretReady = ayetBaseReady && truthyEnv("AYET_POSTBACK_SECRET");

  return {
    gameTasks: {
      enabled: monlixReady,
      publicAppId: monlixReady ? String(process.env["MONLIX_APP_ID"] ?? "") : undefined,
      reason: monlixReady ? undefined : "Game task launch requires MONLIX_APP_ID plus MONLIX_API_SECRET or MONLIX_SECRET.",
    },
    highRewardOffers: {
      enabled: monlixReady,
      publicAppId: monlixReady ? String(process.env["MONLIX_APP_ID"] ?? "") : undefined,
      reason: monlixReady ? undefined : "High reward task launch requires a verified provider callback secret.",
    },
    surveyRewards: { enabled: false, reason: "Coming Soon until a verified survey provider launch and callback path is tested." },
    appInstallTasks: {
      enabled: false,
      reason: ayetSecretReady
        ? "ayeT backend callback requirements are configured, but mobile launch flow is still kept disabled until dashboard launch parameters are tested."
        : ayetBaseReady
          ? "App install backend config is present, but AYET_POSTBACK_SECRET is still required before rewards can be trusted."
          : "App install tasks require AYET_ACCOUNT_ID, AYET_ADSLOT_ID or AYET_PLACEMENT_ID, and AYET_API_KEY.",
    },
    partnerTasks: { enabled: false, reason: "Coming Soon until provider launch and secure callbacks are ready." },
    watchAdsEnergy: { enabled: false, reason: "Unity rewarded Energy is disabled until the native SDK and server-side reward verification are implemented." },
  };
}

// Public endpoint: returns app settings plus safe launch status (no secrets)
router.get("/", async (req, res) => {
  try {
    const settings = await getAppSettings();
    res.json({
      ...settings,
      providerLaunch: buildProviderLaunchStatus(),
      providerCallbackUrls: buildProviderCallbackUrls(req),
    });
  } catch (err) {
    sendError(res, err, "Unable to load app settings.");
  }
});

export default router;