import admin from "firebase-admin";
import { logger } from "../lib/logger.js";

let initialized = false;

export class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, message: string, code = "request_failed") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function handleRouteError(err: unknown, fallback = "Request failed") {
  if (err instanceof HttpError) {
    return { status: err.status, body: { error: err.message, code: err.code } };
  }
  const message = err instanceof Error ? err.message : fallback;
  if (message.includes("Firebase") || message.includes("FIREBASE")) {
    return {
      status: 500,
      body: {
        error: "Backend Firebase configuration is missing or invalid. Check FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY.",
        code: "firebase_config_missing",
      },
    };
  }
  return { status: 500, body: { error: fallback, code: "internal_error" } };
}

function getFirebaseAdminApp() {
  if (!initialized) {
    const projectId = process.env["FIREBASE_PROJECT_ID"];
    const clientEmail = process.env["FIREBASE_CLIENT_EMAIL"];
    const privateKey = process.env["FIREBASE_PRIVATE_KEY"]?.replace(/\\n/g, "\n");

    if (!projectId) {
      logger.warn("FIREBASE_PROJECT_ID not set — Firestore operations will fail until configured");
    }

    if (admin.apps.length === 0) {
      if (clientEmail && privateKey && projectId) {
        admin.initializeApp({
          credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
        });
      } else {
        admin.initializeApp(projectId ? { projectId } : undefined);
      }
    }

    initialized = true;
  }

  return admin.app();
}

export function getFirestoreDb() {
  getFirebaseAdminApp();
  return admin.firestore();
}

export async function verifyFirebaseToken(firebaseToken?: string | null) {
  if (!firebaseToken) return null;
  getFirebaseAdminApp();
  try {
    return await admin.auth().verifyIdToken(firebaseToken);
  } catch {
    return null;
  }
}

export function nowTs() {
  return admin.firestore.Timestamp.now();
}

let _settingsCache: AppSettings | null = null;
let _settingsCacheTime = 0;
const SETTINGS_CACHE_MS = 30000;

export function coinsToPKR(coins: number, settings?: Pick<AppSettings, "coinRateCoins" | "coinRatePKR">): number {
  const s = settings ?? _settingsCache ?? DEFAULT_SETTINGS;
  const rateCoins = s.coinRateCoins ?? 1000;
  const ratePKR = s.coinRatePKR ?? 20;
  if (!rateCoins || !ratePKR) return 0;
  return Number(((coins / rateCoins) * ratePKR).toFixed(2));
}

export function pkrToCoins(pkr: number, settings?: Pick<AppSettings, "coinRateCoins" | "coinRatePKR">): number {
  const s = settings ?? _settingsCache ?? DEFAULT_SETTINGS;
  const rateCoins = s.coinRateCoins ?? 1000;
  const ratePKR = s.coinRatePKR ?? 20;
  if (!rateCoins || !ratePKR) return 0;
  return Math.round((pkr / ratePKR) * rateCoins);
}

export function getTodayString(tz = "Asia/Karachi"): string {
  try {
    return new Date().toLocaleDateString("en-CA", { timeZone: tz });
  } catch {
    return new Date().toISOString().split("T")[0];
  }
}

export function getCurrentMonthString(tz = "Asia/Karachi"): string {
  try {
    const d = new Date();
    const year = d.toLocaleDateString("en-CA", { timeZone: tz, year: "numeric" });
    const month = d.toLocaleDateString("en-CA", { timeZone: tz, month: "2-digit" });
    return `${year}-${month}`;
  } catch {
    return new Date().toISOString().slice(0, 7);
  }
}

export interface AppSettings {
  coinRateCoins: number;
  coinRatePKR: number;
  minimumWithdrawalPKR: number;
  spinDailyLimit: number;
  scratchDailyLimit: number;
  checkInCoins: number;
  checkInEnergy: number;
  spinEnergyReward: number;
  scratchEnergyReward: number;
  withdrawalDayText: string;
  maintenanceMode: boolean;
  unityRewardedEnergy: number;
  largeRewardManualReviewUSD: number;
  normalHoldDays: number;
  newUserHoldDays: number;
  freeTaskSlots: number;
  energyPerExtraSlot: number;
  maxExtraSlots: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  coinRateCoins: 1000,
  coinRatePKR: 20,
  minimumWithdrawalPKR: 500,
  spinDailyLimit: 5,
  scratchDailyLimit: 5,
  checkInCoins: 0,
  checkInEnergy: 1,
  spinEnergyReward: 1,
  scratchEnergyReward: 1,
  withdrawalDayText: "Withdrawals are reviewed manually before payout.",
  maintenanceMode: false,
  unityRewardedEnergy: 1,
  largeRewardManualReviewUSD: 5,
  normalHoldDays: 7,
  newUserHoldDays: 14,
  freeTaskSlots: 3,
  energyPerExtraSlot: 5,
  maxExtraSlots: 3,
};

export interface FirestoreUser {
  deviceId: string;
  installId: string | null;
  deviceFingerprint: string | null;
  deviceInfo: Record<string, unknown> | null;
  firebaseUid: string | null;
  authMode: "firebase-anonymous" | "device-only";
  authVerified: boolean;
  // Legacy single balance - kept for backward compatibility, maps to confirmedCoinsBalance
  coinsBalance: number;
  pkrBalance: number;
  // New multi-balance system
  energyBalance: number;
  pendingCoinsBalance: number;
  confirmedCoinsBalance: number;
  totalEarnedCoins: number;
  // Daily limits
  lastCheckInTimestamp: admin.firestore.Timestamp | null;
  dailySpinsUsed: number;
  dailyScratchUsed: number;
  lastSpinResetDate: string | null;
  lastScratchResetDate: string | null;
  // Task slots
  taskSlotsUsedToday: number;
  lastTaskSlotResetDate: string | null;
  extraSlotsUnlocked: number;
  // Status
  isBanned: boolean;
  banReason: string | null;
  bannedAt: admin.firestore.Timestamp | null;
  suspiciousScore: number;
  fraudFlags: string[];
  manualReviewRequired: boolean;
  firstWithdrawalCompleted: boolean;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
  lastActiveAt: admin.firestore.Timestamp;
}

export interface InitUserInput {
  deviceId: string;
  installId?: string | null;
  deviceFingerprint?: string | null;
  firebaseUid?: string | null;
  firebaseToken?: string | null;
  authMode?: "firebase-anonymous" | "device-only";
  authVerified?: boolean;
  deviceInfo?: Record<string, unknown> | null;
}

export type LedgerType =
  | "checkin"
  | "spin"
  | "scratch"
  | "offerwall_pending"
  | "offerwall_confirmed"
  | "offerwall_rejected"
  | "offerwall_reversed"
  | "unity_reward_energy"
  | "unity_interstitial"
  | "withdrawal_hold"
  | "withdrawal_refund"
  | "admin_adjustment"
  | "energy_purchase_slot";

