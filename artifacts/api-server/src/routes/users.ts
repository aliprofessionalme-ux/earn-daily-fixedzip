import { Router } from "express";
import { z } from "zod";
import {
  adjustUserEnergy,
  creditCheckIn,
  creditScratch,
  creditSpin,
  getFirestoreDb,
  getUserDoc,
  handleRouteError,
  initUser,
  serializeDoc,
  serializeUser,
  verifyFirebaseToken,
} from "../services/firebase-admin.js";
import { cleanupExpiredSupportAttachment } from "../services/supportAttachments.js";
import { getTaskSlotStatus, unlockExtraTaskSlot } from "../services/taskSlots.js";
import { startCoinRushGame } from "../services/coinRush.js";
import { requireFirebaseAuth } from "../middleware/auth.js";
import {
  applyReferralCode,
  ensureReferralCode,
  getLeaderboard,
  getReferralSummary,
  recordDailyEnergy,
  updateUserProfile,
} from "../services/progress.js";
import { registerPushToken, unregisterPushToken } from "../services/pushNotifications.js";
import { applyFraudRiskSignals } from "../services/riskGuard.js";

const router = Router();

const initSchema = z.object({
  deviceId: z.string().min(6),
  installId: z.string().min(6).optional().nullable(),
  deviceFingerprint: z.string().min(6).optional().nullable(),
  firebaseUid: z.string().optional().nullable(),
  firebaseToken: z.string().optional().nullable(),
  authMode: z.enum(["firebase-anonymous", "device-only"]).optional(),
  authVerified: z.boolean().optional(),
  deviceInfo: z.record(z.unknown()).optional().nullable(),
});

const supportSchema = z.object({
  issueType: z.string().min(2).max(60),
  message: z.string().min(5).max(2000),
});

const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(40),
  phone: z.string().trim().max(30).optional().nullable(),
});

const referralApplySchema = z.object({
  referralCode: z.string().trim().min(4).max(64),
});

const pushTokenSchema = z.object({
  token: z.string().trim().min(20).max(256),
  platform: z.string().trim().max(32).optional().nullable(),
  deviceName: z.string().trim().max(80).optional().nullable(),
  appVersion: z.string().trim().max(40).optional().nullable(),
});

function sendError(res: import("express").Response, err: unknown, fallback: string) {
  const normalized = handleRouteError(err, fallback);
  res.status(normalized.status).json(normalized.body);
}

const SPIN_REWARDS = [1, 2, 3, 4, 5, 8] as const;
const SCRATCH_REWARDS = [1, 2, 3, 4, 6, 10] as const;

function pickEnergyReward(rewards: readonly number[]): number {
  return rewards[Math.floor(Math.random() * rewards.length)] ?? 1;
}

async function topUpEnergyToReward(deviceId: string, baseEnergyAwarded: number, targetEnergyAwarded: number, reason: string) {
  const extraEnergy = Math.max(0, targetEnergyAwarded - baseEnergyAwarded);
  if (extraEnergy <= 0) return null;
  return adjustUserEnergy(deviceId, extraEnergy, reason);
}

// Public: init does its own Firebase token verification
router.post("/init", async (req, res) => {
  const parsed = initSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "deviceId and valid device metadata are required.", code: "invalid_init_request" });
    return;
  }

  try {
    const decoded = await verifyFirebaseToken(parsed.data.firebaseToken);
    if (!decoded && process.env["ALLOW_DEVICE_ONLY_AUTH"] !== "true") {
      res.status(401).json({ error: "Verified Google sign-in is required.", code: "google_auth_required" });
      return;
    }
    const provider = String((decoded as { firebase?: { sign_in_provider?: string } } | null)?.firebase?.sign_in_provider ?? "");
    if (provider === "anonymous" && process.env["ALLOW_ANONYMOUS_AUTH"] !== "true") {
      res.status(401).json({ error: "Google sign-in is required.", code: "google_auth_required" });
      return;
    }
    const result = await initUser(
      decoded
        ? {
            ...parsed.data,
            firebaseUid: decoded.uid,
            authMode: "firebase-anonymous",
            authVerified: true,
          }
        : parsed.data,
    );
    await ensureReferralCode(result.user.deviceId);
    try {
      await applyFraudRiskSignals({
        deviceId: result.user.deviceId,
        installId: parsed.data.installId ?? result.user.installId ?? null,
        deviceFingerprint: parsed.data.deviceFingerprint ?? result.user.deviceFingerprint ?? null,
        authVerified: parsed.data.authVerified ?? result.user.authVerified,
        deviceInfo: parsed.data.deviceInfo ?? result.user.deviceInfo ?? null,
        request: req,
      });
    } catch (riskErr) {
      req.log.warn({ err: riskErr, deviceId: result.user.deviceId }, "Fraud risk scan skipped");
    }
    const refreshed = await getUserDoc(result.user.deviceId);
    res.json({ ...serializeUser(refreshed ?? result.user), duplicateRestored: result.duplicateRestored, authWarning: result.authWarning ?? null });
  } catch (err) {
    req.log.error({ err }, "Error initializing user");
    sendError(res, err, "Unable to initialize user.");
  }
});

