import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { handleRouteError, recordUnityInterstitialShown } from "../services/firebase-admin.js";
import { requireFirebaseAuth } from "../middleware/auth.js";

const router = Router({ mergeParams: true });

function sendError(res: Response, err: unknown, fallback: string) {
  const normalized = handleRouteError(err, fallback);
  res.status(normalized.status).json(normalized.body);
}

function envValue(name: string) {
  return String(process.env[name] ?? "").trim();
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
    const deviceId = String(req.params.deviceId ?? "").trim();
    if (!deviceId) {
      res.status(400).json({ success: false, message: "Device ID is required.", code: "missing_device_id" });
      return;
    }

    const gameId = envValue("UNITY_ANDROID_GAME_ID");
    const configuredPlacementId = envValue("UNITY_INTERSTITIAL_PLACEMENT_ID");
    if (!gameId || !configuredPlacementId) {
      res.status(503).json({
        success: false,
        message: "Unity interstitial ad gate is not configured yet.",
        code: "unity_interstitial_not_configured",
      });
      return;
    }

    const placementId = parsed.data.placementId || configuredPlacementId;
    if (placementId !== configuredPlacementId) {
      res.status(400).json({ success: false, message: "Invalid Unity placement.", code: "invalid_unity_placement" });
      return;
    }

    const event = await recordUnityInterstitialShown(deviceId, placementId);
    res.json({ success: true, message: "Required ad view recorded.", event });
  } catch (err) {
    req.log.error({ err }, "Error recording Unity interstitial route");
    sendError(res, err, "Unable to record Unity interstitial view.");
  }
});

export default router;
