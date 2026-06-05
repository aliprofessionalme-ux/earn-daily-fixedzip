import { Router, type NextFunction, type Request, type Response } from "express";
import { getAdminCsrfToken, isAdminSession, validateAdminCsrfToken } from "../lib/admin-auth.js";
import {
  adjustUserCoins,
  adjustUserEnergy,
  adminConfirmOfferEvent,
  adminRejectOfferEvent,
  adminReverseOfferEvent,
  getFirestoreDb,
  handleRouteError,
  markWithdrawalStatus,
  nowTs,
  rejectWithdrawal,
} from "../services/firebase-admin.js";
import { notifyOfferEvent, notifyWithdrawalStatus, sendPushToUser } from "../services/pushNotifications.js";

export const adminNotificationApiRouter = Router();

function readSession(req: { headers: { cookie?: string } }) {
  const cookie = String(req.headers.cookie ?? "");
  const match = cookie.match(/(?:^|;\s*)admin_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!isAdminSession(readSession(req))) {
    res.status(401).json({ error: "Unauthorized", code: "admin_unauthorized" });
    return;
  }
  next();
}

function requireAdminCsrf(req: Request, res: Response, next: NextFunction) {
  if (req.method !== "POST") {
    next();
    return;
  }
  const submitted = String(req.body?._csrf ?? req.headers["x-csrf-token"] ?? "");
  if (!validateAdminCsrfToken(readSession(req), submitted)) {
    res.status(403).json({ error: "Invalid CSRF token.", code: "admin_csrf_invalid" });
    return;
  }
  next();
}

function sendError(res: Response, err: unknown, fallback: string) {
  const normalized = handleRouteError(err, fallback);
  res.status(normalized.status).json(normalized.body);
}

function formRedirect(res: Response, fallbackJson: unknown) {
  const accepts = String(res.req.headers.accept ?? "");
  if (accepts.includes("text/html")) {
    res.redirect("/admin/dashboard");
  } else {
    res.json(fallbackJson);
  }
}

async function notifyQuietly(task: Promise<unknown>) {
  try {
    await task;
  } catch {
    // Admin action has already succeeded; never fail the admin request because push delivery failed.
  }
}

adminNotificationApiRouter.use(requireAdmin);
adminNotificationApiRouter.use(requireAdminCsrf);

adminNotificationApiRouter.post("/withdrawals/:withdrawalId/approve", async (req, res) => {
  try {
    const withdrawalId = String(req.params.withdrawalId);
    const result = await markWithdrawalStatus(withdrawalId, "approved", String(req.body?.adminNote ?? ""));
    await notifyQuietly(notifyWithdrawalStatus(withdrawalId, "approved", String(req.body?.adminNote ?? "")));
    formRedirect(res, result);
  } catch (err) {
    sendError(res, err, "Unable to approve withdrawal.");
  }
});

adminNotificationApiRouter.post("/withdrawals/:withdrawalId/reject", async (req, res) => {
  try {
    const withdrawalId = String(req.params.withdrawalId);
    const reason = String(req.body?.reason ?? "Rejected by admin");
    const result = await rejectWithdrawal(withdrawalId, reason);
    await notifyQuietly(notifyWithdrawalStatus(withdrawalId, "rejected", reason));
    formRedirect(res, result);
  } catch (err) {
    sendError(res, err, "Unable to reject withdrawal.");
  }
});

adminNotificationApiRouter.post("/withdrawals/:withdrawalId/mark-paid", async (req, res) => {
  try {
    const withdrawalId = String(req.params.withdrawalId);
    const result = await markWithdrawalStatus(withdrawalId, "paid", String(req.body?.adminNote ?? ""));
    await notifyQuietly(notifyWithdrawalStatus(withdrawalId, "paid", String(req.body?.adminNote ?? "")));
    formRedirect(res, result);
  } catch (err) {
    sendError(res, err, "Unable to mark withdrawal paid.");
  }
});

adminNotificationApiRouter.post("/offer-events/:eventId/confirm", async (req, res) => {
  try {
    const eventId = String(req.params.eventId);
    const result = await adminConfirmOfferEvent(eventId, String(req.body?.adminNote ?? ""));
    await notifyQuietly(notifyOfferEvent(eventId, "confirmed", String(req.body?.adminNote ?? "")));
    formRedirect(res, result);
  } catch (err) {
    sendError(res, err, "Unable to confirm offer event.");
  }
});

adminNotificationApiRouter.post("/offer-events/:eventId/reject", async (req, res) => {
  try {
    const eventId = String(req.params.eventId);
    const reason = String(req.body?.reason ?? "Rejected by admin");
    const result = await adminRejectOfferEvent(eventId, reason);
    await notifyQuietly(notifyOfferEvent(eventId, "rejected", reason));
    formRedirect(res, result);
  } catch (err) {
    sendError(res, err, "Unable to reject offer event.");
  }
});

