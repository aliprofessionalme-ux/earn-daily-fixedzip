import admin from "firebase-admin";
import { getFirestoreDb, getTodayString, HttpError, nowTs } from "./firebase-admin.js";

export const REQUIRED_DAILY_TASKS = 5;
export const REQUIRED_REFERRAL_ENERGY = 5;
export const REFERRAL_BONUS_COINS = Number(process.env["REFERRAL_BONUS_COINS"] ?? 500);

function yesterdayString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  try {
    return d.toLocaleDateString("en-CA", { timeZone: process.env["APP_TIMEZONE"] || "Asia/Karachi" });
  } catch {
    return d.toISOString().split("T")[0];
  }
}

function normalizeReferralCode(value: string): string {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

function numberValue(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function maskUserId(deviceId?: string | null): string {
  const id = String(deviceId ?? "").trim();
  if (!id) return "ED-****";
  const tail = id.slice(-4).toUpperCase();
  return `ED-****${tail}`;
}

export function referralCodeFromDeviceId(deviceId: string): string {
  const compact = Buffer.from(deviceId).toString("base64url").replace(/[^A-Z0-9]/gi, "").slice(0, 10).toUpperCase();
  return `ED${compact || deviceId.slice(-8).toUpperCase()}`;
}

export async function ensureReferralCode(deviceId: string): Promise<string> {
  const db = getFirestoreDb();
  const userRef = db.collection("users").doc(deviceId);
  const snap = await userRef.get();
  if (!snap.exists) throw new HttpError(404, "User not found.", "user_not_found");
  const user = snap.data() ?? {};
  const existing = typeof user.referralCode === "string" ? normalizeReferralCode(user.referralCode) : "";
  if (existing) return existing;
  const code = referralCodeFromDeviceId(deviceId);
  await userRef.set({ referralCode: code, updatedAt: nowTs() }, { merge: true });
  return code;
}

export async function updateDisplayName(deviceId: string, displayName: string) {
  const name = displayName.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 40) {
    throw new HttpError(400, "Name must be 2 to 40 characters.", "invalid_display_name");
  }
  const db = getFirestoreDb();
  const userRef = db.collection("users").doc(deviceId);
  const snap = await userRef.get();
  if (!snap.exists) throw new HttpError(404, "User not found.", "user_not_found");
  await userRef.set({ displayName: name, updatedAt: nowTs() }, { merge: true });
  return { success: true, displayName: name };
}

export async function applyReferralCode(deviceId: string, referralCode: string) {
  const code = normalizeReferralCode(referralCode);
  if (!code) throw new HttpError(400, "Enter a valid referral code.", "invalid_referral_code");

  const db = getFirestoreDb();
  const currentRef = db.collection("users").doc(deviceId);
  const currentSnap = await currentRef.get();
  if (!currentSnap.exists) throw new HttpError(404, "User not found.", "user_not_found");
  const current = currentSnap.data() ?? {};
  if (current.referredByDeviceId) throw new HttpError(409, "Referral already applied for this account.", "referral_already_applied");

  const referrerSnap = await db.collection("users").where("referralCode", "==", code).limit(1).get();
  if (referrerSnap.empty) throw new HttpError(404, "Referral code not found.", "referral_code_not_found");
  const referrerDoc = referrerSnap.docs[0];
  if (referrerDoc.id === deviceId) throw new HttpError(400, "You cannot use your own referral code.", "self_referral_not_allowed");

  await currentRef.set({
    referredByDeviceId: referrerDoc.id,
    referredByCode: code,
    referralAppliedAt: nowTs(),
    referralBonusAwarded: false,
    updatedAt: nowTs(),
  }, { merge: true });

  return { success: true, message: "Referral linked. Bonus unlocks after 5 tasks and 5 Energy earned by the referred user." };
}

async function maybeAwardReferralBonus(
  tx: admin.firestore.Transaction,
  db: FirebaseFirestore.Firestore,
  referredRef: FirebaseFirestore.DocumentReference,
  referredUser: FirebaseFirestore.DocumentData,
  tasksToday: number,
  energyToday: number,
) {
  if (!referredUser.referredByDeviceId || referredUser.referralBonusAwarded) return;
  if (tasksToday < REQUIRED_DAILY_TASKS || energyToday < REQUIRED_REFERRAL_ENERGY) return;

  const referrerId = String(referredUser.referredByDeviceId);
  const referrerRef = db.collection("users").doc(referrerId);
  const referrerSnap = await tx.get(referrerRef);
  if (!referrerSnap.exists) return;
  const referrer = referrerSnap.data() ?? {};
  const pendingAfter = numberValue(referrer.pendingCoinsBalance) + REFERRAL_BONUS_COINS;

  tx.set(referrerRef, {
    pendingCoinsBalance: admin.firestore.FieldValue.increment(REFERRAL_BONUS_COINS),
    totalEarnedCoins: admin.firestore.FieldValue.increment(REFERRAL_BONUS_COINS),
    referralBonusCoinsEarned: admin.firestore.FieldValue.increment(REFERRAL_BONUS_COINS),
    updatedAt: nowTs(),
  }, { merge: true });

  tx.set(referredRef, {
    referralBonusAwarded: true,
    referralQualifiedAt: nowTs(),
    updatedAt: nowTs(),
  }, { merge: true });

  const ledgerRef = db.collection("coinTransactions").doc();
  tx.set(ledgerRef, {
    transactionId: ledgerRef.id,
    deviceId: referrerId,
    type: "referral_bonus",
    coinsChange: REFERRAL_BONUS_COINS,
    pkrChange: 0,
    balanceAfterCoins: numberValue(referrer.confirmedCoinsBalance ?? referrer.coinsBalance),
    source: "referral",
    status: "pending_verification",
    metadata: {
      referredDeviceIdMasked: maskUserId(referredRef.id),
      requiredTasks: REQUIRED_DAILY_TASKS,
      requiredEnergy: REQUIRED_REFERRAL_ENERGY,
      pendingAfter,
    },
    createdAt: nowTs(),
  });
}

export async function recordDailyEnergy(deviceId: string, energyAwarded: number) {
  const energy = Math.max(0, Math.floor(Number(energyAwarded || 0)));
  if (energy <= 0) return;
  const db = getFirestoreDb();
  const today = getTodayString(process.env["APP_TIMEZONE"] || "Asia/Karachi");
  const userRef = db.collection("users").doc(deviceId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) return;
    const user = snap.data() ?? {};
    const currentEnergy = user.lastDailyEnergyDate === today ? numberValue(user.dailyEnergyEarnedToday) : 0;
    const tasksToday = user.lastDailyTaskDate === today ? numberValue(user.dailyTasksCompletedToday) : 0;
    const nextEnergy = currentEnergy + energy;

    tx.set(userRef, {
      dailyEnergyEarnedToday: nextEnergy,
      lastDailyEnergyDate: today,
      lifetimeEnergyEarned: admin.firestore.FieldValue.increment(energy),
      updatedAt: nowTs(),
    }, { merge: true });

    await maybeAwardReferralBonus(tx, db, userRef, user, tasksToday, nextEnergy);
  });
}