export type OfferEventStatus = "pending_verification" | "confirmed" | "rejected" | "reversed" | "manual_review_required";
export type OfferCategory = "game" | "survey" | "app_install" | "high_reward" | "partner_task" | "unknown";
export type AdEventStatus = "completed" | "shown" | "failed" | "skipped";

export interface WithdrawalDocument {
  withdrawalId: string;
  deviceId: string;
  paymentMethod: "Easypaisa" | "JazzCash";
  accountNumber: string;
  accountTitle: string;
  amountPKR: number;
  coinsDeducted: number;
  status: "pending" | "approved" | "rejected" | "paid";
  adminNote: string | null;
  rejectionReason: string | null;
  createdMonth: string;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
  processedAt: admin.firestore.Timestamp | null;
  paidAt: admin.firestore.Timestamp | null;
}

export interface OfferEventDocument {
  eventId: string;
  provider: "monlix" | "tapjoy" | "ayet" | "pubscale";
  externalTransactionId: string;
  deviceId: string;
  firebaseUid: string | null;
  offerName: string;
  offerCategory: OfferCategory;
  payoutUSD: number;
  coinsCalculated: number;
  status: OfferEventStatus;
  rawPayload: Record<string, unknown>;
  verificationHoldUntil: admin.firestore.Timestamp | null;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
  confirmedAt: admin.firestore.Timestamp | null;
  rejectedAt: admin.firestore.Timestamp | null;
  reversedAt: admin.firestore.Timestamp | null;
  rejectionReason: string | null;
  reversalReason: string | null;
  manualReviewRequired: boolean;
  transactionId: string | null;
}

export interface AdEventDocument {
  eventId: string;
  provider: "unity";
  deviceId: string;
  adType: "rewarded" | "interstitial";
  placementId: string | null;
  status: AdEventStatus;
  energyGiven: number;
  estimatedRevenueUSD: number | null;
  metadata: Record<string, unknown>;
  createdAt: admin.firestore.Timestamp;
}

export async function getAppSettings(): Promise<AppSettings> {
  const now = Date.now();
  if (_settingsCache && now - _settingsCacheTime < SETTINGS_CACHE_MS) {
    return _settingsCache;
  }
  const db = getFirestoreDb();
  const snap = await db.collection("settings").doc("app").get();
  const merged = snap.exists
    ? { ...DEFAULT_SETTINGS, ...(snap.data() as Partial<AppSettings>) }
    : DEFAULT_SETTINGS;
  _settingsCache = merged;
  _settingsCacheTime = now;
  return merged;
}

function baseUser(input: InitUserInput): FirestoreUser {
  const now = nowTs();
  const today = getTodayString();
  return {
    deviceId: input.deviceId,
    installId: input.installId ?? null,
    deviceFingerprint: input.deviceFingerprint ?? null,
    deviceInfo: input.deviceInfo ?? null,
    firebaseUid: input.firebaseUid ?? null,
    authMode: input.authMode ?? "device-only",
    authVerified: Boolean(input.authVerified),
    coinsBalance: 0,
    pkrBalance: 0,
    energyBalance: 0,
    pendingCoinsBalance: 0,
    confirmedCoinsBalance: 0,
    totalEarnedCoins: 0,
    lastCheckInTimestamp: null,
    dailySpinsUsed: 0,
    dailyScratchUsed: 0,
    lastSpinResetDate: today,
    lastScratchResetDate: today,
    taskSlotsUsedToday: 0,
    lastTaskSlotResetDate: today,
    extraSlotsUnlocked: 0,
    isBanned: false,
    banReason: null,
    bannedAt: null,
    suspiciousScore: 0,
    fraudFlags: [],
    manualReviewRequired: false,
    firstWithdrawalCompleted: false,
    createdAt: now,
    updatedAt: now,
    lastActiveAt: now,
  };
}

export function serializeTimestamp(value: unknown): unknown {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return value ?? null;
}

export function serializeDoc<T extends Record<string, unknown>>(data: T) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, serializeTimestamp(value)]));
}

export function serializeUser(user: FirestoreUser) {
  return serializeDoc(user as unknown as Record<string, unknown>);
}

function mergeSafeUserMetadata(existing: Partial<FirestoreUser>, input: InitUserInput): Partial<FirestoreUser> {
  const update: Partial<FirestoreUser> = {
    lastActiveAt: nowTs(),
    updatedAt: nowTs(),
  };

  if (!existing.installId && input.installId) update.installId = input.installId;
  if (!existing.deviceFingerprint && input.deviceFingerprint) update.deviceFingerprint = input.deviceFingerprint;
  if (!existing.firebaseUid && input.firebaseUid) update.firebaseUid = input.firebaseUid;
  if (input.authMode) update.authMode = input.authMode;
  if (typeof input.authVerified === "boolean") update.authVerified = input.authVerified;
  if (input.deviceInfo) update.deviceInfo = input.deviceInfo;

  // Migrate old single-balance users to new multi-balance on login
  if (typeof existing.coinsBalance === "number" && typeof existing.confirmedCoinsBalance !== "number") {
    update.confirmedCoinsBalance = existing.coinsBalance;
    update.pendingCoinsBalance = 0;
    update.energyBalance = 0;
  }
  // Keep coinsBalance in sync with confirmedCoinsBalance
  if (typeof existing.confirmedCoinsBalance === "number") {
    update.coinsBalance = existing.confirmedCoinsBalance;
  }

  return update;
}

export async function initUser(input: InitUserInput): Promise<{ user: FirestoreUser; duplicateRestored: boolean; authWarning?: string }> {
  const db = getFirestoreDb();
  const verifiedToken = await verifyFirebaseToken(input.firebaseToken);
  const authWarning = input.firebaseToken && !verifiedToken ? "Firebase token verification failed; using device identity fallback." : undefined;

  const normalized: InitUserInput = {
    ...input,
    firebaseUid: verifiedToken?.uid ?? input.firebaseUid ?? null,
    authMode: verifiedToken ? "firebase-anonymous" : input.authMode ?? "device-only",
    authVerified: Boolean(verifiedToken) || Boolean(input.authVerified && input.authMode === "firebase-anonymous"),
  };

  let duplicateRestored = false;
  const ref = db.collection("users").doc(normalized.deviceId);
  const snap = await ref.get();

  if (snap.exists) {
    const existing = snap.data() as FirestoreUser;
    await ref.set(mergeSafeUserMetadata(existing, normalized), { merge: true });
    const updated = await ref.get();
    return { user: updated.data() as FirestoreUser, duplicateRestored, authWarning };
  }

  if (normalized.deviceFingerprint) {
    const dup = await db
      .collection("users")
      .where("deviceFingerprint", "==", normalized.deviceFingerprint)
      .limit(1)
      .get();
    if (!dup.empty) {
      const dupRef = dup.docs[0].ref;
      const existing = dup.docs[0].data() as FirestoreUser;
      await dupRef.set(
        {
          ...mergeSafeUserMetadata(existing, normalized),
          suspiciousScore: Math.max(existing.suspiciousScore ?? 0, 1),
          fraudFlags: Array.from(new Set([...(existing.fraudFlags ?? []), "duplicate_device_fingerprint"])),
          duplicateDeviceIds: admin.firestore.FieldValue.arrayUnion(normalized.deviceId),
        },
        { merge: true },
      );
      duplicateRestored = true;
      const updated = await dupRef.get();
      return { user: updated.data() as FirestoreUser, duplicateRestored, authWarning };
    }
  }

  const user = baseUser(normalized);
  await ref.set(user);
  return { user, duplicateRestored, authWarning };
}

