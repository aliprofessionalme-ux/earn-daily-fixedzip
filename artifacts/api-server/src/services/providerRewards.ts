import admin from "firebase-admin";
import {
  calculateCoinsFromUSD,
  coinsToPKR,
  determineOfferCategory,
  getAppSettings,
  getFirestoreDb,
  HttpError,
  nowTs,
  requireUser,
  storeManualReviewOfferEvent,
  type LedgerType,
  type OfferCategory,
  type OfferEventDocument,
  type OfferEventStatus,
} from "./firebase-admin.js";

type Provider = "monlix" | "tapjoy" | "ayet" | "pubscale" | "cpx";

type ProviderHoldSettings = {
  monlixHoldDays?: number;
  ayetHoldDays?: number;
  tapjoyHoldDays?: number;
  pubscaleHoldDays?: number;
  cpxHoldDays?: number;
  unityHoldDays?: number;
};

export const PROVIDER_REWARD_HOLD_POLICY = {
  monlix: {
    normalWindow: "7-15 days",
    paymentDelay: "30 days",
    holdDays: 30,
    workload: "Normal offers / games / surveys",
  },
  ayet: {
    normalWindow: "15-30 days",
    paymentDelay: "30-45 days",
    holdDays: 45,
    workload: "App install, surveys, game tasks",
  },
  tapjoy: {
    normalWindow: "15-30 days",
    paymentDelay: "45-60 days",
    holdDays: 60,
    workload: "High reward game missions",
  },
  unity: {
    normalWindow: "15-30 days",
    paymentDelay: "45-60 days",
    holdDays: 60,
    workload: "High reward game missions",
  },
  pubscale: {
    normalWindow: "15-30 days",
    paymentDelay: "60 days",
    holdDays: 60,
    workload: "Offerwall / ad tasks / high value rewards",
  },
  cpx: {
    normalWindow: "15-30 days",
    paymentDelay: "30-45 days",
    holdDays: 45,
    workload: "Research surveys / rewarded questionnaires",
  },
} as const;

function positiveWholeDays(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : fallback;
}

function cpxCoinsFromUSD(payoutUSD: number): number {
  const raw = process.env["CPX_RESEARCH_COINS_PER_USD"];
  const rate = raw ? Number(raw) : 5000;
  return Math.round(payoutUSD * (Number.isFinite(rate) && rate > 0 ? rate : 5000));
}

function coinsFromUSDForProvider(payoutUSD: number, provider: Provider): number {
  return provider === "cpx" ? cpxCoinsFromUSD(payoutUSD) : calculateCoinsFromUSD(payoutUSD, provider);
}

function legacyProvider(provider: Provider): Parameters<typeof storeManualReviewOfferEvent>[0]["provider"] {
  return provider as Parameters<typeof storeManualReviewOfferEvent>[0]["provider"];
}

function legacyOfferEventProvider(provider: Provider): OfferEventDocument["provider"] {
  return provider as OfferEventDocument["provider"];
}

export function getProviderHoldDays(provider: Provider, settings: ProviderHoldSettings = {}): number {
  switch (provider) {
    case "monlix":
      return positiveWholeDays(settings.monlixHoldDays, PROVIDER_REWARD_HOLD_POLICY.monlix.holdDays);
    case "ayet":
      return positiveWholeDays(settings.ayetHoldDays, PROVIDER_REWARD_HOLD_POLICY.ayet.holdDays);
    case "tapjoy":
      return positiveWholeDays(settings.tapjoyHoldDays, PROVIDER_REWARD_HOLD_POLICY.tapjoy.holdDays);
    case "pubscale":
      return positiveWholeDays(settings.pubscaleHoldDays, PROVIDER_REWARD_HOLD_POLICY.pubscale.holdDays);
    case "cpx":
      return positiveWholeDays(settings.cpxHoldDays, PROVIDER_REWARD_HOLD_POLICY.cpx.holdDays);
    default:
      return PROVIDER_REWARD_HOLD_POLICY.monlix.holdDays;
  }
}

function ledgerRef(transactionId?: string) {
  const db = getFirestoreDb();
  return transactionId ? db.collection("coinTransactions").doc(transactionId) : db.collection("coinTransactions").doc();
}

function ledgerPayload(params: {
  transactionId: string;
  deviceId: string;
  type: LedgerType;
  coinsChange: number;
  pkrChange: number;
  balanceAfterCoins: number;
  balanceAfterPKR: number;
  source: string;
  status: string;
  metadata?: Record<string, unknown>;
}) {
  return {
    transactionId: params.transactionId,
    deviceId: params.deviceId,
    type: params.type,
    coinsChange: params.coinsChange,
    pkrChange: Number(params.pkrChange.toFixed(2)),
    balanceAfterCoins: params.balanceAfterCoins,
    balanceAfterPKR: Number(params.balanceAfterPKR.toFixed(2)),
    source: params.source,
    status: params.status,
    metadata: params.metadata ?? {},
    createdAt: nowTs(),
  };
}

