import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { registerPushToken } from "./api";

type ConstantsWithEas = typeof Constants & {
  easConfig?: { projectId?: string };
  expoConfig?: {
    version?: string;
    extra?: { eas?: { projectId?: string } };
  };
};

const constantsAny = Constants as ConstantsWithEas;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  } as Notifications.NotificationBehavior),
});

function getProjectId(): string | undefined {
  return constantsAny.expoConfig?.extra?.eas?.projectId ?? constantsAny.easConfig?.projectId;
}

async function ensureAndroidChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "Earn Daily updates",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#FACC15",
  });
}

export async function registerDevicePushNotifications(deviceId: string, deviceInfo?: Record<string, unknown> | null): Promise<string | null> {
  if (Platform.OS === "web") return null;

  try {
    await ensureAndroidChannel();

    const existing = await Notifications.getPermissionsAsync();
    let finalStatus = existing.status;
    if (finalStatus !== "granted") {
      const requested = await Notifications.requestPermissionsAsync();
      finalStatus = requested.status;
    }

    if (finalStatus !== "granted") return null;

    const projectId = getProjectId();
    const tokenResponse = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    const token = tokenResponse.data;

    await registerPushToken(deviceId, {
      token,
      platform: Platform.OS,
      deviceName: typeof deviceInfo?.model === "string" ? deviceInfo.model : null,
      appVersion: typeof deviceInfo?.appVersion === "string" ? deviceInfo.appVersion : constantsAny.expoConfig?.version ?? null,
    });

    return token;
  } catch (err) {
    console.warn("Push notification registration skipped", err);
    return null;
  }
}