export async function getUserDoc(deviceId: string): Promise<FirestoreUser | null> {
  const snap = await getFirestoreDb().collection("users").doc(deviceId).get();
  return snap.exists ? (snap.data() as FirestoreUser) : null;
}

export async function requireUser(tx: admin.firestore.Transaction, deviceId: string) {
  const ref = getFirestoreDb().collection("users").doc(deviceId);
  const snap = await tx.get(ref);
  if (!snap.exists) throw new HttpError(404, "User not found", "user_not_found");
  const user = snap.data() as FirestoreUser;
  if (user.isBanned) throw new HttpError(403, user.banReason ? `Account banned: ${user.banReason}` : "Account banned", "user_banned");
  return { ref, user };
}

export function randomId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
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

export async function creditCheckIn(deviceId: string) {
  const settings = await getAppSettings();
  const db = getFirestoreDb();

  return db.runTransaction(async (tx) => {
    const { ref, user } = await requireUser(tx, deviceId);
    if (user.lastCheckInTimestamp) {
      const hoursSince = (Date.now() - user.lastCheckInTimestamp.toDate().getTime()) / 3600000;
      if (hoursSince < 24) throw new HttpError(400, "Check-in is available once every 24 hours.", "checkin_not_ready");
    }

    const energyAwarded = settings.checkInEnergy;
    const balanceAfterEnergy = (user.energyBalance ?? 0) + energyAwarded;
    const txRef = ledgerRef();
    const transactionId = txRef.id;

    tx.update(ref, {
      energyBalance: balanceAfterEnergy,
      lastCheckInTimestamp: nowTs(),
      updatedAt: nowTs(),
      lastActiveAt: nowTs(),
    });
    tx.set(txRef, ledgerPayload({
      transactionId,
      deviceId,
      type: "checkin",
      coinsChange: 0,
      pkrChange: 0,
      balanceAfterCoins: user.confirmedCoinsBalance ?? user.coinsBalance ?? 0,
      balanceAfterPKR: user.pkrBalance ?? 0,
      source: "checkin",
      status: "credited",
      metadata: { energyAwarded, rewardType: "energy" },
    }));

    return { success: true, message: `Check-in successful! +${energyAwarded} Energy`, energyAwarded, balanceAfterEnergy };
  });
}

export const SPIN_REWARDS = [1, 1, 1, 1, 1, 1] as const;
export const SCRATCH_REWARDS = [1, 1, 1, 1, 1, 1] as const;

export async function creditSpin(deviceId: string) {
  const settings = await getAppSettings();
  const db = getFirestoreDb();
  const today = getTodayString();

  return db.runTransaction(async (tx) => {
    const { ref, user } = await requireUser(tx, deviceId);
    const spinsUsed = user.lastSpinResetDate === today ? user.dailySpinsUsed ?? 0 : 0;
    if (spinsUsed >= settings.spinDailyLimit) {
      throw new HttpError(400, `Daily spin limit reached (${settings.spinDailyLimit}/${settings.spinDailyLimit}).`, "daily_spin_limit_reached");
    }

    // Spin gives Energy only
    const energyAwarded = settings.spinEnergyReward;
    const balanceAfterEnergy = (user.energyBalance ?? 0) + energyAwarded;
    const txRef = ledgerRef();
    const transactionId = txRef.id;

    tx.update(ref, {
      energyBalance: balanceAfterEnergy,
      dailySpinsUsed: spinsUsed + 1,
      lastSpinResetDate: today,
      updatedAt: nowTs(),
      lastActiveAt: nowTs(),
    });
    tx.set(txRef, ledgerPayload({
      transactionId,
      deviceId,
      type: "spin",
      coinsChange: 0,
      pkrChange: 0,
      balanceAfterCoins: user.confirmedCoinsBalance ?? user.coinsBalance ?? 0,
      balanceAfterPKR: user.pkrBalance ?? 0,
      source: "spin",
      status: "credited",
      metadata: { dailySpinLimit: settings.spinDailyLimit, rewardSegments: SPIN_REWARDS, energyAwarded, rewardType: "energy" },
    }));

    return {
      success: true,
      message: `You won ${energyAwarded} Energy!`,
      energyAwarded,
      spinsLeft: settings.spinDailyLimit - (spinsUsed + 1),
      balanceAfterEnergy,
    };
  });
}

export async function creditScratch(deviceId: string) {
  const settings = await getAppSettings();
  const db = getFirestoreDb();
  const today = getTodayString();

  return db.runTransaction(async (tx) => {
    const { ref, user } = await requireUser(tx, deviceId);
    const scratchesUsed = user.lastScratchResetDate === today ? user.dailyScratchUsed ?? 0 : 0;
    if (scratchesUsed >= settings.scratchDailyLimit) {
      throw new HttpError(400, `Daily scratch limit reached (${settings.scratchDailyLimit}/${settings.scratchDailyLimit}).`, "daily_scratch_limit_reached");
    }

    // Scratch gives Energy only
    const energyAwarded = settings.scratchEnergyReward;
    const balanceAfterEnergy = (user.energyBalance ?? 0) + energyAwarded;
    const txRef = ledgerRef();
    const transactionId = txRef.id;

    tx.update(ref, {
      energyBalance: balanceAfterEnergy,
      dailyScratchUsed: scratchesUsed + 1,
      lastScratchResetDate: today,
      updatedAt: nowTs(),
      lastActiveAt: nowTs(),
    });
    tx.set(txRef, ledgerPayload({
      transactionId,
      deviceId,
      type: "scratch",
      coinsChange: 0,
      pkrChange: 0,
      balanceAfterCoins: user.confirmedCoinsBalance ?? user.coinsBalance ?? 0,
      balanceAfterPKR: user.pkrBalance ?? 0,
      source: "scratch",
      status: "credited",
      metadata: { dailyScratchLimit: settings.scratchDailyLimit, rewardSegments: SCRATCH_REWARDS, energyAwarded, rewardType: "energy" },
    }));

    return { success: true, message: `You won ${energyAwarded} Energy!`, energyAwarded, scratchLeft: settings.scratchDailyLimit - (scratchesUsed + 1), balanceAfterEnergy };
  });
}