export async function creditOfferwallRewardWithPolicy(params: {
  deviceId: string;
  provider: Provider;
  externalTransactionId: string;
  payoutUSD?: number;
  coinsOverride?: number | null;
  offerName?: string;
  offerCategory?: OfferCategory;
  rawPayload: Record<string, unknown>;
  status?: "completed" | "rejected" | "chargeback";
}) {
  const db = getFirestoreDb();
  const { provider, deviceId, externalTransactionId } = params;

  if (!externalTransactionId || externalTransactionId.trim().length < 3) {
    throw new HttpError(400, "Missing provider transaction ID.", "missing_transaction_id");
  }

  const payoutUSD = Number.isFinite(params.payoutUSD) && Number(params.payoutUSD) > 0 ? Number(params.payoutUSD) : 0;
  const coinsOverride = Number.isFinite(params.coinsOverride) && Number(params.coinsOverride) > 0
    ? Math.round(Number(params.coinsOverride))
    : null;

  if (!coinsOverride && payoutUSD <= 0) {
    return storeManualReviewOfferEvent({
      deviceId,
      provider: legacyProvider(provider),
      externalTransactionId,
      payoutUSD: 0,
      coinsOverride: null,
      offerName: params.offerName,
      offerCategory: params.offerCategory,
      rawPayload: params.rawPayload,
      reason: "Missing or invalid payoutUSD/coin amount",
    });
  }

  const dedupeKey = `${provider}:${externalTransactionId}`;
  const dedupeRef = db.collection("webhookDedupe").doc(dedupeKey);

  return db.runTransaction(async (tx) => {
    const dedupeSnap = await tx.get(dedupeRef);
    if (dedupeSnap.exists) {
      tx.set(dedupeRef, { duplicate: true, lastSeenAt: nowTs(), attempts: admin.firestore.FieldValue.increment(1) }, { merge: true });
      return { success: true, duplicate: true, message: "Duplicate webhook ignored." };
    }

    const { ref, user } = await requireUser(tx, deviceId);

    const coinsCalculated = coinsOverride ?? coinsFromUSDForProvider(payoutUSD, provider);
    const offerCategory = params.offerCategory ?? determineOfferCategory(params.offerName, params.rawPayload);
    const settings = await getAppSettings();
    const settingsWithHolds = settings as typeof settings & ProviderHoldSettings;
    const largeThresholdUSD = settings.largeRewardManualReviewUSD ?? 5;
    const isLargeReward = payoutUSD >= largeThresholdUSD;

    const holdDays = getProviderHoldDays(provider, settingsWithHolds);
    const verificationHoldUntil = new Date(Date.now() + holdDays * 24 * 60 * 60 * 1000);
    const providerPolicy = PROVIDER_REWARD_HOLD_POLICY[provider];

    const needsManualReview = isLargeReward || user.manualReviewRequired || user.suspiciousScore > 3;
    const eventStatus: OfferEventStatus = needsManualReview ? "manual_review_required" : "pending_verification";

    const eventRef = db.collection("offerEvents").doc();
    const eventId = eventRef.id;
    const txRef = ledgerRef();
    const transactionId = txRef.id;

    const pendingAfter = (user.pendingCoinsBalance ?? 0) + coinsCalculated;
    const confirmedBalance = user.confirmedCoinsBalance ?? user.coinsBalance ?? 0;

    tx.update(ref, {
      pendingCoinsBalance: pendingAfter,
      totalEarnedCoins: (user.totalEarnedCoins ?? 0) + coinsCalculated,
      updatedAt: nowTs(),
      lastActiveAt: nowTs(),
    });

    tx.set(eventRef, {
      eventId,
      provider: legacyOfferEventProvider(provider),
      externalTransactionId,
      deviceId,
      firebaseUid: user.firebaseUid ?? null,
      offerName: params.offerName ?? "Unknown Offer",
      offerCategory,
      payoutUSD,
      coinsCalculated,
      status: eventStatus,
      rawPayload: params.rawPayload,
      verificationHoldUntil: admin.firestore.Timestamp.fromDate(verificationHoldUntil),
      createdAt: nowTs(),
      updatedAt: nowTs(),
      confirmedAt: null,
      rejectedAt: null,
      reversedAt: null,
      rejectionReason: null,
      reversalReason: null,
      manualReviewRequired: needsManualReview,
      transactionId,
    } as OfferEventDocument);

    tx.set(txRef, ledgerPayload({
      transactionId,
      deviceId,
      type: "offerwall_pending",
      coinsChange: coinsCalculated,
      pkrChange: coinsToPKR(coinsCalculated),
      balanceAfterCoins: confirmedBalance,
      balanceAfterPKR: coinsToPKR(confirmedBalance),
      source: provider,
      status: eventStatus,
      metadata: {
        eventId,
        provider,
        externalTransactionId,
        payoutUSD,
        coinsCalculated,
        offerName: params.offerName ?? "Unknown Offer",
        offerCategory,
        holdDays,
        providerNormalWindow: providerPolicy.normalWindow,
        providerPaymentDelay: providerPolicy.paymentDelay,
        providerWorkload: providerPolicy.workload,
        verificationHoldUntil: verificationHoldUntil.toISOString(),
        manualReviewRequired: needsManualReview,
      },
    }));

    tx.set(dedupeRef, {
      provider,
      externalTransactionId,
      deviceId,
      eventId,
      transactionId,
      createdAt: nowTs(),
      payoutUSD,
      coinsCalculated,
      holdDays,
      providerPaymentDelay: providerPolicy.paymentDelay,
      verificationHoldUntil: admin.firestore.Timestamp.fromDate(verificationHoldUntil),
    });

    return {
      success: true,
      duplicate: false,
      message: needsManualReview
        ? `Reward stored for manual review. +${coinsCalculated} pending coins.`
        : `Reward credited to pending. +${coinsCalculated} pending coins. Hold: ${holdDays} days.`,
      eventId,
      coinsCalculated,
      status: eventStatus,
      holdDays,
      pendingAfter,
    };
  });
}