export async function recordCompletedTask(deviceId: string) {
  const db = getFirestoreDb();
  const today = getTodayString(process.env["APP_TIMEZONE"] || "Asia/Karachi");
  const yesterday = yesterdayString();
  const userRef = db.collection("users").doc(deviceId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) return;
    const user = snap.data() ?? {};
    const firstTaskToday = user.lastDailyTaskDate !== today;
    const currentTasks = firstTaskToday ? 0 : numberValue(user.dailyTasksCompletedToday);
    const nextTasks = currentTasks + 1;
    const existingStreak = numberValue(user.currentDailyStreak);
    const nextStreak = firstTaskToday ? (user.lastDailyTaskDate === yesterday ? existingStreak + 1 : 1) : Math.max(1, existingStreak);
    const longestStreak = Math.max(numberValue(user.longestDailyStreak), nextStreak);
    const energyToday = user.lastDailyEnergyDate === today ? numberValue(user.dailyEnergyEarnedToday) : 0;

    tx.set(userRef, {
      dailyTasksCompletedToday: nextTasks,
      lastDailyTaskDate: today,
      currentDailyStreak: nextStreak,
      longestDailyStreak: longestStreak,
      lifetimeCompletedTasks: admin.firestore.FieldValue.increment(1),
      updatedAt: nowTs(),
    }, { merge: true });

    await maybeAwardReferralBonus(tx, db, userRef, user, nextTasks, energyToday);
  });
}