// ========================
// Offerwall / Provider Webhooks
// ========================

export function getProviderCoinRate(provider: "monlix" | "tapjoy" | "ayet" | "pubscale"): number {
  const envMap: Record<"monlix" | "tapjoy" | "ayet" | "pubscale", string> = {
    monlix: "MONLIX_COINS_PER_USD",
    tapjoy: "TAPJOY_COINS_PER_USD",
    ayet: "AYET_COINS_PER_USD",
    pubscale: "PUBSCALE_COINS_PER_USD",
  };
  const raw = provider === "ayet"
    ? (process.env["AYET_COINS_PER_USD"] ?? process.env["AYET_USD_TO_COINS"])
    : process.env[envMap[provider]];
  const rate = raw ? Number(raw) : 1000;
  return Number.isFinite(rate) && rate > 0 ? rate : 1000;
}

export function calculateCoinsFromUSD(payoutUSD: number, provider: "monlix" | "tapjoy" | "ayet" | "pubscale"): number {
  const rate = getProviderCoinRate(provider);
  return Math.round(payoutUSD * rate);
}

export async function storeManualReviewOfferEvent(params: {
  deviceId: string;
  provider: "monlix" | "tapjoy" | "ayet" | "pubscale";
  externalTransactionId: string;
  payoutUSD?: number;
  coinsOverride?: number | null;
  offerName?: string;
  offerCategory?: OfferCategory;
  rawPayload: Record<string, unknown>;
  reason: string;
}) {
  const db = getFirestoreDb();
  const { provider, deviceId, externalTransactionId } = params;
  if (!externalTransactionId || externalTransactionId.trim().length < 3) {
    throw new HttpError(400, "Missing provider transaction ID.", "missing_transaction_id");
  }

  const dedupeKey = `manual:${provider}:${externalTransactionId}`;
  const dedupeRef = db.collection("webhookDedupe").doc(dedupeKey);

  return db.runTransaction(async (tx) => {
    const dedupeSnap = await tx.get(dedupeRef);
    if (dedupeSnap.exists) {
      tx.set(dedupeRef, { duplicate: true, lastSeenAt: nowTs(), attempts: admin.firestore.FieldValue.increment(1) }, { merge: true });
      return { success: true, duplicate: true, manualReviewRequired: true, message: "Duplicate manual-review webhook ignored." };
    }

    const payoutUSD = Number.isFinite(params.payoutUSD) && Number(params.payoutUSD) > 0 ? Number(params.payoutUSD) : 0;
    const coinsOverride = Number.isFinite(params.coinsOverride) && Number(params.coinsOverride) > 0
      ? Math.round(Number(params.coinsOverride))
      : null;
    const coinsCalculated = coinsOverride ?? (payoutUSD > 0 ? calculateCoinsFromUSD(payoutUSD, provider) : 0);
    const eventRef = db.collection("offerEvents").doc();
    const eventId = eventRef.id;

    tx.set(eventRef, {
      eventId,
      provider,
      externalTransactionId,
      deviceId,
      firebaseUid: null,
      offerName: params.offerName ?? "Unknown Offer",
      offerCategory: params.offerCategory ?? determineOfferCategory(params.offerName, params.rawPayload),
      payoutUSD,
      coinsCalculated,
      status: "manual_review_required",
      rawPayload: params.rawPayload,
      verificationHoldUntil: null,
      createdAt: nowTs(),
      updatedAt: nowTs(),
      confirmedAt: null,
      rejectedAt: null,
      reversedAt: null,
      rejectionReason: null,
      reversalReason: params.reason,
      manualReviewRequired: true,
      transactionId: null,
    } as OfferEventDocument);

    tx.set(dedupeRef, {
      provider,
      externalTransactionId,
      deviceId,
      eventId,
      createdAt: nowTs(),
      payoutUSD,
      coinsCalculated,
      manualReviewReason: params.reason,
    });

    return { success: true, duplicate: false, manualReviewRequired: true, message: "Webhook stored for manual review without crediting balances.", eventId, coinsCalculated };
  });
}

export function determineOfferCategory(offerName?: string, payload?: Record<string, unknown>): OfferCategory {
  const name = (offerName ?? "").toLowerCase();
  const catFromPayload = String(payload?.category ?? payload?.offer_category ?? "").toLowerCase();
  const combined = `${name} ${catFromPayload}`;

  if (combined.includes("survey")) return "survey";
  if (combined.includes("install") || combined.includes("app") || combined.includes("signup") || combined.includes("trial")) return "app_install";
  if (combined.includes("game") || combined.includes("level") || combined.includes("play") || combined.includes("mission")) return "game";
  if (combined.includes("premium") || combined.includes("high") || combined.includes("large") || combined.includes("big")) return "high_reward";
  if (combined.includes("partner")) return "partner_task";
  return "unknown";
}

export async function creditOfferwallReward(params: {
  deviceId: string;
  provider: "monlix" | "tapjoy" | "ayet" | "pubscale";
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
      provider,
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

    const coinsCalculated = coinsOverride ?? calculateCoinsFromUSD(payoutUSD, provider);
    const offerCategory = params.offerCategory ?? determineOfferCategory(params.offerName, params.rawPayload);
    const settings = await getAppSettings();
    const largeThresholdUSD = settings.largeRewardManualReviewUSD ?? 5;
    const isLargeReward = payoutUSD >= largeThresholdUSD;

    // Determine hold period
    const isNewUser = !user.firstWithdrawalCompleted;
    const holdDays = isNewUser ? settings.newUserHoldDays ?? 14 : settings.normalHoldDays ?? 7;
    const verificationHoldUntil = new Date(Date.now() + holdDays * 24 * 60 * 60 * 1000);

    // Check if manual review needed
    const needsManualReview = isLargeReward || user.manualReviewRequired || user.suspiciousScore > 3;
    const eventStatus: OfferEventStatus = needsManualReview ? "manual_review_required" : "pending_verification";

    const eventRef = db.collection("offerEvents").doc();
    const eventId = eventRef.id;
    const txRef = ledgerRef();
    const transactionId = txRef.id;

    // Credit pendingCoinsBalance only (never confirmed directly)
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
      provider,
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
      pendingAfter,
    };
  });
}

