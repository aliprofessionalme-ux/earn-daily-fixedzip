import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { handleRouteError } from "../services/firebase-admin.js";
import { requireFirebaseAuth } from "../middleware/auth.js";

const router = Router({ mergeParams: true });

function sendError(res: Response, err: unknown, fallback: string) {
  const normalized = handleRouteError(err, fallback);
  res.status(normalized.status).json(normalized.body);
}

const unityRequestSchema = z.object({
  placementId: z.string().optional().nullable(),
});

function unityDisabled(res: Response) {
  res.status(501).json({
    success: false,
    message: "Watch Ads & Earn Energy is Coming Soon. Unity rewarded Energy requires the real Unity SDK plus server-side reward verification.",
    code: "unity_not_implemented",
  });
}

router.post("/unity/rewarded-complete", requireFirebaseAuth, async (req: Request, res: Response) => {
  const parsed = unityRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request.", code: "invalid_request" });
    return;
  }

  try {
    unityDisabled(res);
  } catch (err) {
    req.log.error({ err }, "Error handling disabled Unity rewarded route");
    sendError(res, err, "Unity rewarded route is disabled.");
  }
});

router.post("/unity/interstitial-shown", requireFirebaseAuth, async (req: Request, res: Response) => {
  const parsed = unityRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request.", code: "invalid_request" });
    return;
  }

  try {
    unityDisabled(res);
  } catch (err) {
    req.log.error({ err }, "Error handling disabled Unity interstitial route");
    sendError(res, err, "Unity interstitial route is disabled.");
  }
});

export default router;