export async function getWithdrawalEligibility(deviceId: string) {
  const db = getFirestoreDb();
  const today = getTodayString(process.env["APP_TIMEZONE"] || "Asia/Karachi");
  const snap = await db.collection("users").doc(deviceId).get();
  if (!snap.exists) throw new HttpError(404, "User not found.", "user_not_found");
  const user = snap.data() ?? {};
  const tasksToday = user.lastDailyTaskDate === today ? numberValue(user.dailyTasksCompletedToday) : 0;
  const streakActive = user.lastDailyTaskDate === today && numberValue(user.currentDailyStreak) >= 1;
  const reasons: string[] = [];
  if (!streakActive) reasons.push("Start today's streak by completing at least one valid task.");
  if (tasksToday < REQUIRED_DAILY_TASKS) reasons.push(`Complete ${REQUIRED_DAILY_TASKS} daily tasks before requesting withdrawal.`);
  return {
    eligible: reasons.length === 0,
    reasons,
    tasksToday,
    requiredDailyTasks: REQUIRED_DAILY_TASKS,
    streakActive,
    currentDailyStreak: numberValue(user.currentDailyStreak),
  };
}

export async function getLeaderboard(limit = 50) {
  const db = getFirestoreDb();
  const snap = await db.collection("users").limit(500).get();
  return snap.docs
    .map((doc) => {
      const user = doc.data() ?? {};
      return {
        deviceId: doc.id,
        maskedUserId: maskUserId(doc.id),
        displayName: typeof user.displayName === "string" && user.displayName.trim() ? user.displayName.trim() : maskUserId(doc.id),
        confirmedCoinsBalance: numberValue(user.confirmedCoinsBalance ?? user.coinsBalance),
        pendingCoinsBalance: numberValue(user.pendingCoinsBalance),
        energyBalance: numberValue(user.energyBalance),
        currentDailyStreak: numberValue(user.currentDailyStreak),
        dailyTasksCompletedToday: numberValue(user.dailyTasksCompletedToday),
        lastActiveAt: user.lastActiveAt ?? user.updatedAt ?? null,
        isBanned: Boolean(user.isBanned),
      };
    })
    .filter((user) => !user.isBanned)
    .sort((a, b) => b.confirmedCoinsBalance - a.confirmedCoinsBalance || b.pendingCoinsBalance - a.pendingCoinsBalance)
    .slice(0, Math.max(1, Math.min(limit, 100)))
    .map((user, index) => ({ ...user, rank: index + 1 }));
}

export async function getReferralSummary(deviceId: string) {
  const db = getFirestoreDb();
  const code = await ensureReferralCode(deviceId);
  const snap = await db.collection("users").where("referredByDeviceId", "==", deviceId).limit(200).get();
  const referredUsers = snap.docs.map((doc) => {
    const data = doc.data() ?? {};
    return {
      maskedUserId: maskUserId(doc.id),
      displayName: typeof data.displayName === "string" && data.displayName.trim() ? data.displayName.trim() : maskUserId(doc.id),
      qualified: Boolean(data.referralBonusAwarded),
      tasksToday: numberValue(data.dailyTasksCompletedToday),
      energyToday: numberValue(data.dailyEnergyEarnedToday),
      joinedAt: data.createdAt ?? null,
    };
  });

  return {
    referralCode: code,
    referralUrl: `earndaily://referral/${encodeURIComponent(code)}`,
    bonusCoins: REFERRAL_BONUS_COINS,
    requiredTasks: REQUIRED_DAILY_TASKS,
    requiredEnergy: REQUIRED_REFERRAL_ENERGY,
    totalReferred: referredUsers.length,
    qualifiedReferrals: referredUsers.filter((u) => u.qualified).length,
    pendingReferrals: referredUsers.filter((u) => !u.qualified).length,
    referredUsers,
  };
}
