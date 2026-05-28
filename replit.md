# Earn Daily

Earn Daily is an Expo React Native Android app with an Express + Firebase Firestore backend. Users earn non-withdrawable Energy from check-in, Spin, and Scratch. Provider task rewards enter Pending Coins first, then become Confirmed Coins only after webhook verification, hold period, or admin approval. Withdrawals use Confirmed Coins only.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/mobile run dev` — run the Expo app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec

## Android package

Final Android package name: `com.earndaily.app`.

If `google-services.json` is added later, its Firebase Android app `package_name` must also be `com.earndaily.app`. Do not edit that file by hand; replace it from Firebase Console if the package name is wrong.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Mobile: React Native + Expo managed workflow, Expo Router
- API: Express 5
- Database: Firebase Firestore, Admin SDK on server only
- Device tracking: expo-secure-store + expo-application
- Auth: Firebase Anonymous Auth on mobile; server validates ID tokens
- Validation: Zod
- Build: esbuild

## Reward architecture

- Check-in, Spin, and Scratch award Energy only.
- Provider task callbacks can award Pending Coins only after safe webhook validation.
- Pending Coins become Confirmed Coins only after verification/hold/admin approval.
- Withdrawals deduct Confirmed Coins only.
- Client requests must never directly credit coins or Energy.
- Provider USD conversion is separate from withdrawal conversion.
- Provider reward conversion defaults: `1 USD = 1000 user coins`.
- Withdrawal conversion uses app/admin settings: `coinRateCoins` and `coinRatePKR`.

## Where things live

- `artifacts/mobile/` — Expo React Native app
  - `app/(tabs)/index.tsx` — Dashboard screen
  - `app/(tabs)/games.tsx` — Spin Wheel + Scratch Card games
  - `app/(tabs)/offerwall.tsx` — generic task categories and safe provider launch logic
  - `app/(tabs)/wallet.tsx` — Confirmed Coins, PKR conversion, and withdrawal form
  - `contexts/UserContext.tsx` — Device ID + Firebase auth + user data state
  - `services/api.ts` — API client with dynamic Replit API URL resolution and Firebase token injection
- `artifacts/api-server/` — Express backend
  - `src/routes/users.ts` — user init, check-in, spin, scratch, offer events
  - `src/routes/withdrawals.ts` — protected withdrawals
  - `src/routes/ads.ts` — Unity placeholder routes; reward credit disabled until real SDK verification exists
  - `src/routes/webhooks.ts` — provider callback routes with validation, idempotency, and reversal safety
  - `src/routes/settings.ts` — public app settings endpoint
  - `src/routes/admin.ts` — admin dashboard/API with HttpOnly cookies and CSRF protection for admin POST actions
  - `src/services/firebase-admin.ts` — Firebase Admin SDK + reward/withdrawal logic
- `firestore.rules` and `artifacts/api-server/firestore.rules` — consistent API-only Firestore write rules

## Mobile public env

Use only public IDs in `EXPO_PUBLIC_*`. Never expose provider secrets or postback secrets in mobile env.

- `EXPO_PUBLIC_API_BASE_URL` — optional. Leave empty on Replit migration; mobile derives the current Replit domain when `EXPO_PUBLIC_DOMAIN` is present.
- Firebase public web config variables.
- Provider app IDs and launch readiness are returned from `/api/settings` only when backend callback verification is configured. Do not add provider secrets to `EXPO_PUBLIC_*`.
- `EXPO_PUBLIC_UNITY_ANDROID_GAME_ID` and `EXPO_PUBLIC_UNITY_REWARDED_PLACEMENT_ID` — future native SDK builds only; rewards remain disabled until verified.

## Backend env

- Firebase Admin: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
- Admin: `ADMIN_PASSWORD`, `SESSION_SECRET` (`SESSION_SECRET` is required in production)
- Monlix: `MONLIX_APP_ID`, `MONLIX_API_SECRET` or `MONLIX_SECRET`, `MONLIX_COINS_PER_USD=1000`
- ayeT: `AYET_ACCOUNT_ID`, `AYET_PLACEMENT_ID`, `AYET_ADSLOT_ID`, `AYET_ADSLOT_NAME`, `AYET_ANDROID_PACKAGE=com.earndaily.app`, `AYET_API_KEY`, `AYET_POSTBACK_SECRET` if available, `AYET_COINS_PER_USD=1000`, `AYET_USD_TO_COINS=1000`
- Tapjoy/PubScale placeholders: `TAPJOY_COINS_PER_USD=1000`, `PUBSCALE_COINS_PER_USD=1000`
- Unity placeholders: `UNITY_ANDROID_GAME_ID=800000310`, `UNITY_REWARDED_PLACEMENT_ID=Rewarded_Android`, `UNITY_INTERSTITIAL_PLACEMENT_ID=Interstitial_Android`, `UNITY_BANNER_PLACEMENT_ID=Banner_Android`, `UNITY_TEST_MODE=true`
- Google Sheets optional reporting credentials.

## Callback URLs

Use your current Replit/backend domain, not an old hardcoded project URL:

- Monlix postback: `https://YOUR-CURRENT-BACKEND-DOMAIN/api/webhooks/monlix`
- ayeT callback: `https://YOUR-CURRENT-BACKEND-DOMAIN/api/webhooks/ayet`

Both routes accept GET and POST. Rewards are rejected or stored for manual review if required IDs/secrets are missing. Duplicate callbacks are idempotent and reversals are no-op if already processed.

## Current implementation limits

- Real Unity rewarded SDK verification is not implemented; Watch Ads & Earn Energy stays Coming Soon.
- ayeT launch UI is kept disabled until safe launch URL/SDK behavior is verified. The callback route is prepared and can store unverified callbacks for manual review if `AYET_POSTBACK_SECRET` is missing.
- Do not claim provider earnings are fully live until dashboard secrets, callback URLs, and end-to-end test callbacks are verified.