adminNotificationApiRouter.post("/offer-events/:eventId/reverse", async (req, res) => {
  try {
    const eventId = String(req.params.eventId);
    const reason = String(req.body?.reason ?? "Reversed by admin");
    const result = await adminReverseOfferEvent(eventId, reason);
    await notifyQuietly(notifyOfferEvent(eventId, "reversed", reason));
    formRedirect(res, result);
  } catch (err) {
    sendError(res, err, "Unable to reverse offer event.");
  }
});

adminNotificationApiRouter.post("/users/:deviceId/ban", async (req, res) => {
  try {
    const deviceId = String(req.params.deviceId);
    const reason = String(req.body?.reason ?? "Manual admin ban");
    await getFirestoreDb().collection("users").doc(deviceId).set({ isBanned: true, banReason: reason, bannedAt: nowTs(), updatedAt: nowTs() }, { merge: true });
    await notifyQuietly(sendPushToUser(deviceId, { title: "Account restricted", body: reason, data: { type: "account", status: "banned" } }));
    formRedirect(res, { success: true, message: "User banned." });
  } catch (err) {
    sendError(res, err, "Unable to ban user.");
  }
});

adminNotificationApiRouter.post("/users/:deviceId/unban", async (req, res) => {
  try {
    const deviceId = String(req.params.deviceId);
    await getFirestoreDb().collection("users").doc(deviceId).set({ isBanned: false, banReason: null, bannedAt: null, updatedAt: nowTs() }, { merge: true });
    await notifyQuietly(sendPushToUser(deviceId, { title: "Account restored", body: "Your Earn Daily account is active again.", data: { type: "account", status: "unbanned" } }));
    formRedirect(res, { success: true, message: "User unbanned." });
  } catch (err) {
    sendError(res, err, "Unable to unban user.");
  }
});

adminNotificationApiRouter.post("/users/:deviceId/toggle-review", async (req, res) => {
  try {
    const deviceId = String(req.params.deviceId);
    const snap = await getFirestoreDb().collection("users").doc(deviceId).get();
    if (!snap.exists) { res.status(404).json({ error: "User not found." }); return; }
    const current = Boolean(snap.data()?.manualReviewRequired);
    await snap.ref.set({ manualReviewRequired: !current, updatedAt: nowTs() }, { merge: true });
    if (!current) {
      await notifyQuietly(sendPushToUser(deviceId, { title: "Account under review", body: "Some activity needs admin review before rewards or withdrawals are processed.", data: { type: "account", status: "manual_review" } }));
    }
    formRedirect(res, { success: true, message: `Manual review ${!current ? "enabled" : "disabled"}.` });
  } catch (err) {
    sendError(res, err, "Unable to toggle review.");
  }
});

adminNotificationApiRouter.post("/users/:deviceId/adjust-coins", async (req, res) => {
  try {
    const coinsChange = Number(req.body?.coinsChange);
    if (!Number.isFinite(coinsChange) || coinsChange === 0) {
      res.status(400).json({ error: "coinsChange must be a non-zero number.", code: "invalid_adjustment" });
      return;
    }
    const deviceId = String(req.params.deviceId);
    const rounded = Math.trunc(coinsChange);
    const result = await adjustUserCoins(deviceId, rounded, String(req.body?.reason ?? "Manual admin adjustment"));
    await notifyQuietly(sendPushToUser(deviceId, {
      title: "Balance updated",
      body: `${rounded > 0 ? "+" : ""}${rounded.toLocaleString()} coins adjusted by admin.`,
      data: { type: "balance", coinsChange: rounded },
    }));
    formRedirect(res, result);
  } catch (err) {
    sendError(res, err, "Unable to adjust coins.");
  }
});

adminNotificationApiRouter.post("/users/:deviceId/adjust-energy", async (req, res) => {
  try {
    const energyChange = Number(req.body?.energyChange);
    if (!Number.isFinite(energyChange) || energyChange === 0) {
      res.status(400).json({ error: "energyChange must be a non-zero number.", code: "invalid_adjustment" });
      return;
    }
    const deviceId = String(req.params.deviceId);
    const rounded = Math.trunc(energyChange);
    const result = await adjustUserEnergy(deviceId, rounded, String(req.body?.reason ?? "Manual admin adjustment"));
    await notifyQuietly(sendPushToUser(deviceId, {
      title: "Energy updated",
      body: `${rounded > 0 ? "+" : ""}${rounded.toLocaleString()} Energy adjusted by admin.`,
      data: { type: "energy", energyChange: rounded },
    }));
    formRedirect(res, result);
  } catch (err) {
    sendError(res, err, "Unable to adjust energy.");
  }
});

export function getAdminNotificationCsrfToken(req: Request) {
  return getAdminCsrfToken(readSession(req));
}
