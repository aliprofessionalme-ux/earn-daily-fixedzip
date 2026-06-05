import { Platform } from "react-native";
import Constants from "expo-constants";
import { getStoredValue, setStoredValue } from "./localStore";

const INSTALL_ID_KEY = "engage_earn_install_id";
const DEVICE_ID_KEY = "engage_earn_device_id";

type ExpoApplicationModule = typeof import("expo-application");

async function loadApplication(): Promise<ExpoApplicationModule | null> {
  if (Platform.OS === "web") return null;
  try {
    return await import("expo-application");
  } catch {
    return null;
  }
}

function randomId(prefix: string) {
  const nativeRandom = typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID() : null;
  return `${prefix}_${nativeRandom ?? `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`}`;
}

function readPlatformConstant(name: string): string | null {
  const constants = Platform.constants as Record<string, unknown> | undefined;
  const value = constants?.[name];
  return typeof value === "string" && value.length ? value : null;
}

export interface DeviceIdentity {
  deviceId: string;
  installId: string;
  deviceFingerprint: string;
  deviceInfo: Record<string, unknown>;
}

export async function getDeviceIdentity(): Promise<DeviceIdentity> {
  const Application = await loadApplication();
  let installId = await getStoredValue(INSTALL_ID_KEY);
  if (!installId) {
    installId = randomId("install");
    await setStoredValue(INSTALL_ID_KEY, installId);
  }

  let deviceId = await getStoredValue(DEVICE_ID_KEY);
  if (!deviceId) {
    const androidId = Platform.OS === "android" && Application ? Application.getAndroidId() : null;
    deviceId = androidId ? `android_${androidId}` : randomId("device");
    await setStoredValue(DEVICE_ID_KEY, deviceId);
  }

  const deviceInfo = {
    platform: Platform.OS,
    osVersion: Platform.Version,
    model: readPlatformConstant("Model") ?? readPlatformConstant("model") ?? "unknown",
    manufacturer: readPlatformConstant("Manufacturer") ?? readPlatformConstant("manufacturer") ?? "unknown",
    brand: readPlatformConstant("Brand") ?? readPlatformConstant("brand") ?? "unknown",
    appVersion: Application?.nativeApplicationVersion ?? Constants.expoConfig?.version ?? "unknown",
    buildVersion: Application?.nativeBuildVersion ?? "unknown",
    appOwnership: Constants.appOwnership ?? "unknown",
  };

  const rawFingerprint = JSON.stringify({ ...deviceInfo, deviceId, installId });
  const deviceFingerprint = `fp_${Array.from(rawFingerprint).reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0).toString(36)}_${installId.slice(-10)}`;

  return { deviceId, installId, deviceFingerprint, deviceInfo };
}

export async function setCanonicalDeviceId(deviceId: string): Promise<void> {
  await setStoredValue(DEVICE_ID_KEY, deviceId);
}
