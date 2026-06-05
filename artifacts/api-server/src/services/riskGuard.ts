import { createHash } from "node:crypto";
import type { Request } from "express";
import { logger } from "../lib/logger.js";
import { getFirestoreDb, nowTs } from "./firebase-admin.js";

interface RiskSignalInput {
  deviceId: string;
  installId?: string | null;
  deviceFingerprint?: string | null;
  authVerified?: boolean;
  deviceInfo?: Record<string, unknown> | null;
  request: Request;
}

interface RiskAssessment {
  scoreDelta: number;
  flags: string[];
  vpnSuspected: boolean;
  signals: Record<string, unknown>;
}

const MANUAL_REVIEW_SCORE = Number(process.env["FRAUD_MANUAL_REVIEW_SCORE"] ?? 4);
const HIGH_RISK_SCORE = Number(process.env["FRAUD_HIGH_RISK_SCORE"] ?? 7);
const SHARED_IP_LIMIT = Number(process.env["FRAUD_SHARED_IP_LIMIT"] ?? 5);

function firstHeader(req: Request, name: string): string | null {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) return String(value[0] ?? "").trim() || null;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeIp(raw?: string | null): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const first = value.split(",").map((part) => part.trim()).find(Boolean) ?? "";
  if (!first) return null;
  return first.replace(/^::ffff:/, "").replace(/^\[|\]$/g, "");
}

function extractClientIp(req: Request): { ip: string | null; hops: string[] } {
  const forwardedFor = firstHeader(req, "x-forwarded-for");
  const hops = forwardedFor ? forwardedFor.split(",").map((part) => normalizeIp(part)).filter((part): part is string => Boolean(part)) : [];
  const ip = hops[0]
    ?? normalizeIp(firstHeader(req, "cf-connecting-ip"))
    ?? normalizeIp(firstHeader(req, "x-real-ip"))
    ?? normalizeIp(req.ip)
    ?? normalizeIp(req.socket.remoteAddress);
  return { ip, hops };
}

function hashIp(ip: string): string {
  const salt = process.env["FRAUD_HASH_SALT"] || process.env["SESSION_SECRET"] || "earn-daily-risk-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

function isTruthyRiskValue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") return ["true", "yes", "1", "vpn", "proxy", "tor", "hosting"].includes(value.toLowerCase());
  return false;
}

function readNested(source: unknown, path: string[]): unknown {
  let current = source as Record<string, unknown> | null;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = current[key] as Record<string, unknown> | null;
  }
  return current;
}

