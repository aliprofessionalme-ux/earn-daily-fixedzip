import { Platform } from "react-native";

type SecureStoreModule = typeof import("expo-secure-store");

async function loadSecureStore(): Promise<SecureStoreModule | null> {
  if (Platform.OS === "web") return null;
  try {
    return await import("expo-secure-store");
  } catch {
    return null;
  }
}

export async function getStoredValue(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
  }

  const SecureStore = await loadSecureStore();
  if (!SecureStore) return null;
  try { return await SecureStore.getItemAsync(key); } catch { return null; }
}

export async function setStoredValue(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    try { globalThis.localStorage?.setItem(key, value); } catch {}
    return;
  }

  const SecureStore = await loadSecureStore();
  if (!SecureStore) return;
  try { await SecureStore.setItemAsync(key, value); } catch {}
}