export async function handleOfferwallReversal(params: {
  provider: "monlix" | "tapjoy" | "ayet" | "pubscale";
  externalTransactionId: string;
  reason?: string;
}) {
  const db = getFirestoreDb();
  const { provider, externalTransactionId } = params;

  // Reversal dedupe: if we already processed a reversal for this event, no-op
  const reversalDedupeKey = `reversal:${provider}:${externalTransactionId}`;
  const reversalDedupeRef = db.collection("webhookDedupe").doc(reversalDedupeKey);
  const reversalDedupeSnap = await reversalDedupeRef.get();
  if (reversalDedupeSnap.exists) {
    return { success: true, message: "Reversal already processed.", duplicate: true };
  }

  // Find the offer event
  const query = db.collection("offerEvents")
    .where("provider", "==", provider)
    .where("externalTransactionId", "==", externalTransactionId)
    .limit(1);
  const snap = await query.get();

  if (snap.empty) {
    // Store a reversal record even if original not found
    const reversalRef = db.collection("offerEvents").doc();
    const reversalReason = params.reason ?? "Original event not found";
    await db.runTransaction(async (tx) => {
      tx.set(reversalRef, {
        eventId: reversalRef.id,
        provider,
        externalTransactionId,
        deviceId: "unknown",
        firebaseUid: null,
        offerName: "Unknown (reversal)",
        offerCategory: "unknown",
        status: "reversed",
        coinsCalculated: 0,
        payoutUSD: 0,
        rawPayload: { reversalReason },
        verificationHoldUntil: null,
        createdAt: nowTs(),
        updatedAt: nowTs(),
        confirmedAt: null,
        rejectedAt: null,
        reversedAt: nowTs(),
        rejectionReason: null,
        reversalReason,
        manualReviewRequired: true,
        transactionId: null,
      } as unknown as OfferEventDocument);
      tx.set(reversalDedupeRef, {
        provider,
        externalTransactionId,
        deviceId: "unknown",
        eventId: reversalRef.id,
        createdAt: nowTs(),
        reversalReason,
      });
    });
    return { success: true, message: "Reversal recorded — original event not found.", eventId: reversalRef.id };
  }

  const eventDoc = snap.docs[0];
  const event = eventDoc.data() as OfferEventDocument;

  return db.runTransaction(async (tx) => {
    const { ref, user } = await requireUser(tx, event.deviceId);
    const coinsToDeduct = event.coinsCalculated;

    // If still pending, deduct from pending
    if (event.status === "pending_verification" || event.status === "manual_review_required") {
      const pendingAfter = Math.max(0, (user.pendingCoinsBalance ?? 0) - coinsToDeduct);
      tx.update(ref, { pendingCoinsBalance: pendingAfter, updatedAt: nowTs() });
      tx.update(eventDoc.ref, {
        status: "reversed",
        reversedAt: nowTs(),
        reversalReason: params.reason ?? "Provider chargeback/reversal",
        updatedAt: nowTs(),
      });

      // Store reversal dedupe record
      tx.set(reversalDedupeRef, {
        provider,
        externalTransactionId,
        deviceId: event.deviceId,
        eventId: event.eventId,
        createdAt: nowTs(),
        reversalReason: params.reason ?? "Provider chargeback/reversal",
      });

      const txRef = ledgerRef();
      tx.set(txRef, ledgerPayload({
        transactionId: txRef.id,
        deviceId: event.deviceId,
        type: "offerwall_reversed",
        coinsChange: -coinsToDeduct,
        pkrChange: -coinsToPKR(coinsToDeduct),
        balanceAfterCoins: user.confirmedCoinsBalance ?? user.coinsBalance ?? 0,
        balanceAfterPKR: user.pkrBalance ?? 0,
        source: provider,
        status: "reversed",
        metadata: {
          eventId: event.eventId,
          provider,
          externalTransactionId,
          reversalReason: params.reason ?? "Provider chargeback/reversal",
          deductedFrom: "pending",
        },
      }));

      return { success: true, message: `Reversed ${coinsToDeduct} pending coins.`, deducted: coinsToDeduct, from: "pending" };
    }

    // If already confirmed, try to deduct from confirmed
    const confirmedAfter = Math.max(0, (user.confirmedCoinsBalance ?? user.coinsBalance ?? 0) - coinsToDeduct);
    const pkrAfter = coinsToPKR(confirmedAfter);

    tx.update(ref, {
      confirmedCoinsBalance: confirmedAfter,
      coinsBalance: confirmedAfter, // keep legacy in sync
      pkrBalance: pkrAfter,
      suspiciousScore: (user.suspiciousScore ?? 0) + 2,
      fraudFlags: admin.firestore.FieldValue.arrayUnion(`${provider}_chargeback_after_confirm`),
      updatedAt: nowTs(),
    });

    tx.update(eventDoc.ref, {
      status: "reversed",
      reversedAt: nowTs(),
      reversalReason: params.reason ?? "Provider chargeback/reversal",
      updatedAt: nowTs(),
    });

    const txRef = ledgerRef();
    tx.set(txRef, ledgerPayload({
      transactionId: txRef.id,
      deviceId: event.deviceId,
      type: "offerwall_reversed",
      coinsChange: -coinsToDeduct,
      pkrChange: -(user.pkrBalance - pkrAfter),
      balanceAfterCoins: confirmedAfter,
      balanceAfterPKR: pkrAfter,
      source: provider,
      status: "reversed",
      metadata: {
        eventId: event.eventId,
        provider,
        externalTransactionId,
        reversalReason: params.reason ?? "Provider chargeback/reversal",
        deductedFrom: "confirmed",
      },
    }));

    // Store reversal dedupe record to prevent double-deduction
    tx.set(reversalDedupeRef, {
      provider,
      externalTransactionId,
      deviceId: event.deviceId,
      eventId: event.eventId,
      createdAt: nowTs(),
      reversalReason: params.reason ?? "Provider chargeback/reversal",
    });

    return { success: true, message: `Reversed ${coinsToDeduct} confirmed coins.`, deducted: coinsToDeduct, from: "confirmed" };
  });
}

// ========================
// Admin confirm/reject/reverse
// ========================

export async function adminConfirmOfferEvent(eventId: string, adminNote?: string) {
  const db = getFirestoreDb();
  const eventRef = db.collection("offerEvents").doc(eventId);
  const eventSnap = await eventRef.get();
  if (!eventSnap.exists) throw new HttpError(404, "Offer event not found.", "offer_event_not_found");
  const event = eventSnap.data() as OfferEventDocument;

  if (event.status === "confirmed") return { success: true, message: "Already confirmed.", eventId };
  if (event.status === "rejected") throw new HttpError(400, "Cannot confirm a rejected event.", "event_already_rejected");
  if (event.status === "reversed") throw new HttpError(400, "Cannot confirm a reversed event.", "event_already_reversed");

  return db.runTransaction(async (tx) => {
    const { ref, user } = await requireUser(tx, event.deviceId);
    const coins = event.coinsCalculated;
    const pendingAfter = Math.max(0, (user.pendingCoinsBalance ?? 0) - coins);
    const confirmedAfter = (user.confirmedCoinsBalance ?? user.coinsBalance ?? 0) + coins;
    const pkrAfter = coinsToPKR(confirmedAfter);

    tx.update(ref, {
      pendingCoinsBalance: pendingAfter,
      confirmedCoinsBalance: confirmedAfter,
      coinsBalance: confirmedAfter,
      pkrBalance: pkrAfter,
      updatedAt: nowTs(),
    });

    tx.update(eventRef, {
      status: "confirmed",
      confirmedAt: nowTs(),
      updatedAt: nowTs(),
      manualReviewRequired: false,
    });

    const txRef = ledgerRef();
    tx.set(txRef, ledgerPayload({
      transactionId: txRef.id,
      deviceId: event.deviceId,
      type: "offerwall_confirmed",
      coinsChange: coins,
      pkrChange: coinsToPKR(coins),
      balanceAfterCoins: confirmedAfter,
      balanceAfterPKR: pkrAfter,
      source: event.provider,
      status: "confirmed",
      metadata: {
        eventId: event.eventId,
        provider: event.provider,
        externalTransactionId: event.externalTransactionId,
        adminNote: adminNote ?? null,
        previousStatus: event.status,
      },
    }));

    return { success: true, message: `Confirmed ${coins} coins.`, eventId, coinsConfirmed: coins };
  });
}

