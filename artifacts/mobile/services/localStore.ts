import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

export async function getStoredValue(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
  }
  try { return await SecureStore.getItemAsync(key); } catch { return null; }
}

export async function setStoredValue(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    try { globalThis.localStorage?.setItem(key, value); } catch {}
    return;
  }
  try { await SecureStore.setItemAsync(key, value); } catch {}
}
