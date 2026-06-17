# Earn Daily Google Auth Setup

This project now uses Google sign-in as the required user account system. Anonymous Firebase sign-in is no longer used for normal production login.

## Required Firebase setup

1. Open Firebase Console.
2. Go to Authentication > Sign-in method.
3. Enable Google.
4. Set the public-facing project name to `Earn Daily`.
5. Set the support email.
6. Add the Android SHA fingerprints for your Expo/EAS Android credentials.

## Required Google/Firebase secrets

Add these to Replit Secrets and EAS environment variables:

```bash
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID="your-web-client-id.apps.googleusercontent.com"
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID="your-android-client-id.apps.googleusercontent.com"
```

Keep the existing Firebase public config values:

```bash
EXPO_PUBLIC_FIREBASE_API_KEY="..."
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN="..."
EXPO_PUBLIC_FIREBASE_PROJECT_ID="..."
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET="..."
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="..."
EXPO_PUBLIC_FIREBASE_APP_ID="..."
```

## Android SHA fingerprint

Run this in the project when configuring credentials:

```bash
npx eas-cli credentials -p android
```

Choose the build profile you use for APK builds, then copy the SHA-1 and SHA-256 fingerprints into Firebase Project settings > Your apps > Android app.

## Backend policy

The API now requires a verified Firebase Google token for user initialization and protected requests. These emergency flags exist only for temporary development recovery:

```bash
ALLOW_DEVICE_ONLY_AUTH=true
ALLOW_ANONYMOUS_AUTH=true
```

Do not enable these flags in production unless you intentionally want to allow old device-only or anonymous sessions.

## Test checklist

1. Start the backend with your normal API URL.
2. Start the mobile preview.
3. The app should show the Google sign-in screen after splash.
4. Sign in with Google.
5. Complete name/phone onboarding if shown.
6. Confirm Home loads and Settings shows the Google account.
7. Use Settings > Sign out of Google to test account switching.
