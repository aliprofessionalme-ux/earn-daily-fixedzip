import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp, getApps, getApp } from "firebase/app";
import * as FirebaseAuth from "firebase/auth";
import type { Auth } from "firebase/auth";

interface AuthResult {
  firebaseUid: string | null;
  firebaseToken: string | null;
  authMode: "firebase-anonymous" | "device-only";
  authVerified: boolean;
  error?: string;
}

function getFirebaseConfig() {
  const config = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  };
  const missing = Object.entries(config).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new Error(`Firebase mobile config missing: ${missing.join(", ")}`);
  return config as Record<keyof typeof config, string>;
}

let authInstance: Auth | null = null;

export function getFirebaseAuth(): Auth {
  if (authInstance) return authInstance;
  const app = getApps().length ? getApp() : initializeApp(getFirebaseConfig());

  if (Platform.OS === "web") {
    authInstance = FirebaseAuth.getAuth(app);
  } else {
    try {
      const persistenceFactory = (FirebaseAuth as typeof FirebaseAuth & {
        getReactNativePersistence?: (storage: typeof AsyncStorage) => unknown;
      }).getReactNativePersistence;
      authInstance = FirebaseAuth.initializeAuth(app, {
        persistence: persistenceFactory?.(AsyncStorage),
      } as Parameters<typeof FirebaseAuth.initializeAuth>[1]);
    } catch {
      authInstance = FirebaseAuth.getAuth(app);
    }
  }

  return authInstance;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export async function initAnonymousFirebaseAuth(): Promise<AuthResult> {
  try {
    const auth = getFirebaseAuth();
    const credential = auth.currentUser
      ? { user: auth.currentUser }
      : await withTimeout(FirebaseAuth.signInAnonymously(auth), 8000, "Firebase anonymous sign-in");
    const firebaseToken = await withTimeout(credential.user.getIdToken(true), 5000, "Firebase token fetch");
    return {
      firebaseUid: credential.user.uid,
      firebaseToken,
      authMode: "firebase-anonymous",
      authVerified: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      firebaseUid: null,
      firebaseToken: null,
      authMode: "device-only",
      authVerified: false,
      error: message,
    };
  }
}
