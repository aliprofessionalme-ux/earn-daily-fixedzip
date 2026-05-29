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
  unlockExtraTaskSlot,
} from "../services/firebase-admin.js";
import { requireFirebaseAuth } from "../middleware/auth.js";

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
    const result = await initUser(parsed.data);
    res.json({ ...serializeUser(result.user), duplicateRestored: result.duplicateRestored, authWarning: result.authWarning ?? null });
  } catch (err) {
    req.log.error({ err }, "Error initializing user");
    sendError(res, err, "Unable to initialize user.");
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
    res.json(serializeUser(user));
  } catch (err) {
    req.log.error({ err }, "Error fetching user");
    sendError(res, err, "Unable to fetch user.");
  }
});

router.get("/:deviceId/transactions", requireFirebaseAuth, async (req, res) => {
  try {
    const db = getFirestoreDb();
    const deviceId = String(req.params.deviceId);
    let snap;
    try {
      snap = await db.collection("coinTransactions").where("deviceId", "==", deviceId).orderBy("createdAt", "desc").limit(100).get();
    } catch (indexErr) {
      const msg = indexErr instanceof Error ? indexErr.message : "";
      if (msg.includes("FAILED_PRECONDITION") || msg.includes("requires an index")) {
        const fallback = await db.collection("coinTransactions").where("deviceId", "==", deviceId).limit(500).get();
        const sorted = fallback.docs
          .map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown>))
          .sort((a, b) => {
            const at = (a.createdAt as { toDate?: () => Date } | undefined)?.toDate?.() ?? new Date(0);
            const bt = (b.createdAt as { toDate?: () => Date } | undefined)?.toDate?.() ?? new Date(0);
            return bt.getTime() - at.getTime();
          })
          .slice(0, 100);
        res.json(sorted.map((d) => serializeDoc(d)));
        return;
      }
      throw indexErr;
    }
    res.json(snap.docs.map((doc) => serializeDoc({ id: doc.id, ...doc.data() })));
  } catch (err) {
    req.log.error({ err }, "Error fetching transactions");
    sendError(res, err, "Unable to load transaction history.");
  }
});

router.get("/:deviceId/support", requireFirebaseAuth, async (req, res) => {
  try {
    const db = getFirestoreDb();
    const deviceId = String(req.params.deviceId);
    const snap = await db.collection("supportTickets").where("deviceId", "==", deviceId).orderBy("createdAt", "desc").limit(50).get();
    res.json(snap.docs.map((doc) => serializeDoc({ id: doc.id, ...doc.data() })));
  } catch (err) {
    req.log.error({ err }, "Error fetching support tickets");
    sendError(res, err, "Unable to load support tickets.");
  }
});

router.post("/:deviceId/support", requireFirebaseAuth, async (req, res) => {
  const parsed = supportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose an issue type and enter a message of at least 5 characters.", code: "invalid_support_request" });
    return;
  }

  try {
    const deviceId = String(req.params.deviceId);
    const user = await getUserDoc(deviceId);
    if (!user) {
      res.status(404).json({ error: "User not found.", code: "user_not_found" });
      return;
    }
    const db = getFirestoreDb();
    const ticketRef = db.collection("supportTickets").doc();
    const ticket = {
      ticketId: ticketRef.id,
      deviceId,
      issueType: parsed.data.issueType.trim(),
      message: parsed.data.message.trim(),
      status: "open",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await ticketRef.set(ticket);
    res.json({ success: true, ...ticket, createdAt: ticket.createdAt.toISOString(), updatedAt: ticket.updatedAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Error creating support ticket");
    sendError(res, err, "Unable to create support ticket.");
  }
});

router.post("/:deviceId/checkin", requireFirebaseAuth, async (req, res) => {
  try {
    res.json(await creditCheckIn(String(req.params.deviceId)));
  } catch (err) {
    req.log.error({ err }, "Error during check-in");
    sendError(res, err, "Reward failed. Please try again.");
  }
});

router.post("/:deviceId/spin", requireFirebaseAuth, async (req, res) => {
  try {
    const deviceId = String(req.params.deviceId);
    const result = await creditSpin(deviceId);
    const baseEnergyAwarded = Number(result.energyAwarded ?? 0);
    const energyAwarded = Math.max(baseEnergyAwarded, pickEnergyReward(SPIN_REWARDS));
    const adjusted = await topUpEnergyToReward(deviceId, baseEnergyAwarded, energyAwarded, "Spin random Energy bonus");

    res.json({
      ...result,
      message: `You won ${energyAwarded} Energy!`,
      energyAwarded,
      balanceAfterEnergy: adjusted?.energyAfter ?? result.balanceAfterEnergy,
      rewardSegments: SPIN_REWARDS,
    });
  } catch (err) {
    req.log.error({ err }, "Error recording spin");
    sendError(res, err, "Spin reward failed. Please try again.");
  }
});

router.post("/:deviceId/scratch", requireFirebaseAuth, async (req, res) => {
  try {
    const deviceId = String(req.params.deviceId);
    const result = await creditScratch(deviceId);
    const baseEnergyAwarded = Number(result.energyAwarded ?? 0);
    const energyAwarded = Math.max(baseEnergyAwarded, pickEnergyReward(SCRATCH_REWARDS));
    const adjusted = await topUpEnergyToReward(deviceId, baseEnergyAwarded, energyAwarded, "Scratch random Energy bonus");

    res.json({
      ...result,
      message: `You won ${energyAwarded} Energy!`,
      energyAwarded,
      balanceAfterEnergy: adjusted?.energyAfter ?? result.balanceAfterEnergy,
      rewardSegments: SCRATCH_REWARDS,
    });
  } catch (err) {
    req.log.error({ err }, "Error recording scratch");
    sendError(res, err, "Scratch reward failed. Please try again.");
  }
});

router.get("/:deviceId/offer-events", requireFirebaseAuth, async (req, res) => {
  try {
    const db = getFirestoreDb();
    const deviceId = String(req.params.deviceId);
    let snap;
    try {
      snap = await db.collection("offerEvents").where("deviceId", "==", deviceId).orderBy("createdAt", "desc").limit(100).get();
    } catch (indexErr) {
      const msg = indexErr instanceof Error ? indexErr.message : "";
      if (msg.includes("FAILED_PRECONDITION") || msg.includes("requires an index")) {
        const fallback = await db.collection("offerEvents").where("deviceId", "==", deviceId).limit(500).get();
        const sorted = fallback.docs
          .map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown>))
          .sort((a, b) => {
            const at = (a.createdAt as { toDate?: () => Date } | undefined)?.toDate?.() ?? new Date(0);
            const bt = (b.createdAt as { toDate?: () => Date } | undefined)?.toDate?.() ?? new Date(0);
            return bt.getTime() - at.getTime();
          })
          .slice(0, 100);
        res.json(sorted.map((d) => serializeDoc(d)));
        return;
      }
      throw indexErr;
    }
    res.json(snap.docs.map((doc) => serializeDoc({ id: doc.id, ...doc.data() })));
  } catch (err) {
    req.log.error({ err }, "Error fetching offer events");
    sendError(res, err, "Unable to load offer events.");
  }
});

router.post("/:deviceId/task-slots/unlock", requireFirebaseAuth, async (req, res) => {
  try {
    const deviceId = String(req.params.deviceId);
    res.json(await unlockExtraTaskSlot(deviceId));
  } catch (err) {
    req.log.error({ err }, "Error unlocking task slot");
    sendError(res, err, "Unable to unlock task slot.");
  }
});

export default router;
