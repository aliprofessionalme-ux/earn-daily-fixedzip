import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { getStoredValue, setStoredValue } from "@/services/localStore";
import { getDeviceIdentity, setCanonicalDeviceId, type DeviceIdentity } from "@/services/deviceIdentity";
import { initAnonymousFirebaseAuth } from "@/services/firebaseClient";
import {
  checkIn as apiCheckIn,
  getUser as apiGetUser,
  initUser as apiInitUser,
  scratch as apiScratch,
  spin as apiSpin,
  submitWithdrawal as apiSubmitWithdrawal,
  recordUnityRewardedComplete as apiRecordUnityRewarded,
  recordUnityInterstitialShown as apiRecordUnityInterstitial,
  unlockExtraTaskSlot as apiUnlockExtraTaskSlot,
  setApiFirebaseToken,
  type RewardResult,
  type UserDocument,
} from "@/services/api";

const ONBOARDING_KEY = "engage_earn_onboarding_complete";

interface UserContextType {
  deviceId: string | null;
  installId: string | null;
  firebaseUid: string | null;
  authMode: "firebase-anonymous" | "device-only";
  authVerified: boolean;
  user: UserDocument | null;
  deviceIdentity: DeviceIdentity | null;
  isLoading: boolean;
  error: string | null;
  onboardingComplete: boolean;
  refreshUser: () => Promise<void>;
  retryInit: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  checkIn: () => Promise<RewardResult>;
  spin: () => Promise<RewardResult>;
  scratch: () => Promise<RewardResult>;
  submitWithdrawal: (payload: { paymentMethod: "Easypaisa" | "JazzCash"; accountNumber: string; accountTitle: string; amountPKR: number }) => Promise<{ success: boolean; message: string; withdrawalId: string }>;
  recordUnityRewardedComplete: (placementId?: string) => Promise<RewardResult>;
  recordUnityInterstitialShown: (placementId?: string) => Promise<{ success: boolean; message: string }>;
  unlockExtraTaskSlot: () => Promise<{ success: boolean; message: string; energyAfter: number; extraSlots: number }>;
}

const UserContext = createContext<UserContextType | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  const [deviceIdentity, setDeviceIdentity] = useState<DeviceIdentity | null>(null);
  const [firebaseUid, setFirebaseUid] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"firebase-anonymous" | "device-only">("device-only");
  const [authVerified, setAuthVerified] = useState(false);
  const [user, setUser] = useState<UserDocument | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  const initialize = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [identity, onboardedRaw] = await Promise.all([
        getDeviceIdentity(),
        getStoredValue(ONBOARDING_KEY),
      ]);
      setDeviceIdentity(identity);
      setOnboardingComplete(onboardedRaw === "true");

      const auth = await initAnonymousFirebaseAuth();
      setFirebaseUid(auth.firebaseUid);
      setAuthMode(auth.authMode);
      setAuthVerified(auth.authVerified);
      setApiFirebaseToken(auth.firebaseToken);

      const initialized = await apiInitUser({
        deviceId: identity.deviceId,
        installId: identity.installId,
        deviceFingerprint: identity.deviceFingerprint,
        firebaseUid: auth.firebaseUid,
        firebaseToken: auth.firebaseToken,
        authMode: auth.authMode,
        authVerified: auth.authVerified,
        deviceInfo: { ...identity.deviceInfo, authError: auth.error ?? null },
      });
      const canonicalIdentity = initialized.deviceId && initialized.deviceId !== identity.deviceId
        ? { ...identity, deviceId: initialized.deviceId }
        : identity;
      if (canonicalIdentity.deviceId !== identity.deviceId) {
        await setCanonicalDeviceId(canonicalIdentity.deviceId);
        setDeviceIdentity(canonicalIdentity);
      }
      setFirebaseUid(initialized.firebaseUid ?? auth.firebaseUid);
      setAuthMode(initialized.authMode ?? auth.authMode);
      setAuthVerified(Boolean(initialized.authVerified));
      setUser(initialized);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    if (!deviceIdentity?.deviceId) return;
    const latest = await apiGetUser(deviceIdentity.deviceId);
    setUser(latest);
  }, [deviceIdentity?.deviceId]);

  const completeOnboarding = useCallback(async () => {
    await setStoredValue(ONBOARDING_KEY, "true");
    setOnboardingComplete(true);
  }, []);

  const requireDeviceId = useCallback(() => {
    if (!deviceIdentity?.deviceId) throw new Error("Account is not initialized yet.");
    return deviceIdentity.deviceId;
  }, [deviceIdentity?.deviceId]);

  const checkIn = useCallback(async () => {
    const result = await apiCheckIn(requireDeviceId());
    await refreshUser();
    return result;
  }, [refreshUser, requireDeviceId]);

  const spin = useCallback(async () => {
    const result = await apiSpin(requireDeviceId());
    await refreshUser();
    return result;
  }, [refreshUser, requireDeviceId]);

  const scratch = useCallback(async () => {
    const result = await apiScratch(requireDeviceId());
    await refreshUser();
    return result;
  }, [refreshUser, requireDeviceId]);

  const submitWithdrawal = useCallback(async (payload: { paymentMethod: "Easypaisa" | "JazzCash"; accountNumber: string; accountTitle: string; amountPKR: number }) => {
    const result = await apiSubmitWithdrawal(requireDeviceId(), payload);
    await refreshUser();
    return result;
  }, [refreshUser, requireDeviceId]);

  const recordUnityRewardedComplete = useCallback(async (placementId?: string) => {
    const result = await apiRecordUnityRewarded(requireDeviceId(), placementId);
    await refreshUser();
    return result;
  }, [refreshUser, requireDeviceId]);

  const recordUnityInterstitialShown = useCallback(async (placementId?: string) => {
    const result = await apiRecordUnityInterstitial(requireDeviceId(), placementId);
    return result;
  }, [requireDeviceId]);

  const unlockExtraTaskSlot = useCallback(async () => {
    const result = await apiUnlockExtraTaskSlot(requireDeviceId());
    await refreshUser();
    return result;
  }, [refreshUser, requireDeviceId]);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  const value = useMemo<UserContextType>(() => ({
    deviceId: deviceIdentity?.deviceId ?? null,
    installId: deviceIdentity?.installId ?? null,
    firebaseUid,
    authMode,
    authVerified,
    user,
    deviceIdentity,
    isLoading,
    error,
    onboardingComplete,
    refreshUser,
    retryInit: initialize,
    completeOnboarding,
    checkIn,
    spin,
    scratch,
    submitWithdrawal,
    recordUnityRewardedComplete,
    recordUnityInterstitialShown,
    unlockExtraTaskSlot,
  }), [authMode, authVerified, checkIn, completeOnboarding, deviceIdentity, error, firebaseUid, initialize, isLoading, onboardingComplete, refreshUser, recordUnityInterstitialShown, recordUnityRewardedComplete, scratch, spin, submitWithdrawal, unlockExtraTaskSlot, user]);

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used inside UserProvider");
  return ctx;
}
