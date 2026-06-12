import { getStoredValue, setStoredValue } from "@/services/localStore";

const PROFILE_PHOTO_URI_KEY = "earn_daily_profile_photo_uri";

export async function getProfilePhotoUri(): Promise<string | null> {
  const value = await getStoredValue(PROFILE_PHOTO_URI_KEY);
  const uri = String(value ?? "").trim();
  return uri ? uri : null;
}

export async function setProfilePhotoUri(uri: string | null): Promise<void> {
  await setStoredValue(PROFILE_PHOTO_URI_KEY, String(uri ?? ""));
}