export async function adminRejectOfferEvent(eventId: string, reason: string) {
  const db = getFirestoreDb();
  const eventRef = db.collection("offerEvents").doc(eventId);
  const eventSnap = await eventRef.get();
  if (!eventSnap.exists) throw new HttpError(404, "Offer event not found.", "offer_event_not_found");
  const event = eventSnap.data() as OfferEventDocument;

  if (event.status === "rejected") return { success: true, message: "Already rejected.", eventId };
  if (event.status === "confirmed") throw new HttpError(400, "Cannot reject a confirmed event. Use reverse instead.", "event_already_confirmed");
  if (event.status === "reversed") throw new HttpError(400, "Cannot reject a reversed event.", "event_already_reversed");

  return db.runTransaction(async (tx) => {
    const { ref, user } = await requireUser(tx, event.deviceId);
    const coins = event.coinsCalculated;
    const pendingAfter = Math.max(0, (user.pendingCoinsBalance ?? 0) - coins);

    tx.update(ref, {
      pendingCoinsBalance: pendingAfter,
      suspiciousScore: (user.suspiciousScore ?? 0) + 1,
      updatedAt: nowTs(),
    });

    tx.update(eventRef, {
      status: "rejected",
      rejectedAt: nowTs(),
      rejectionReason: reason,
      updatedAt: nowTs(),
      manualReviewRequired: false,
    });

    const txRef = ledgerRef();
    tx.set(txRef, ledgerPayload({
      transactionId: txRef.id,
      deviceId: event.deviceId,
      type: "offerwall_rejected",
      coinsChange: -coins,
      pkrChange: -coinsToPKR(coins),
      balanceAfterCoins: user.confirmedCoinsBalance ?? user.coinsBalance ?? 0,
      balanceAfterPKR: user.pkrBalance ?? 0,
      source: event.provider,
      status: "rejected",
      metadata: {
        eventId: event.eventId,
        provider: event.provider,
        externalTransactionId: event.externalTransactionId,
        rejectionReason: reason,
      },
    }));

    return { success: true, message: `Rejected ${coins} pending coins.`, eventId, coinsRejected: coins };
  });
}

export async function adminReverseOfferEvent(eventId: string, reason: string) {
  const db = getFirestoreDb();
  const eventRef = db.collection("offerEvents").doc(eventId);
  const eventSnap = await eventRef.get();
  if (!eventSnap.exists) throw new HttpError(404, "Offer event not found.", "offer_event_not_found");
  const event = eventSnap.data() as OfferEventDocument;

  if (event.status === "reversed") return { success: true, message: "Already reversed.", eventId };
  if (event.status !== "confirmed") throw new HttpError(400, "Can only reverse confirmed events.", "event_not_confirmed");

  return db.runTransaction(async (tx) => {
    const { ref, user } = await requireUser(tx, event.deviceId);
    const coins = event.coinsCalculated;
    const confirmedAfter = Math.max(0, (user.confirmedCoinsBalance ?? user.coinsBalance ?? 0) - coins);
    const pkrAfter = coinsToPKR(confirmedAfter);

    tx.update(ref, {
      confirmedCoinsBalance: confirmedAfter,
      coinsBalance: confirmedAfter,
      pkrBalance: pkrAfter,
      suspiciousScore: (user.suspiciousScore ?? 0) + 3,
      fraudFlags: admin.firestore.FieldValue.arrayUnion(`${event.provider}_admin_reversed`),
      updatedAt: nowTs(),
    });

    tx.update(eventRef, {
      status: "reversed",
      reversedAt: nowTs(),
      reversalReason: reason,
      updatedAt: nowTs(),
    });

    const txRef = ledgerRef();
    tx.set(txRef, ledgerPayload({
      transactionId: txRef.id,
      deviceId: event.deviceId,
      type: "offerwall_reversed",
      coinsChange: -coins,
      pkrChange: -(user.pkrBalance - pkrAfter),
      balanceAfterCoins: confirmedAfter,
      balanceAfterPKR: pkrAfter,
      source: event.provider,
      status: "reversed",
      metadata: {
        eventId: event.eventId,
        provider: event.provider,
        externalTransactionId: event.externalTransactionId,
        reversalReason: reason,
        reversedBy: "admin",
      },
    }));

    return { success: true, message: `Reversed ${coins} confirmed coins.`, eventId, coinsReversed: coins };
  });
}

// ========================
// Auto-confirm pending rewards job
// ========================

export async function runConfirmPendingRewardsJob() {
  const db = getFirestoreDb();
  const settings = await getAppSettings();
  const now = nowTs();

  const query = db.collection("offerEvents")
    .where("status", "in", ["pending_verification", "manual_review_required"])
    .where("verificationHoldUntil", "<=", now)
    .limit(200);

  const snap = await query.get();
  const results: { eventId: string; status: string; message: string }[] = [];

  for (const doc of snap.docs) {
    const event = doc.data() as OfferEventDocument;

    try {
      const userRef = db.collection("users").doc(event.deviceId);
      const userSnap = await userRef.get();
      if (!userSnap.exists) {
        results.push({ eventId: event.eventId, status: "skipped", message: "User not found" });
        continue;
      }
      const user = userSnap.data() as FirestoreUser;

      // Skip banned users
      if (user.isBanned) {
        results.push({ eventId: event.eventId, status: "skipped", message: "User banned" });
        continue;
      }

      // Skip manual review required events AND users
      if (event.manualReviewRequired || event.status === "manual_review_required") {
        results.push({ eventId: event.eventId, status: "skipped", message: "Event requires manual review" });
        continue;
      }
      if (user.manualReviewRequired) {
        results.push({ eventId: event.eventId, status: "skipped", message: "User requires manual review" });
        continue;
      }

      // Skip suspicious users (score > 5)
      if ((user.suspiciousScore ?? 0) > 5) {
        results.push({ eventId: event.eventId, status: "skipped", message: "User suspicious score too high" });
        continue;
      }

      // Skip large rewards
      const largeThreshold = settings.largeRewardManualReviewUSD ?? 5;
      if (event.payoutUSD >= largeThreshold) {
        // Mark as manual review but don't auto-confirm
        await doc.ref.set({ status: "manual_review_required", manualReviewRequired: true, updatedAt: nowTs() }, { merge: true });
        results.push({ eventId: event.eventId, status: "skipped", message: `Large reward (USD ${event.payoutUSD}) requires manual review` });
        continue;
      }

      // Confirm the reward
      const result = await adminConfirmOfferEvent(event.eventId, "Auto-confirmed by system job");
      results.push({ eventId: event.eventId, status: "confirmed", message: result.message });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ eventId: event.eventId, status: "error", message: msg });
    }
  }

  return { success: true, processed: results.length, results };
}

