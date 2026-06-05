import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { getFirestoreDb, handleRouteError, serializeDoc, submitWithdrawal } from "../services/firebase-admin.js";
import { requireFirebaseAuth } from "../middleware/auth.js";
import { getWithdrawalEligibility } from "../services/progress.js";

const router = Router({ mergeParams: true });

const withdrawalSchema = z.object({
  paymentMethod: z.enum(["Easypaisa", "JazzCash"]),
  accountNumber: z.string().min(5),
  accountTitle: z.string().min(2),
  amountPKR: z.number().int().positive(),
});

function sendError(res: Response, err: unknown, fallback: string) {
  const normalized = handleRouteError(err, fallback);
  res.status(normalized.status).json(normalized.body);
}

function hasRiskWithdrawalLock(user: Record<string, unknown>): boolean {
  const score = Number(user.suspiciousScore ?? 0);
  return Boolean(user.isBanned)
    || Boolean(user.manualReviewRequired)
    || Boolean(user.vpnSuspected)
    || String(user.riskLevel ?? "").toLowerCase() === "high"
    || score >= Number(process.env["FRAUD_WITHDRAWAL_REVIEW_SCORE"] ?? 4);
}

router.get("/", requireFirebaseAuth, async (req: Request, res: Response) => {
  try {
    const db = getFirestoreDb();
    const deviceId = String(req.params.deviceId);
    const snap = await db.collection("withdrawals").where("deviceId", "==", deviceId).orderBy("createdAt", "desc").limit(100).get();
    res.json(snap.docs.map((doc) => serializeDoc({ id: doc.id, ...doc.data() })));
  } catch (err) {
    req.log.error({ err }, "Error fetching withdrawals");
    sendError(res, err, "Unable to load withdrawals.");
  }
});

router.post("/", requireFirebaseAuth, async (req: Request, res: Response) => {
  const parsed = withdrawalSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter valid payment method, account details and PKR amount.", code: "invalid_withdrawal_request" });
    return;
  }

  try {
    const deviceId = String(req.params.deviceId);
    const eligibility = await getWithdrawalEligibility(deviceId);
    if (!eligibility.eligible) {
      res.status(400).json({
        error: `Withdrawal is locked. ${eligibility.reasons.join(" ")}`,
        code: "withdrawal_requirements_not_met",
        eligibility,
      });
      return;
    }

    const userSnap = await getFirestoreDb().collection("users").doc(deviceId).get();
    const user = userSnap.data() ?? {};
    if (hasRiskWithdrawalLock(user)) {
      res.status(400).json({
        error: "Withdrawal is locked. Account risk review is required before payout.",
        code: "withdrawal_risk_review_required",
      });
      return;
    }

    res.json(await submitWithdrawal(deviceId, parsed.data));
  } catch (err) {
    req.log.error({ err }, "Error submitting withdrawal");
    sendError(res, err, "Unable to submit withdrawal.");
  }
});

export default router;