router.get("/leaderboard", requireFirebaseAuth, async (req, res) => {
  try {
    const limit = Number(req.query.limit ?? 50);
    res.json(await getLeaderboard(Number.isFinite(limit) ? limit : 50));
  } catch (err) {
    req.log.error({ err }, "Error fetching leaderboard");
    sendError(res, err, "Unable to load leaderboard.");
  }
});

// Protected routes (device-scoped reads + writes)
router.get("/:deviceId", requireFirebaseAuth, async (req, res) => {
  try {
    const deviceId = String(req.params.deviceId);
    const user = await getUserDoc(deviceId);
    if (!user) {
      res.status(404).json({ error: "User not found.", code: "user_not_found" });
      return;
    }
    await ensureReferralCode(deviceId);
    const refreshed = await getUserDoc(deviceId);
    res.json(serializeUser(refreshed ?? user));
  } catch (err) {
    req.log.error({ err }, "Error fetching user");
    sendError(res, err, "Unable to fetch user.");
  }
});

router.patch("/:deviceId/profile", requireFirebaseAuth, async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Display name must be at least 2 characters.", code: "invalid_profile_request" });
    return;
  }
  try {
    const updated = await updateUserProfile(String(req.params.deviceId), parsed.data);
    res.json({ success: true, user: updated });
  } catch (err) {
    req.log.error({ err }, "Error updating profile");
    sendError(res, err, "Unable to update profile.");
  }
});

router.post("/:deviceId/push-token", requireFirebaseAuth, async (req, res) => {
  const parsed = pushTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Valid Expo push token is required.", code: "invalid_push_token" });
    return;
  }
  try {
    await registerPushToken(String(req.params.deviceId), parsed.data);
    res.json({ success: true, message: "Push token registered." });
  } catch (err) {
    req.log.error({ err }, "Error registering push token");
    sendError(res, err, "Unable to register push token.");
  }
});

router.delete("/:deviceId/push-token", requireFirebaseAuth, async (req, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token : null;
  try {
    await unregisterPushToken(String(req.params.deviceId), token);
    res.json({ success: true, message: "Push token removed." });
  } catch (err) {
    req.log.error({ err }, "Error removing push token");
    sendError(res, err, "Unable to remove push token.");
  }
});

router.get("/:deviceId/referral", requireFirebaseAuth, async (req, res) => {
  try {
    res.json(await getReferralSummary(String(req.params.deviceId)));
  } catch (err) {
    req.log.error({ err }, "Error loading referral summary");
    sendError(res, err, "Unable to load referral summary.");
  }
});

router.post("/:deviceId/referral/apply", requireFirebaseAuth, async (req, res) => {
  const parsed = referralApplySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Valid referral code is required.", code: "invalid_referral_code" });
    return;
  }
  try {
    const outcome = await applyReferralCode(String(req.params.deviceId), parsed.data.referralCode);
    res.json(outcome);
  } catch (err) {
    req.log.error({ err }, "Error applying referral code");
    sendError(res, err, "Unable to apply referral code.");
  }
});

router.get("/:deviceId/transactions", requireFirebaseAuth, async (req, res) => {
  try {
    const snap = await getFirestoreDb()
      .collection("transactions")
      .where("deviceId", "==", String(req.params.deviceId))
      .orderBy("createdAt", "desc")
      .limit(80)
      .get();
    res.json(snap.docs.map((doc) => serializeDoc(doc)));
  } catch (err) {
    req.log.error({ err }, "Error fetching transactions");
    sendError(res, err, "Unable to fetch transactions.");
  }
});

router.get("/:deviceId/withdrawals", requireFirebaseAuth, async (req, res) => {
  try {
    const snap = await getFirestoreDb()
      .collection("withdrawals")
      .where("deviceId", "==", String(req.params.deviceId))
      .orderBy("createdAt", "desc")
      .limit(40)
      .get();
    res.json(snap.docs.map((doc) => serializeDoc(doc)));
  } catch (err) {
    req.log.error({ err }, "Error fetching withdrawals");
    sendError(res, err, "Unable to fetch withdrawals.");
  }
});

router.get("/:deviceId/support", requireFirebaseAuth, async (req, res) => {
  try {
    const snap = await getFirestoreDb()
      .collection("supportTickets")
      .where("deviceId", "==", String(req.params.deviceId))
      .orderBy("createdAt", "desc")
      .limit(40)
      .get();

    const tickets = await Promise.all(snap.docs.map(async (doc) => {
      const data = { ...doc.data() };
      const cleared = await cleanupExpiredSupportAttachment(data, doc.ref).catch(() => null);
      return serializeDoc({ id: doc.id, ...data, ...(cleared ?? {}) });
    }));

    res.json(tickets);
  } catch (err) {
    req.log.error({ err }, "Error fetching support tickets");
    sendError(res, err, "Unable to fetch support tickets.");
  }
});

