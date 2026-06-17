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
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
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

function authResultFromUser(user: FirebaseAuth.User, firebaseToken: string): AuthResult {
  return {
    firebaseUid: user.uid,
    firebaseToken,
    authMode: "firebase-anonymous",
    authVerified: true,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
  };
}

async function getTokenResult(user: FirebaseAuth.User): Promise<AuthResult> {
  const firebaseToken = await withTimeout(user.getIdToken(true), 5000, "Firebase token fetch");
  return authResultFromUser(user, firebaseToken);
}

export async function getCurrentGoogleAuth(): Promise<AuthResult | null> {
  const auth = getFirebaseAuth();
  if (Platform.OS === "web") {
    try {
      await withTimeout(FirebaseAuth.getRedirectResult(auth), 12000, "Google redirect sign-in");
    } catch {
      // Ignore redirect completion errors here and let the caller show auth errors on direct sign-in.
    }
  }
  const user = auth.currentUser ?? await withTimeout(
    new Promise<FirebaseAuth.User | null>((resolve) => {
      const unsubscribe = FirebaseAuth.onAuthStateChanged(auth, (currentUser) => {
        unsubscribe();
        resolve(currentUser);
      });
    }),
    5000,
    "Firebase auth state",
  );

  if (!user || user.isAnonymous) return null;
  return getTokenResult(user);
}

export async function signInWithGooglePopup(): Promise<AuthResult> {
  const auth = getFirebaseAuth();
  const provider = new FirebaseAuth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  if (Platform.OS === "web") {
    try {
      const credential = await withTimeout(FirebaseAuth.signInWithPopup(auth, provider), 20000, "Google sign-in");
      return getTokenResult(credential.user);
    } catch (error) {
      const code = String((error as { code?: unknown })?.code ?? error).toLowerCase();
      if (code.includes("popup-blocked") || code.includes("operation-not-supported")) {
        await withTimeout(FirebaseAuth.signInWithRedirect(auth, provider), 20000, "Google redirect sign-in");
        return {
          firebaseUid: null,
          firebaseToken: null,
          authMode: "device-only",
          authVerified: false,
        };
      }
      throw error;
    }
  }
  const credential = await withTimeout(FirebaseAuth.signInWithPopup(auth, provider), 20000, "Google sign-in");
  return getTokenResult(credential.user);
}

export async function signInWithGoogleIdToken(idToken: string): Promise<AuthResult> {
  const auth = getFirebaseAuth();
  const credential = FirebaseAuth.GoogleAuthProvider.credential(idToken);
  const result = await withTimeout(FirebaseAuth.signInWithCredential(auth, credential), 20000, "Google sign-in");
  return getTokenResult(result.user);
}

export async function signOutGoogle(): Promise<void> {
  await FirebaseAuth.signOut(getFirebaseAuth());
}

export async function initAnonymousFirebaseAuth(): Promise<AuthResult> {
  try {
    const current = await getCurrentGoogleAuth();
    if (current) return current;
    throw new Error("Google account sign-in is required.");
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
