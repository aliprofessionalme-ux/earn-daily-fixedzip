import { createHash } from "node:crypto";
import { logger } from "../lib/logger.js";
import { getFirestoreDb, nowTs } from "./firebase-admin.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const MAX_TOKENS_PER_USER = 10;

export interface PushTokenInput {
  token: string;
  platform?: string | null;
  deviceName?: string | null;
  appVersion?: string | null;
}

export interface PushMessageInput {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

function tokenDocId(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 40);
}

function isExpoPushToken(token: string): boolean {
  return /^(ExpoPushToken|ExponentPushToken)\[[^\]]+\]$/.test(token);
}

function cleanText(value: unknown, max = 140): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.slice(0, max);
}

function attachmentIsActive(expiresAt: unknown) {
  try {
    const timestamp = expiresAt as { toDate?: () => Date } | null | undefined;
    const date = timestamp && typeof timestamp.toDate === "function"
      ? timestamp.toDate()
      : new Date(String(expiresAt ?? ""));
    return !Number.isNaN(date.getTime()) && date.getTime() > Date.now();
  } catch {
    return false;
  }
}

function toIsoString(value: unknown) {
  try {
    const timestamp = value as { toDate?: () => Date } | null | undefined;
    const date = timestamp && typeof timestamp.toDate === "function"
      ? timestamp.toDate()
      : new Date(String(value ?? ""));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  } catch {
    return null;
  }
}

async function postExpoPush(messages: Array<Record<string, unknown>>) {
  const response = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      "accept": "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(messages.length === 1 ? messages[0] : messages),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    logger.warn({ status: response.status, body }, "Expo push send failed");
    return { ok: false, body };
  }
  return { ok: true, body };
}

export async function registerPushToken(deviceId: string, input: PushTokenInput) {
  const token = cleanText(input.token, 256);
  if (!token || !isExpoPushToken(token)) {
    return { success: false, message: "Invalid Expo push token." };
  }

  const db = getFirestoreDb();
  const userRef = db.collection("users").doc(deviceId);
  const tokenRef = userRef.collection("pushTokens").doc(tokenDocId(token));
  const now = nowTs();

  await tokenRef.set({
    token,
    platform: cleanText(input.platform, 32),
    deviceName: cleanText(input.deviceName, 80),
    appVersion: cleanText(input.appVersion, 40),
    enabled: true,
    updatedAt: now,
    createdAt: now,
  }, { merge: true });

  await userRef.set({
    pushEnabled: true,
    pushTokenUpdatedAt: now,
    updatedAt: now,
  }, { merge: true });

  return { success: true, message: "Push notifications enabled." };
}

export async function unregisterPushToken(deviceId: string, token: string) {
  const clean = cleanText(token, 256);
  if (!clean) return { success: true, message: "No token supplied." };

  const db = getFirestoreDb();
  await db.collection("users").doc(deviceId).collection("pushTokens").doc(tokenDocId(clean)).set({
    enabled: false,
    disabledAt: nowTs(),
    updatedAt: nowTs(),
  }, { merge: true });

  return { success: true, message: "Push token disabled." };
}

export async function sendPushToUser(deviceId: string, message: PushMessageInput) {
  try {
    const db = getFirestoreDb();
    const snap = await db.collection("users").doc(deviceId).collection("pushTokens")
      .where("enabled", "==", true)
      .limit(MAX_TOKENS_PER_USER)
      .get();

    const tokens = snap.docs
      .map((doc) => String(doc.data().token ?? "").trim())
      .filter(isExpoPushToken);

    if (tokens.length === 0) {
      return { success: true, sent: 0, message: "No active push tokens." };
    }

    const title = cleanText(message.title, 80) ?? "Earn Daily";
    const body = cleanText(message.body, 180) ?? "You have a new update.";
    const messages = tokens.map((token) => ({
      to: token,
      sound: "default",
      title,
      body,
      data: { app: "earn-daily", ...(message.data ?? {}) },
    }));

    const result = await postExpoPush(messages);
    await db.collection("pushNotificationLogs").add({
      deviceId,
      title,
      body,
      tokenCount: tokens.length,
      success: result.ok,
      response: result.body ?? null,
      createdAt: nowTs(),
    });

    return { success: result.ok, sent: result.ok ? tokens.length : 0 };
  } catch (err) {
    logger.warn({ err, deviceId }, "Push notification send failed");
    return { success: false, sent: 0, message: "Push send failed." };
  }
}