router.post("/:deviceId/support", requireFirebaseAuth, async (req, res) => {
  const parsed = supportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Issue type and message are required.", code: "invalid_support_ticket" });
    return;
  }

  try {
    const docRef = await getFirestoreDb().collection("supportTickets").add({
      ticketId: null,
      deviceId: String(req.params.deviceId),
      issueType: parsed.data.issueType,
      message: parsed.data.message,
      status: "open",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await docRef.set({ ticketId: docRef.id }, { merge: true });
    const snap = await docRef.get();
    res.json({ success: true, ...serializeDoc(snap) });
  } catch (err) {
    req.log.error({ err }, "Error creating support ticket");
    sendError(res, err, "Unable to create support ticket.");
  }
});

router.post("/:deviceId/checkin", requireFirebaseAuth, async (req, res) => {
  try {
    res.json(await creditCheckIn(String(req.params.deviceId)));
  } catch (err) {
    req.log.error({ err }, "Check-in failed");
    sendError(res, err, "Unable to complete daily check-in.");
  }
});

router.post("/:deviceId/spin", requireFirebaseAuth, async (req, res) => {
  try {
    const result = await creditSpin(String(req.params.deviceId), pickEnergyReward(SPIN_REWARDS));
    const toppedUp = await topUpEnergyToReward(String(req.params.deviceId), result.energyAwarded ?? 0, 1, "spin_random_topup");
    res.json(toppedUp ? { ...result, energyAwarded: toppedUp.energyChange, balanceAfterEnergy: toppedUp.energyBalance } : result);
  } catch (err) {
    req.log.error({ err }, "Spin failed");
    sendError(res, err, "Unable to spin right now.");
  }
});

router.post("/:deviceId/scratch", requireFirebaseAuth, async (req, res) => {
  try {
    const result = await creditScratch(String(req.params.deviceId), pickEnergyReward(SCRATCH_REWARDS));
    const toppedUp = await topUpEnergyToReward(String(req.params.deviceId), result.energyAwarded ?? 0, 1, "scratch_random_topup");
    res.json(toppedUp ? { ...result, energyAwarded: toppedUp.energyChange, balanceAfterEnergy: toppedUp.energyBalance } : result);
  } catch (err) {
    req.log.error({ err }, "Scratch failed");
    sendError(res, err, "Unable to scratch right now.");
  }
});

router.post("/:deviceId/games/coin-rush/start", requireFirebaseAuth, async (req, res) => {
  try {
    res.json(await startCoinRushGame(String(req.params.deviceId)));
  } catch (err) {
    req.log.error({ err }, "Coin Rush start failed");
    sendError(res, err, "Unable to start Coin Rush.");
  }
});

router.post("/:deviceId/ads/unity/rewarded-complete", requireFirebaseAuth, async (req, res) => {
  try {
    const { recordUnityRewardedComplete } = await import("../services/firebase-admin.js");
    const placementId = typeof req.body?.placementId === "string" ? req.body.placementId : undefined;
    res.json(await recordUnityRewardedComplete(String(req.params.deviceId), placementId));
  } catch (err) {
    req.log.error({ err }, "Unity rewarded completion failed");
    sendError(res, err, "Unable to record Unity reward.");
  }
});

router.post("/:deviceId/ads/unity/interstitial-shown", requireFirebaseAuth, async (req, res) => {
  try {
    const placementId = typeof req.body?.placementId === "string" ? req.body.placementId : undefined;
    await recordDailyEnergy(String(req.params.deviceId), 0, { source: "unity_interstitial", placementId: placementId ?? null });
    res.json({ success: true, message: placementId ? `Unity interstitial tracked for ${placementId}.` : "Unity interstitial tracked." });
  } catch (err) {
    req.log.error({ err }, "Unity interstitial tracking failed");
    sendError(res, err, "Unable to track Unity interstitial.");
  }
});

router.get("/:deviceId/task-slots/status", requireFirebaseAuth, async (req, res) => {
  try {
    res.json(await getTaskSlotStatus(String(req.params.deviceId)));
  } catch (err) {
    req.log.error({ err }, "Task slot status failed");
    sendError(res, err, "Unable to load task slot status.");
  }
});

router.post("/:deviceId/task-slots/unlock", requireFirebaseAuth, async (req, res) => {
  try {
    res.json(await unlockExtraTaskSlot(String(req.params.deviceId)));
  } catch (err) {
    req.log.error({ err }, "Task slot unlock failed");
    sendError(res, err, "Unable to unlock extra task slot.");
  }
});

router.get("/:deviceId/offer-events", requireFirebaseAuth, async (req, res) => {
  try {
    const snap = await getFirestoreDb()
      .collection("offerEvents")
      .where("deviceId", "==", String(req.params.deviceId))
      .orderBy("createdAt", "desc")
      .limit(60)
      .get();
    res.json(snap.docs.map((doc) => serializeDoc(doc)));
  } catch (err) {
    req.log.error({ err }, "Error fetching offer events");
    sendError(res, err, "Unable to fetch offer events.");
  }
});

export default router;