import type { Request, Response, NextFunction } from "express";
import { verifyFirebaseToken, getFirestoreDb } from "../services/firebase-admin.js";

export async function requireFirebaseAuth(req: Request, res: Response, next: NextFunction) {
  // Dev-only fallback: if API_AUTH_REQUIRED is explicitly false, skip auth
  if (process.env["API_AUTH_REQUIRED"] === "false") {
    return next();
  }

  const authHeader = String(req.headers.authorization ?? "");
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!token) {
    res.status(401).json({ error: "Missing authentication token.", code: "auth_missing" });
    return;
  }

  const decoded = await verifyFirebaseToken(token);
  if (!decoded) {
    res.status(401).json({ error: "Invalid or expired authentication token.", code: "auth_invalid" });
    return;
  }

  const provider = String((decoded as { firebase?: { sign_in_provider?: string } }).firebase?.sign_in_provider ?? "");
  if (provider === "anonymous" && process.env["ALLOW_ANONYMOUS_AUTH"] !== "true") {
    res.status(401).json({ error: "Google sign-in is required.", code: "google_auth_required" });
    return;
  }

  // Attach decoded token to request for downstream use
  (req as unknown as Record<string, unknown>)["firebaseAuth"] = decoded;

  // Match firebaseUid to the requested deviceId user record (for device-scoped routes)
  const deviceId = String(req.params.deviceId ?? req.body?.deviceId ?? "");
  if (deviceId) {
    const userSnap = await getFirestoreDb().collection("users").doc(deviceId).get();
    if (userSnap.exists) {
      const user = userSnap.data() as { firebaseUid?: string | null };
      if (user.firebaseUid && user.firebaseUid !== decoded.uid) {
        res.status(403).json({ error: "Device identity mismatch.", code: "auth_device_mismatch" });
        return;
      }
    }
  }

  next();
}