async function optionalIpIntel(ip: string): Promise<{ vpnSuspected: boolean; flags: string[]; raw?: unknown }> {
  const template = process.env["FRAUD_IP_INTEL_URL"];
  if (!template) return { vpnSuspected: false, flags: [] };

  try {
    const url = template.replace("{ip}", encodeURIComponent(ip));
    if (!/^https:\/\//i.test(url)) return { vpnSuspected: false, flags: ["ip_intel_url_not_https"] };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!response.ok) return { vpnSuspected: false, flags: ["ip_intel_failed"] };
    const json = await response.json().catch(() => null);
    const riskPaths = [
      ["vpn"], ["proxy"], ["tor"], ["hosting"], ["datacenter"],
      ["security", "vpn"], ["security", "proxy"], ["security", "tor"], ["security", "hosting"],
      ["privacy", "vpn"], ["privacy", "proxy"], ["privacy", "tor"],
    ];
    const matched = riskPaths
      .filter((path) => isTruthyRiskValue(readNested(json, path)))
      .map((path) => `ip_intel_${path.join("_")}`);

    return { vpnSuspected: matched.length > 0, flags: matched, raw: matched.length ? json : undefined };
  } catch (err) {
    logger.warn({ err }, "Optional IP intelligence check failed");
    return { vpnSuspected: false, flags: ["ip_intel_error"] };
  }
}

async function assessRisk(input: RiskSignalInput): Promise<RiskAssessment> {
  const { ip, hops } = extractClientIp(input.request);
  const flags = new Set<string>();
  const signals: Record<string, unknown> = {
    ipHash: ip ? hashIp(ip) : null,
    ipCountry: firstHeader(input.request, "cf-ipcountry"),
    forwardedHopCount: hops.length,
    userAgent: firstHeader(input.request, "user-agent")?.slice(0, 160) ?? null,
  };

  let scoreDelta = 0;
  let vpnSuspected = false;

  if (hops.length > 2) {
    flags.add("multi_hop_proxy_header");
    scoreDelta += 1;
  }

  const proxyHeaderNames = ["via", "forwarded", "x-proxy-id", "x-real-ip", "x-forwarded-host"];
  const proxyHeaders = proxyHeaderNames.filter((name) => Boolean(firstHeader(input.request, name)));
  if (proxyHeaders.length > 0) {
    flags.add("proxy_headers_present");
    scoreDelta += 1;
    signals.proxyHeaders = proxyHeaders;
  }

  const authError = input.deviceInfo?.authError;
  if (input.authVerified === false || (typeof authError === "string" && authError.trim())) {
    flags.add("firebase_auth_not_verified");
    scoreDelta += 1;
  }

  const db = getFirestoreDb();
  if (input.installId) {
    const installSnap = await db.collection("users").where("installId", "==", input.installId).limit(3).get();
    const otherUsers = installSnap.docs.filter((doc) => doc.id !== input.deviceId);
    if (otherUsers.length > 0) {
      flags.add("duplicate_install_id");
      scoreDelta += 2;
      signals.duplicateInstallUsers = otherUsers.map((doc) => doc.id).slice(0, 3);
    }
  }

  if (ip) {
    const ipHash = hashIp(ip);
    const ipSnap = await db.collection("users").where("lastIpHash", "==", ipHash).limit(SHARED_IP_LIMIT + 2).get();
    const otherIpUsers = ipSnap.docs.filter((doc) => doc.id !== input.deviceId);
    if (otherIpUsers.length >= SHARED_IP_LIMIT) {
      flags.add("shared_ip_many_accounts");
      scoreDelta += 2;
      signals.sharedIpUserCount = otherIpUsers.length + 1;
    }

    const intel = await optionalIpIntel(ip);
    if (intel.vpnSuspected) {
      vpnSuspected = true;
      scoreDelta += 4;
      intel.flags.forEach((flag) => flags.add(flag));
    }
  }

  return { scoreDelta, flags: Array.from(flags), vpnSuspected, signals };
}

export async function applyFraudRiskSignals(input: RiskSignalInput) {
  const db = getFirestoreDb();
  const userRef = db.collection("users").doc(input.deviceId);
  const userSnap = await userRef.get();
  const current = userSnap.data() ?? {};
  const assessment = await assessRisk(input);
  const existingFlags = Array.isArray(current.fraudFlags) ? current.fraudFlags.map(String) : [];
  const mergedFlags = Array.from(new Set([...existingFlags, ...assessment.flags]));
  const currentScore = Number(current.suspiciousScore ?? 0);
  const nextScore = Math.max(currentScore, currentScore + assessment.scoreDelta);
  const riskLevel = nextScore >= HIGH_RISK_SCORE ? "high" : nextScore >= MANUAL_REVIEW_SCORE ? "medium" : "low";

  await userRef.set({
    suspiciousScore: nextScore,
    fraudFlags: mergedFlags,
    manualReviewRequired: Boolean(current.manualReviewRequired) || nextScore >= MANUAL_REVIEW_SCORE,
    vpnSuspected: Boolean(current.vpnSuspected) || assessment.vpnSuspected,
    riskLevel,
    riskSignals: assessment.signals,
    lastIpHash: assessment.signals.ipHash ?? null,
    lastIpCountry: assessment.signals.ipCountry ?? null,
    lastRiskCheckAt: nowTs(),
    updatedAt: nowTs(),
  }, { merge: true });

  return { score: nextScore, riskLevel, flags: mergedFlags, vpnSuspected: Boolean(current.vpnSuspected) || assessment.vpnSuspected };
}