// ========================
// Unity Ads
// ========================

export async function recordUnityRewardedComplete(_deviceId: string, _placementId?: string) {
  throw new HttpError(
    501,
    "Unity rewarded Energy is disabled until the real Unity SDK and server-side reward verification are implemented.",
    "unity_reward_not_implemented",
  );
}

export async function recordUnityInterstitialShown(deviceId: string, placementId?: string) {
  const db = getFirestoreDb();

  const eventRef = db.collection("adEvents").doc();
  await eventRef.set({
    eventId: eventRef.id,
    provider: "unity",
    deviceId,
    adType: "interstitial",
    placementId: placementId ?? null,
    status: "shown",
    energyGiven: 0,
    estimatedRevenueUSD: null,
    metadata: { placementId: placementId ?? null },
    createdAt: nowTs(),
  } as AdEventDocument);

  return { success: true, message: "Ad view recorded." };
}

// ========================
// Task Slot System
// ========================

export async function unlockExtraTaskSlot(deviceId: string) {
  const db = getFirestoreDb();
  const settings = await getAppSettings();

  return db.runTransaction(async (tx) => {
    const { ref, user } = await requireUser(tx, deviceId);
    const today = getTodayString();
    const extraSlots = user.extraSlotsUnlocked ?? 0;
    const maxExtra = settings.maxExtraSlots ?? 3;

    if (extraSlots >= maxExtra) {
      throw new HttpError(400, `Maximum extra slots reached (${maxExtra}).`, "max_extra_slots_reached");
    }

    const energyCost = settings.energyPerExtraSlot ?? 5;
    const currentEnergy = user.energyBalance ?? 0;
    if (currentEnergy < energyCost) {
      throw new HttpError(400, `Need ${energyCost} Energy to unlock a slot. You have ${currentEnergy}.`, "insufficient_energy");
    }

    const energyAfter = currentEnergy - energyCost;
    tx.update(ref, {
      energyBalance: energyAfter,
      extraSlotsUnlocked: extraSlots + 1,
      updatedAt: nowTs(),
    });

    const txRef = ledgerRef();
    tx.set(txRef, ledgerPayload({
      transactionId: txRef.id,
      deviceId,
      type: "energy_purchase_slot",
      coinsChange: 0,
      pkrChange: 0,
      balanceAfterCoins: user.confirmedCoinsBalance ?? user.coinsBalance ?? 0,
      balanceAfterPKR: user.pkrBalance ?? 0,
      source: "task_slot",
      status: "spent",
      metadata: { energyCost, slotsAfter: extraSlots + 1 },
    }));

    return { success: true, message: `Unlocked 1 extra task slot for ${energyCost} Energy!`, energyAfter, extraSlots: extraSlots + 1 };
  });
}

// ========================
// Withdrawal (updated for confirmedCoinsBalance only)
// ========================

export async function submitWithdrawal(deviceId: string, input: {
  paymentMethod: "Easypaisa" | "JazzCash";
  accountNumber: string;
  accountTitle: string;
  amountPKR: number;
}) {
  const settings = await getAppSettings();
  if (input.amountPKR < settings.minimumWithdrawalPKR) {
    throw new HttpError(400, `Minimum withdrawal is PKR ${settings.minimumWithdrawalPKR}.`, "minimum_withdrawal_not_met");
  }

  const db = getFirestoreDb();
  const createdMonth = getCurrentMonthString();

  return db.runTransaction(async (tx) => {
    const { ref, user } = await requireUser(tx, deviceId);

    // Only confirmed coins can be withdrawn
    const confirmedBalance = user.confirmedCoinsBalance ?? user.coinsBalance ?? 0;
    const pkrBalance = user.pkrBalance ?? 0;

    if (pkrBalance < input.amountPKR) throw new HttpError(400, "You cannot withdraw more than your available confirmed balance.", "insufficient_balance");

    // Block manual review required users
    if (user.manualReviewRequired) throw new HttpError(403, "Your account is under manual review. Withdrawals are temporarily disabled.", "manual_review_required");

    const pendingQuery = db.collection("withdrawals").where("deviceId", "==", deviceId).where("status", "==", "pending").limit(1);
    const pendingSnap = await tx.get(pendingQuery);
    if (!pendingSnap.empty) throw new HttpError(400, "You already have a pending withdrawal request.", "pending_withdrawal_exists");

    const monthlyQuery = db.collection("withdrawals").where("deviceId", "==", deviceId).where("createdMonth", "==", createdMonth).limit(1);
    const monthlySnap = await tx.get(monthlyQuery);
    if (!monthlySnap.empty) throw new HttpError(400, "Monthly withdrawal limit reached. You can submit one withdrawal per calendar month.", "monthly_withdrawal_limit_reached");

    const coinsDeducted = pkrToCoins(input.amountPKR);
    if (confirmedBalance < coinsDeducted) throw new HttpError(400, "Insufficient confirmed coin balance for this withdrawal.", "insufficient_balance");

    const balanceAfterCoins = confirmedBalance - coinsDeducted;
    const balanceAfterPKR = coinsToPKR(balanceAfterCoins);
    const withdrawalId = randomId("wd");
    const withdrawalRef = db.collection("withdrawals").doc(withdrawalId);
    const txRef = ledgerRef();
    const transactionId = txRef.id;

    tx.update(ref, {
      confirmedCoinsBalance: balanceAfterCoins,
      coinsBalance: balanceAfterCoins, // keep legacy in sync
      pkrBalance: balanceAfterPKR,
      updatedAt: nowTs(),
      lastActiveAt: nowTs(),
    });

    tx.set(withdrawalRef, {
      withdrawalId,
      deviceId,
      paymentMethod: input.paymentMethod,
      accountNumber: input.accountNumber.trim(),
      accountTitle: input.accountTitle.trim(),
      amountPKR: input.amountPKR,
      coinsDeducted,
      status: "pending",
      adminNote: null,
      rejectionReason: null,
      createdMonth,
      createdAt: nowTs(),
      updatedAt: nowTs(),
      processedAt: null,
      paidAt: null,
    } satisfies WithdrawalDocument);

    tx.set(txRef, ledgerPayload({
      transactionId,
      deviceId,
      type: "withdrawal_hold",
      coinsChange: -coinsDeducted,
      pkrChange: -input.amountPKR,
      balanceAfterCoins,
      balanceAfterPKR,
      source: "withdrawal",
      status: "held",
      metadata: { withdrawalId, amountPKR: input.amountPKR },
    }));

    return { success: true, message: "Withdrawal request submitted successfully.", withdrawalId, coinsDeducted, balanceAfterCoins, balanceAfterPKR };
  });
}

