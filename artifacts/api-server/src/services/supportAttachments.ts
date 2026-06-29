import admin from "firebase-admin";
import { logger } from "../lib/logger.js";
import { nowTs } from "./firebase-admin.js";

const DEFAULT_ATTACHMENT_TTL_HOURS = 24;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

export interface SupportAttachmentInput {
  ticketId: string;
  attachmentBase64?: string | null;
  attachmentName?: string | null;
  attachmentMimeType?: string | null;
  expiresInHours?: number | null;
}

export interface SupportAttachmentResult {
  adminAttachmentUrl: string;
  adminAttachmentName: string;
  adminAttachmentMimeType: string;
  adminAttachmentExpiresAt: string;
  adminAttachmentStoragePath: string;
}

export interface SupportAttachmentRecord {
  adminAttachmentUrl?: string | null;
  adminAttachmentName?: string | null;
  adminAttachmentMimeType?: string | null;
  adminAttachmentExpiresAt?: unknown;
  adminAttachmentStoragePath?: string | null;
}

function safeFileName(name: string, fallback = "support-attachment") {
  const raw = String(name ?? "").trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
  const clipped = raw.slice(0, 80).replace(/^[-.]+|[-.]+$/g, "");
  return clipped || fallback;
}

function safeMimeType(value: string | null | undefined, fallback = "application/octet-stream") {
  const mime = String(value ?? "").trim().toLowerCase();
  return mime || fallback;
}

function parseBase64Payload(rawValue: string, mimeType?: string | null) {
  const raw = String(rawValue ?? "").trim();
  if (!raw) {
    throw new Error("Attachment is required.");
  }

  const dataUrlMatch = raw.match(/^data:([^;]+);base64,(.+)$/i);
  let encoded = raw;
  let resolvedMime = safeMimeType(mimeType);

  if (dataUrlMatch) {
    resolvedMime = safeMimeType(dataUrlMatch[1], resolvedMime);
    encoded = dataUrlMatch[2] ?? "";
  }

  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length) {
    throw new Error("Attachment file is empty.");
  }
  if (buffer.length > MAX_ATTACHMENT_BYTES) {
    throw new Error("Attachment is too large. Keep it under 8 MB.");
  }

  return { buffer, mimeType: resolvedMime };
}

function getStorageBucket() {
  const bucketName = String(process.env["FIREBASE_STORAGE_BUCKET"] ?? process.env["GCLOUD_STORAGE_BUCKET"] ?? process.env["STORAGE_BUCKET"] ?? "").trim();
  if (!bucketName) return null;
  try {
    return admin.storage().bucket(bucketName);
  } catch (err) {
    logger.warn({ err, bucketName }, "Support attachment storage bucket unavailable");
    return null;
  }
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "object" && value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    try {
      const parsed = (value as { toDate: () => Date }).toDate();
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    } catch {
      return null;
    }
  }
  return null;
}

export async function storeSupportAttachment(input: SupportAttachmentInput): Promise<SupportAttachmentResult | null> {
  if (!input.attachmentBase64?.trim()) return null;

  const bucket = getStorageBucket();
  if (!bucket) {
    throw new Error("FIREBASE_STORAGE_BUCKET is required to upload support attachments.");
  }

  const { buffer, mimeType } = parseBase64Payload(input.attachmentBase64, input.attachmentMimeType);
  const expiresInHours = Math.max(1, Math.min(72, Number(input.expiresInHours ?? DEFAULT_ATTACHMENT_TTL_HOURS) || DEFAULT_ATTACHMENT_TTL_HOURS));
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
  const cleanName = safeFileName(input.attachmentName ?? "support-attachment");
  const storagePath = `support-attachments/${safeFileName(input.ticketId, "ticket")}/${Date.now()}-${cleanName}`;
  const file = bucket.file(storagePath);

  await file.save(buffer, {
    resumable: false,
    metadata: {
      contentType: mimeType,
      cacheControl: "private, max-age=0, no-cache, no-store",
      metadata: {
        supportTicketId: input.ticketId,
        expiresAt: expiresAt.toISOString(),
      },
    },
  });

  const [adminAttachmentUrl] = await file.getSignedUrl({
    action: "read",
    expires: expiresAt,
  });

  return {
    adminAttachmentUrl,
    adminAttachmentName: cleanName,
    adminAttachmentMimeType: mimeType,
    adminAttachmentExpiresAt: expiresAt.toISOString(),
    adminAttachmentStoragePath: storagePath,
  };
}

export async function cleanupExpiredSupportAttachment(record: SupportAttachmentRecord, ticketRef?: { set: (data: Record<string, unknown>, options?: { merge?: boolean }) => Promise<unknown> }) {
  const expiresAt = toDate(record.adminAttachmentExpiresAt ?? null);
  if (!expiresAt || expiresAt.getTime() > Date.now()) return null;

  const storagePath = String(record.adminAttachmentStoragePath ?? "").trim();
  const bucket = getStorageBucket();
  if (bucket && storagePath) {
    try {
      await bucket.file(storagePath).delete({ ignoreNotFound: true });
    } catch (err) {
      logger.warn({ err, storagePath }, "Failed to delete expired support attachment");
    }
  }

  const cleared = {
    adminAttachmentUrl: null,
    adminAttachmentName: null,
    adminAttachmentMimeType: null,
    adminAttachmentExpiresAt: null,
    adminAttachmentStoragePath: null,
  };

  if (ticketRef) {
    await ticketRef.set(cleared, { merge: true });
  }

  return cleared;
}

export function attachmentIsExpired(expiresAt: unknown) {
  const parsed = toDate(expiresAt);
  return Boolean(parsed && parsed.getTime() <= Date.now());
}
