import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { Platform } from "react-native";
import { getStoredValue, setStoredValue } from "@/services/localStore";
import { getDeviceIdentity, setCanonicalDeviceId, type DeviceIdentity } from "@/services/deviceIdentity";
import { getCurrentGoogleAuth, signInWithGoogleIdToken, signInWithGooglePopup, signOutGoogle } from "@/services/firebaseClient";
import { registerDevicePushNotifications } from "@/services/pushNotifications";
import {
  checkIn as apiCheckIn,
  getUser as apiGetUser,
  initUser as apiInitUser,
  scratch as apiScratch,
  spin as apiSpin,
  startCoinRushGame as apiStartCoinRushGame,
  submitWithdrawal as apiSubmitWithdrawal,
  recordUnityRewardedComplete as apiRecordUnityRewarded,
  recordUnityInterstitialShown as apiRecordUnityInterstitial,
  unlockExtraTaskSlot as apiUnlockExtraTaskSlot,
  updateUserProfile as apiUpdateUserProfile,
  setApiFirebaseToken,
  type CoinRushStartResult,
  type RewardResult,
  type TaskSlotStatus,
  type UserDocument,
  type WithdrawalPaymentMethod,
} from "@/services/api";

const ONBOARDING_KEY = "engage_earn_onboarding_complete";

interface UserContextType {
  deviceId: string | null;
  installId: string | null;
  firebaseUid: string | null;
  authMode: "firebase-anonymous" | "device-only";
  authVerified: boolean;
  googleEmail: string | null;
  googleDisplayName: string | null;
  googlePhotoURL: string | null;
  user: UserDocument | null;
  deviceIdentity: DeviceIdentity | null;
  isLoading: boolean;
  error: string | null;
  onboardingComplete: boolean;
  refreshUser: () => Promise<void>;
  retryInit: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithGoogleToken: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  updateProfile: (displayName: string, phone?: string | null) => Promise<void>;
  checkIn: () => Promise<RewardResult>;
  spin: () => Promise<RewardResult>;
  scratch: () => Promise<RewardResult>;
  startCoinRushGame: () => Promise<CoinRushStartResult>;
  submitWithdrawal: (payload: { paymentMethod: WithdrawalPaymentMethod; accountNumber: string; accountTitle: string; amountPKR: number }) => Promise<{ success: boolean; message: string; withdrawalId: string }>;
  recordUnityRewardedComplete: (placementId?: string) => Promise<RewardResult>;
  recordUnityInterstitialShown: (placementId?: string) => Promise<{ success: boolean; message: string }>;
  unlockExtraTaskSlot: () => Promise<{ success: boolean; message: string; energyAfter: number; extraSlots: number; taskSlots: TaskSlotStatus }>;
}

const UserContext = createContext<UserContextType | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  const [deviceIdentity, setDeviceIdentity] = useState<DeviceIdentity | null>(null);
  const [firebaseUid, setFirebaseUid] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"firebase-anonymous" | "device-only">("device-only");
  const [authVerified, setAuthVerified] = useState(false);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [googleDisplayName, setGoogleDisplayName] = useState<string | null>(null);
  const [googlePhotoURL, setGooglePhotoURL] = useState<string | null>(null);
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

      const auth = await getCurrentGoogleAuth();
      if (!auth) {
        setFirebaseUid(null);
        setAuthMode("device-only");
        setAuthVerified(false);
        setGoogleEmail(null);
        setGoogleDisplayName(null);
        setGooglePhotoURL(null);
        setApiFirebaseToken(null);
        setUser(null);
        return;
      }
      setFirebaseUid(auth.firebaseUid);
      setAuthMode(auth.authMode);
      setAuthVerified(auth.authVerified);
      setGoogleEmail(auth.email ?? null);
      setGoogleDisplayName(auth.displayName ?? null);
      setGooglePhotoURL(auth.photoURL ?? null);
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
      void registerDevicePushNotifications(canonicalIdentity.deviceId, canonicalIdentity.deviceInfo);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const applyGoogleAuth = useCallback(async (auth: Awaited<ReturnType<typeof getCurrentGoogleAuth>>) => {
    if (!auth) throw new Error("Google sign-in did not return an account.");
    setFirebaseUid(auth.firebaseUid);
    setAuthMode(auth.authMode);
    setAuthVerified(auth.authVerified);
    setGoogleEmail(auth.email ?? null);
    setGoogleDisplayName(auth.displayName ?? null);
    setGooglePhotoURL(auth.photoURL ?? null);
    setApiFirebaseToken(auth.firebaseToken);
    await initialize();
  }, [initialize]);

  const signInWithGoogle = useCallback(async () => {
    const useFullScreenLoading = Platform.OS !== "web";
    if (useFullScreenLoading) setIsLoading(true);
    setError(null);
    try {
      const result = await signInWithGooglePopup();
      if (!result.firebaseUid && !result.firebaseToken && typeof window !== "undefined") {
        return;
      }
      if (!useFullScreenLoading) setIsLoading(true);
      await applyGoogleAuth(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setIsLoading(false);
    }
  }, [applyGoogleAuth]);

  const signInWithGoogleToken = useCallback(async (idToken: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await applyGoogleAuth(await signInWithGoogleIdToken(idToken));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setIsLoading(false);
    }
  }, [applyGoogleAuth]);

  const logout = useCallback(async () => {
    await signOutGoogle();
    setApiFirebaseToken(null);
    setFirebaseUid(null);
    setAuthMode("device-only");
    setAuthVerified(false);
    setGoogleEmail(null);
    setGoogleDisplayName(null);
    setGooglePhotoURL(null);
    setUser(null);
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

  const updateProfile = useCallback(async (displayName: string, phone?: string | null) => {
    const result = await apiUpdateUserProfile(requireDeviceId(), { displayName, phone });
    if (result.user) setUser(result.user);
    else await refreshUser();
  }, [refreshUser, requireDeviceId]);

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

  const startCoinRushGame = useCallback(async () => {
    const result = await apiStartCoinRushGame(requireDeviceId());
    await refreshUser();
    return result;
  }, [refreshUser, requireDeviceId]);

  const submitWithdrawal = useCallback(async (payload: { paymentMethod: WithdrawalPaymentMethod; accountNumber: string; accountTitle: string; amountPKR: number }) => {
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
    googleEmail,
    googleDisplayName,
    googlePhotoURL,
    user,
    deviceIdentity,
    isLoading,
    error,
    onboardingComplete,
    refreshUser,
    retryInit: initialize,
    signInWithGoogle,
    signInWithGoogleToken,
    logout,
    completeOnboarding,
    updateProfile,
    checkIn,
    spin,
    scratch,
    startCoinRushGame,
    submitWithdrawal,
    recordUnityRewardedComplete,
    recordUnityInterstitialShown,
    unlockExtraTaskSlot,
  }), [authMode, authVerified, checkIn, completeOnboarding, deviceIdentity, error, firebaseUid, googleDisplayName, googleEmail, googlePhotoURL, initialize, isLoading, logout, onboardingComplete, refreshUser, recordUnityInterstitialShown, recordUnityRewardedComplete, scratch, signInWithGoogle, signInWithGoogleToken, spin, startCoinRushGame, submitWithdrawal, unlockExtraTaskSlot, updateProfile, user]);

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used inside UserProvider");
  return ctx;
}