export async function notifyWithdrawalStatus(withdrawalId: string, status: "approved" | "rejected" | "paid", fallbackNote?: string) {
  const db = getFirestoreDb();
  const snap = await db.collection("withdrawals").doc(withdrawalId).get();
  if (!snap.exists) return { success: false, sent: 0, message: "Withdrawal not found." };

  const data = snap.data() ?? {};
  const deviceId = String(data.deviceId ?? "");
  if (!deviceId) return { success: false, sent: 0, message: "Withdrawal has no deviceId." };

  const amount = Number(data.amountPKR ?? 0);
  const amountLabel = Number.isFinite(amount) && amount > 0 ? `PKR ${amount.toFixed(2)}` : "Your withdrawal";
  const adminNote = cleanText(data.rejectionReason ?? data.adminNote ?? fallbackNote, 160);

  if (status === "approved") {
    return sendPushToUser(deviceId, {
      title: "Withdrawal approved",
      body: `${amountLabel} request is approved and waiting for payment.`,
      data: { type: "withdrawal", withdrawalId, status },
    });
  }

  if (status === "paid") {
    return sendPushToUser(deviceId, {
      title: "Withdrawal paid",
      body: `${amountLabel} has been marked paid. Please check your account.`,
      data: { type: "withdrawal", withdrawalId, status },
    });
  }

  return sendPushToUser(deviceId, {
    title: "Withdrawal rejected",
    body: adminNote || `${amountLabel} request was rejected by admin.`,
    data: { type: "withdrawal", withdrawalId, status },
  });
}

export async function notifySupportTicket(ticketId: string, kind: "reply" | "closed", bodyText?: string) {
  const db = getFirestoreDb();
  const snap = await db.collection("supportTickets").doc(ticketId).get();
  if (!snap.exists) return { success: false, sent: 0, message: "Ticket not found." };

  const data = snap.data() ?? {};
  const deviceId = String(data.deviceId ?? "");
  if (!deviceId) return { success: false, sent: 0, message: "Ticket has no deviceId." };

  const attachmentUrl = String(data.adminAttachmentUrl ?? "").trim();
  const attachmentName = String(data.adminAttachmentName ?? "").trim();
  const attachmentMimeType = String(data.adminAttachmentMimeType ?? "").trim();
  const attachmentExpiresAt = data.adminAttachmentExpiresAt ?? null;
  const attachmentActive = Boolean(attachmentUrl && attachmentName && attachmentIsActive(attachmentExpiresAt));
  const fallbackBody = kind === "reply" ? "Admin replied to your support ticket." : "Your support ticket has been closed.";
  const body = cleanText(bodyText ?? data.adminReply ?? data.resolutionNotes, 180) || fallbackBody;

  return sendPushToUser(deviceId, {
    title: kind === "reply" ? "Support replied" : "Support ticket closed",
    body: attachmentActive && kind === "reply" ? `${body} Attachment is ready to download.` : body,
    data: {
      type: "support",
      ticketId,
      status: kind,
      adminReply: cleanText(data.adminReply, 500) ?? null,
      resolutionNotes: cleanText(data.resolutionNotes, 500) ?? null,
      adminAttachmentUrl: attachmentActive ? attachmentUrl : null,
      adminAttachmentName: attachmentActive ? attachmentName : null,
      adminAttachmentMimeType: attachmentActive ? attachmentMimeType : null,
      adminAttachmentExpiresAt: attachmentActive ? toIsoString(attachmentExpiresAt) : null,
    },
  });
}

export async function notifyOfferEvent(eventId: string, status: "confirmed" | "rejected" | "reversed", note?: string) {
  const db = getFirestoreDb();
  const snap = await db.collection("offerEvents").doc(eventId).get();
  if (!snap.exists) return { success: false, sent: 0, message: "Offer event not found." };

  const data = snap.data() ?? {};
  const deviceId = String(data.deviceId ?? "");
  if (!deviceId) return { success: false, sent: 0, message: "Offer event has no deviceId." };

  const coins = Number(data.coinsCalculated ?? 0);
  const coinsLabel = Number.isFinite(coins) && coins > 0 ? `${coins.toLocaleString()} coins` : "Your reward";
  const title = status === "confirmed" ? "Reward confirmed" : status === "reversed" ? "Reward reversed" : "Reward rejected";
  const body = status === "confirmed"
    ? `${coinsLabel} have been confirmed.`
    : cleanText(note ?? data.rejectionReason ?? data.reversalReason, 180) || `${coinsLabel} could not be approved.`;

  return sendPushToUser(deviceId, {
    title,
    body,
    data: { type: "reward", eventId, status },
  });
}