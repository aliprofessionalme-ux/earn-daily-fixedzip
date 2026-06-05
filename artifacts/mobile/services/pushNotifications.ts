import Constants from "expo-constants";
import { Platform } from "react-native";
import { registerPushToken } from "./api";

type ExpoNotificationsModule = typeof import("expo-notifications");
type NotificationBehavior = import("expo-notifications").NotificationBehavior;

type ConstantsWithEas = typeof Constants & {
  easConfig?: { projectId?: string };
  expoConfig?: {
    version?: string;
    extra?: { eas?: { projectId?: string } };
  };
};

const constantsAny = Constants as ConstantsWithEas;
let notificationHandlerConfigured = false;

async function loadNotifications(): Promise<ExpoNotificationsModule | null> {
  if (Platform.OS === "web") return null;
  return import("expo-notifications");
}

function configureNotificationHandler(Notifications: ExpoNotificationsModule) {
  if (notificationHandlerConfigured) return;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    } as NotificationBehavior),
  });

  notificationHandlerConfigured = true;
}

function getProjectId(): string | undefined {
  return constantsAny.expoConfig?.extra?.eas?.projectId ?? constantsAny.easConfig?.projectId;
}

async function ensureAndroidChannel(Notifications: ExpoNotificationsModule) {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "Earn Daily updates",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#FACC15",
  });
}

export async function registerDevicePushNotifications(deviceId: string, deviceInfo?: Record<string, unknown> | null): Promise<string | null> {
  const Notifications = await loadNotifications();
  if (!Notifications) return null;

  try {
    configureNotificationHandler(Notifications);
    await ensureAndroidChannel(Notifications);

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
