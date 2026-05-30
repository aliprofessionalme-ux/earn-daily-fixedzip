import Constants from "expo-constants";

const constantsAny = Constants as typeof Constants & {
  expoConfig?: { hostUri?: string };
  manifest2?: { extra?: { expoGo?: { debuggerHost?: string } } };
  expoGoConfig?: { debuggerHost?: string };
};

const DEFAULT_TIMEOUT_MS = 12000;

function cleanUrl(value?: string | null): string {
  return String(value ?? "").trim().replace(/\/$/, "");
}

function withApiSuffix(value: string): string {
  const cleaned = cleanUrl(value);
  return cleaned.endsWith("/api") ? cleaned : `${cleaned}/api`;
}

function normalizeHostUri(hostUri?: string | null): string {
  const host = cleanUrl(hostUri);
  if (!host) return "";
  const withoutPath = host.replace(/^https?:\/\//, "").split("/")[0];
  if (!withoutPath) return "";
  if (withoutPath.includes("localhost") || withoutPath.includes("127.0.0.1")) return "";
  return `https://${withoutPath.replace(/:\d+$/, "")}`;
}

function resolveApiBaseUrl(): string {
  const explicit = cleanUrl(process.env.EXPO_PUBLIC_API_BASE_URL);
  if (explicit) return withApiSuffix(explicit);

  const replitDomain = cleanUrl(process.env.EXPO_PUBLIC_DOMAIN);
  if (replitDomain) return withApiSuffix(`https://${replitDomain.replace(/^https?:\/\//, "")}`);

  const expoHost = normalizeHostUri(
    constantsAny.expoConfig?.hostUri ??
      constantsAny.manifest2?.extra?.expoGo?.debuggerHost ??
      constantsAny.expoGoConfig?.debuggerHost ??
      "",
  );
  if (expoHost) return withApiSuffix(expoHost);

  console.error(
    "Earn Daily API URL is missing. Set EXPO_PUBLIC_API_BASE_URL or run from Replit with EXPO_PUBLIC_DOMAIN available.",
  );
  return "";
}

export const API_BASE_URL = resolveApiBaseUrl();

let _firebaseToken: string | null = null;

export function setApiFirebaseToken(token: string | null) {
  _firebaseToken = token;
}

export function getApiFirebaseToken(): string | null {
  return _firebaseToken;
}

export interface UserDocument {
  deviceId: string;
  installId?: string | null;
  deviceFingerprint?: string | null;
  firebaseUid?: string | null;
  authMode: "firebase-anonymous" | "device-only";
  authVerified: boolean;
  displayName?: string | null;
  phone?: string | null;
  referralCode?: string | null;
  referredByDeviceId?: string | null;
  referralBonusAwarded?: boolean;
  referralBonusCoinsEarned?: number;
  referredByCode?: string | null;
  dailyTasksCompletedToday?: number;
  lastDailyTaskDate?: string | null;
  currentDailyStreak?: number;
  longestDailyStreak?: number;
  dailyEnergyEarnedToday?: number;
  lastDailyEnergyDate?: string | null;
  lifetimeCompletedTasks?: number;
  lifetimeEnergyEarned?: number;
  // Legacy single balance (kept for backward compat, synced with confirmed)
  coinsBalance: number;
  pkrBalance: number;
  // New multi-balance system
  energyBalance: number;
  pendingCoinsBalance: number;
  confirmedCoinsBalance: number;
  totalEarnedCoins: number;
  // Daily limits
  lastCheckInTimestamp: string | null;
  dailySpinsUsed: number;
  dailyScratchUsed: number;
  lastSpinResetDate: string | null;
  lastScratchResetDate: string | null;
  // Task slots
  taskSlotsUsedToday: number;
  lastTaskSlotResetDate: string | null;
  extraSlotsUnlocked: number;
  // Status
  isBanned: boolean;
  banReason?: string | null;
  suspiciousScore?: number;
  fraudFlags?: string[];
  manualReviewRequired: boolean;
  firstWithdrawalCompleted: boolean;
  createdAt: string;
  updatedAt: string;
  lastActiveAt?: string;
  duplicateRestored?: boolean;
  authWarning?: string | null;
}

export interface RewardResult {
  success: boolean;
  message: string;
  // Energy-based rewards (spin, scratch, check-in)
  energyAwarded?: number;
  balanceAfterEnergy?: number;
  spinsLeft?: number;
  scratchLeft?: number;
  rewardSegments?: readonly number[];
}

export interface WithdrawalDocument {
  withdrawalId: string;
  deviceId: string;
  paymentMethod: "Easypaisa" | "JazzCash";
  accountNumber: string;
  accountTitle: string;
  amountPKR: number;
  coinsDeducted: number;
  status: "pending" | "review" | "approved" | "rejected" | "paid";
  adminNote: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
  paidAt: string | null;
}

export interface LeaderboardUser {
  rank: number;
  maskedUserId: string;
  displayName: string;
  confirmedCoinsBalance: number;
  pendingCoinsBalance: number;
  energyBalance: number;
  currentDailyStreak: number;
  dailyTasksCompletedToday: number;
  lastActiveAt?: string | null;
}

export interface ReferralSummary {
  referralCode: string;
  referralUrl: string;
  bonusCoins: number;
  requiredTasks: number;
  requiredEnergy: number;
  totalReferred: number;
  qualifiedReferrals: number;
  pendingReferrals: number;
  referredUsers: Array<{
    maskedUserId: string;
    displayName: string;
    qualified: boolean;
    tasksToday: number;
    energyToday: number;
    joinedAt?: string | null;
  }>;
}

export interface WithdrawalEligibility {
  eligible: boolean;
  reasons: string[];
  tasksToday: number;
  requiredDailyTasks: number;
  streakActive: boolean;
  currentDailyStreak: number;
}

export type TransactionType =
  | "checkin"
  | "spin"
  | "scratch"
  | "offerwall_pending"
  | "offerwall_confirmed"
  | "offerwall_rejected"
  | "offerwall_reversed"
  | "unity_reward_energy"
  | "unity_interstitial"
  | "withdrawal_hold"
  | "withdrawal_refund"
  | "admin_adjustment"
  | "energy_purchase_slot"
  | "referral_bonus";

export interface TransactionDocument {
  transactionId: string;
  deviceId: string;
  type: TransactionType;
  coinsChange: number;
  pkrChange: number;
  balanceAfterCoins?: number;
  balanceAfterPKR?: number;
  source: string;
  status: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface SupportTicket {
  ticketId: string;
  deviceId: string;
  issueType: string;
  message: string;
  status: "open" | "replied" | "closed";
  createdAt: string;
  updatedAt: string;
}

export type OfferCategory = "game" | "survey" | "app_install" | "high_reward" | "partner_task" | "unknown";

export interface OfferEventDocument {
  eventId: string;
  provider: "monlix" | "tapjoy" | "ayet" | "pubscale";
  externalTransactionId: string;
  deviceId: string;
  firebaseUid: string | null;
  offerName: string;
  offerCategory: OfferCategory;
  payoutUSD: number;
  coinsCalculated: number;
  status: "pending_verification" | "confirmed" | "rejected" | "reversed" | "manual_review_required";
  verificationHoldUntil: string | null;
  createdAt: string;
  confirmedAt: string | null;
  rejectedAt: string | null;
  reversedAt: string | null;
  rejectionReason: string | null;
  reversalReason: string | null;
}

export interface AdEventDocument {
  eventId: string;
  provider: "unity";
  deviceId: string;
  adType: "rewarded" | "interstitial";
  placementId: string | null;
  status: "completed" | "shown" | "failed" | "skipped";
  energyGiven: number;
  estimatedRevenueUSD: number | null;
  createdAt: string;
}

export interface ProviderLaunchItem {
  enabled: boolean;
  publicAppId?: string;
  reason?: string;
}

export interface ProviderLaunchStatus {
  gameTasks: ProviderLaunchItem;
  surveyRewards: ProviderLaunchItem;
  appInstallTasks: ProviderLaunchItem;
  highRewardOffers: ProviderLaunchItem;
  partnerTasks: ProviderLaunchItem;
  watchAdsEnergy: ProviderLaunchItem;
}

export interface ProviderCallbackUrls {
  monlix: string;
  tapjoy: string;
  ayet: string;
  pubscale: string;
  unity: string;
}

export interface AppSettings {
  coinRateCoins: number;
  coinRatePKR: number;
  minimumWithdrawalPKR: number;
  minWithdrawalPKR?: number;
  newUserHoldDays: number;
  normalHoldDays: number;
  largeRewardManualReviewUSD: number;
  spinDailyLimit: number;
  scratchDailyLimit: number;
  dailySpinLimit?: number;
  dailyScratchLimit?: number;
  freeTaskSlots: number;
  energyPerExtraSlot: number;
  checkInEnergy: number;
  spinEnergyReward: number;
  scratchEnergyReward: number;
  unityRewardedEnergy: number;
  providerLaunch?: ProviderLaunchStatus;
  providerCallbackUrls?: ProviderCallbackUrls;
  timezone?: string;
}

interface InitUserPayload {
  deviceId: string;
  installId: string;
  deviceFingerprint: string;
  firebaseUid: string | null;
  firebaseToken: string | null;
  authMode: "firebase-anonymous" | "device-only";
  authVerified: boolean;
  deviceInfo: Record<string, unknown>;
}

async function apiFetch<T>(path: string, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error("API URL is missing. Set EXPO_PUBLIC_API_BASE_URL or run the mobile app from the current Replit domain.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...((init.headers as Record<string, string>) ?? {}),
  };
  const token = _firebaseToken;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: "include",
      headers,
      signal: controller.signal,
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string } & T;
    if (!response.ok) {
      throw new Error(data.error || data.message || `Request failed (${response.status})`);
    }
    return data as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Connection timed out. Check backend URL and network.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function initUser(payload: InitUserPayload): Promise<UserDocument> {
  return apiFetch<UserDocument>("/users/init", { method: "POST", body: JSON.stringify(payload) });
}

export async function getUser(deviceId: string): Promise<UserDocument> {
  return apiFetch<UserDocument>(`/users/${encodeURIComponent(deviceId)}`);
}

export async function updateUserProfile(deviceId: string, payload: { displayName: string; phone?: string | null }): Promise<{ success: boolean; user: UserDocument | null }> {
  return apiFetch(`/users/${encodeURIComponent(deviceId)}/profile`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function getLeaderboard(limit = 50): Promise<LeaderboardUser[]> {
  return apiFetch<LeaderboardUser[]>(`/users/leaderboard?limit=${encodeURIComponent(String(limit))}`);
}

export async function getReferralSummary(deviceId: string): Promise<ReferralSummary> {
  return apiFetch<ReferralSummary>(`/users/${encodeURIComponent(deviceId)}/referral`);
}

export async function applyReferralCode(deviceId: string, referralCode: string): Promise<{ success: boolean; message: string }> {
  return apiFetch(`/users/${encodeURIComponent(deviceId)}/referral/apply`, { method: "POST", body: JSON.stringify({ referralCode }) });
}

export async function checkIn(deviceId: string): Promise<RewardResult> {
  return apiFetch<RewardResult>(`/users/${encodeURIComponent(deviceId)}/checkin`, { method: "POST", body: JSON.stringify({}) });
}

export async function spin(deviceId: string): Promise<RewardResult> {
  return apiFetch<RewardResult>(`/users/${encodeURIComponent(deviceId)}/spin`, { method: "POST", body: JSON.stringify({}) });
}

export async function scratch(deviceId: string): Promise<RewardResult> {
  return apiFetch<RewardResult>(`/users/${encodeURIComponent(deviceId)}/scratch`, { method: "POST", body: JSON.stringify({}) });
}

export async function getTransactions(deviceId: string): Promise<TransactionDocument[]> {
  return apiFetch<TransactionDocument[]>(`/users/${encodeURIComponent(deviceId)}/transactions`);
}

export async function getWithdrawals(deviceId: string): Promise<WithdrawalDocument[]> {
  return apiFetch<WithdrawalDocument[]>(`/users/${encodeURIComponent(deviceId)}/withdrawals`);
}

export async function submitWithdrawal(deviceId: string, payload: {
  paymentMethod: "Easypaisa" | "JazzCash";
  accountNumber: string;
  accountTitle: string;
  amountPKR: number;
}): Promise<{ success: boolean; message: string; withdrawalId: string }> {
  return apiFetch(`/users/${encodeURIComponent(deviceId)}/withdrawals`, { method: "POST", body: JSON.stringify(payload) });
}

export async function getSupportTickets(deviceId: string): Promise<SupportTicket[]> {
  return apiFetch<SupportTicket[]>(`/users/${encodeURIComponent(deviceId)}/support`);
}

export async function submitSupportTicket(deviceId: string, payload: { issueType: string; message: string }): Promise<SupportTicket & { success: boolean }> {
  return apiFetch(`/users/${encodeURIComponent(deviceId)}/support`, { method: "POST", body: JSON.stringify(payload) });
}

// Unity endpoints are intentionally disabled server-side until native SDK verification is implemented.
export async function recordUnityRewardedComplete(deviceId: string, placementId?: string): Promise<RewardResult> {
  return apiFetch<RewardResult>(`/users/${encodeURIComponent(deviceId)}/ads/unity/rewarded-complete`, {
    method: "POST",
    body: JSON.stringify({ placementId: placementId ?? null }),
  });
}

export async function recordUnityInterstitialShown(deviceId: string, placementId?: string): Promise<{ success: boolean; message: string }> {
  return apiFetch(`/users/${encodeURIComponent(deviceId)}/ads/unity/interstitial-shown`, {
    method: "POST",
    body: JSON.stringify({ placementId: placementId ?? null }),
  });
}

export async function unlockExtraTaskSlot(deviceId: string): Promise<{ success: boolean; message: string; energyAfter: number; extraSlots: number }> {
  return apiFetch(`/users/${encodeURIComponent(deviceId)}/task-slots/unlock`, { method: "POST", body: JSON.stringify({}) });
}

export async function getOfferEvents(deviceId: string): Promise<OfferEventDocument[]> {
  return apiFetch<OfferEventDocument[]>(`/users/${encodeURIComponent(deviceId)}/offer-events`);
}

export async function getAppSettings(): Promise<AppSettings> {
  return apiFetch<AppSettings>("/settings");
}