export async function rejectWithdrawal(withdrawalId: string, reason: string) {
  const db = getFirestoreDb();
  return db.runTransaction(async (tx) => {
    const withdrawalRef = db.collection("withdrawals").doc(withdrawalId);
    const snap = await tx.get(withdrawalRef);
    if (!snap.exists) throw new HttpError(404, "Withdrawal not found.", "withdrawal_not_found");
    const withdrawal = snap.data() as WithdrawalDocument;
    if (withdrawal.status === "rejected") return { success: true, message: "Withdrawal was already rejected." };
    if (withdrawal.status === "paid") throw new HttpError(400, "Paid withdrawals cannot be rejected.", "withdrawal_already_paid");

    const userRef = db.collection("users").doc(withdrawal.deviceId);
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) throw new HttpError(404, "User not found.", "user_not_found");
    const user = userSnap.data() as FirestoreUser;
    const confirmedAfter = (user.confirmedCoinsBalance ?? user.coinsBalance ?? 0) + withdrawal.coinsDeducted;
    const pkrAfter = coinsToPKR(confirmedAfter);
    const txRef = ledgerRef();
    const transactionId = txRef.id;

    tx.update(userRef, {
      confirmedCoinsBalance: confirmedAfter,
      coinsBalance: confirmedAfter,
      pkrBalance: pkrAfter,
      updatedAt: nowTs(),
    });

    tx.update(withdrawalRef, { status: "rejected", rejectionReason: reason, updatedAt: nowTs(), processedAt: nowTs() });

    tx.set(txRef, ledgerPayload({
      transactionId,
      deviceId: withdrawal.deviceId,
      type: "withdrawal_refund",
      coinsChange: withdrawal.coinsDeducted,
      pkrChange: withdrawal.amountPKR,
      balanceAfterCoins: confirmedAfter,
      balanceAfterPKR: pkrAfter,
      source: "admin",
      status: "refunded",
      metadata: { withdrawalId, reason },
    }));

    return { success: true, message: "Withdrawal rejected and confirmed coins refunded." };
  });
}

export async function markWithdrawalStatus(withdrawalId: string, status: "approved" | "paid", adminNote?: string) {
  const db = getFirestoreDb();
  const ref = db.collection("withdrawals").doc(withdrawalId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(404, "Withdrawal not found.", "withdrawal_not_found");
  const data = snap.data() as WithdrawalDocument;
  if (data.status === "rejected") throw new HttpError(400, "Rejected withdrawals cannot be approved or paid.", "withdrawal_rejected");

  // When marking as paid, set firstWithdrawalCompleted on user
  if (status === "paid") {
    const userRef = db.collection("users").doc(data.deviceId);
    const userSnap = await userRef.get();
    if (userSnap.exists) {
      const user = userSnap.data() as FirestoreUser;
      if (!user.firstWithdrawalCompleted) {
        await userRef.update({ firstWithdrawalCompleted: true, updatedAt: nowTs() });
      }
    }
  }

  await ref.update({
    status,
    adminNote: adminNote ?? data.adminNote ?? null,
    updatedAt: nowTs(),
    processedAt: status === "approved" ? nowTs() : data.processedAt ?? nowTs(),
    paidAt: status === "paid" ? nowTs() : data.paidAt ?? null,
  });
  return { success: true, message: status === "paid" ? "Withdrawal marked as paid." : "Withdrawal approved." };
}

export async function adjustUserCoins(deviceId: string, coinsChange: number, reason: string) {
  const db = getFirestoreDb();
  return db.runTransaction(async (tx) => {
    const userRef = db.collection("users").doc(deviceId);
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new HttpError(404, "User not found.", "user_not_found");
    const user = snap.data() as FirestoreUser;
    const confirmedAfter = Math.max(0, (user.confirmedCoinsBalance ?? user.coinsBalance ?? 0) + coinsChange);
    const actualChange = confirmedAfter - (user.confirmedCoinsBalance ?? user.coinsBalance ?? 0);
    const pkrAfter = coinsToPKR(confirmedAfter);
    const txRef = ledgerRef();
    const transactionId = txRef.id;

    tx.update(userRef, {
      confirmedCoinsBalance: confirmedAfter,
      coinsBalance: confirmedAfter,
      pkrBalance: pkrAfter,
      updatedAt: nowTs(),
    });

    tx.set(txRef, ledgerPayload({
      transactionId,
      deviceId,
      type: "admin_adjustment",
      coinsChange: actualChange,
      pkrChange: coinsToPKR(actualChange),
      balanceAfterCoins: confirmedAfter,
      balanceAfterPKR: pkrAfter,
      source: "admin",
      status: "adjusted",
      metadata: { reason },
    }));

    return { success: true, message: "Coins adjusted.", balanceAfterCoins: confirmedAfter, balanceAfterPKR: pkrAfter };
  });
}

export async function adjustUserEnergy(deviceId: string, energyChange: number, reason: string) {
  const db = getFirestoreDb();
  return db.runTransaction(async (tx) => {
    const userRef = db.collection("users").doc(deviceId);
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new HttpError(404, "User not found.", "user_not_found");
    const user = snap.data() as FirestoreUser;
    const energyAfter = Math.max(0, (user.energyBalance ?? 0) + energyChange);
    const actualChange = energyAfter - (user.energyBalance ?? 0);
    const txRef = ledgerRef();
    const transactionId = txRef.id;

    tx.update(userRef, {
      energyBalance: energyAfter,
      updatedAt: nowTs(),
    });

    tx.set(txRef, ledgerPayload({
      transactionId,
      deviceId,
      type: "admin_adjustment",
      coinsChange: 0,
      pkrChange: 0,
      balanceAfterCoins: user.confirmedCoinsBalance ?? user.coinsBalance ?? 0,
      balanceAfterPKR: user.pkrBalance ?? 0,
      source: "admin",
      status: "adjusted",
      metadata: { reason, energyChange: actualChange, energyAfter },
    }));

    return { success: true, message: "Energy adjusted.", energyAfter };
  });
}
