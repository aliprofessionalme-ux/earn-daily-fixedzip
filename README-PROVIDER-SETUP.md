# Earn Daily Provider Setup

This file explains what is needed to make Monlix, Tapjoy, ayeT, PubScale, and Unity ready without changing app code again.

## Safety Rules

- Keep every provider secret in Replit Secrets / backend environment only.
- Do not paste secrets into the mobile app code.
- Do not commit real API keys, postback secrets, service account JSON, or tokens.
- Set `PUBLIC_BASE_URL` to your live backend URL so provider callback URLs are stable.
- Keep Replit/Firebase data push untouched. Provider callbacks should go to backend webhooks, then backend updates Firebase/Sheets.

## Callback URL Scene

A callback/postback URL is the backend URL that the provider calls after a user completes, approves, rejects, or reverses a task.

Flow:

1. User opens a task wall from the Earn Daily app.
2. The launch URL includes the user/device ID as `{deviceId}`.
3. User completes an offer on the provider side.
4. Provider sends a callback to your backend.
5. Backend verifies the provider secret/signature where available.
6. Backend calculates coins using `5000 coins = 1 USD`.
7. Backend records the task and credits pending/confirmed coins based on the current hold/review logic.

Your callback URLs are returned by `GET /api/settings` and are:

- Monlix: `https://YOUR_BACKEND_DOMAIN/api/webhooks/monlix`
- Tapjoy: `https://YOUR_BACKEND_DOMAIN/api/webhooks/tapjoy`
- ayeT: `https://YOUR_BACKEND_DOMAIN/api/webhooks/ayet`
- PubScale: `https://YOUR_BACKEND_DOMAIN/api/webhooks/pubscale`
- Unity required game ad record: `https://YOUR_BACKEND_DOMAIN/api/users/{deviceId}/ads/unity/interstitial-shown`

Use your real Replit/backend domain in place of `YOUR_BACKEND_DOMAIN`.

## Replit Secrets Needed

Set these in Replit Secrets, not in GitHub.

### Common

```env
PUBLIC_BASE_URL=https://your-live-backend-domain
```

### Monlix

Needed:

```env
MONLIX_APP_ID=
MONLIX_API_SECRET=
# or
MONLIX_SECRET=
MONLIX_COINS_PER_USD=5000
```

Optional if Monlix gives a custom launch URL:

```env
MONLIX_OFFERWALL_URL_TEMPLATE=https://offers.monlix.com/?app=YOUR_APP_ID&user={deviceId}
```

### Tapjoy

Needed:

```env
TAPJOY_APP_ID=
TAPJOY_SECRET_KEY=
TAPJOY_SDK_KEY=
TAPJOY_COINS_PER_USD=5000
```

If Tapjoy gives a specific web offerwall link, set:

```env
TAPJOY_OFFERWALL_URL_TEMPLATE=https://provider-launch-url.example/path?user_id={deviceId}
```

### ayeT

Needed:

```env
AYET_ACCOUNT_ID=
AYET_ADSLOT_ID=
# or
AYET_PLACEMENT_ID=
AYET_API_KEY=
AYET_POSTBACK_SECRET=
AYET_ANDROID_PACKAGE=com.earndaily.app
AYET_COINS_PER_USD=5000
```

Optional launch override:

```env
AYET_OFFERWALL_URL_TEMPLATE=https://provider-launch-url.example/path?external_identifier={deviceId}
```

### PubScale

Needed:

```env
PUBSCALE_APP_ID=
PUBSCALE_API_KEY=
PUBSCALE_OFFERWALL_URL_TEMPLATE=https://provider-launch-url.example/path?user_id={deviceId}
PUBSCALE_COINS_PER_USD=5000
```

PubScale launch URL formats can vary by account, so paste the exact launch URL template from the PubScale dashboard and keep `{deviceId}` in the user identifier position.

### Unity Ads

For the mandatory ad after 5 spins and 5 scratches:

```env
UNITY_ANDROID_GAME_ID=
UNITY_INTERSTITIAL_PLACEMENT_ID=Interstitial_Android
UNITY_TEST_MODE=true
```

For rewarded Energy ads later, you also need native APK SDK wiring and server-side verification:

```env
UNITY_REWARDED_PLACEMENT_ID=Rewarded_Android
UNITY_SERVER_SIDE_VERIFICATION_SECRET=
```

Important: Unity ads cannot truly show inside Replit web preview or Expo Go without the native Unity Ads SDK. The backend now records the required interstitial view, and the mobile code is ready for the native APK hook. In the real APK, show the Unity interstitial first, then call the backend record endpoint after the ad closes.

## What Changed in App Behavior

- Offerwall cards read provider readiness from `/api/settings`.
- Monlix, Tapjoy, ayeT, and PubScale can become open automatically when their required env values are present.
- Provider names stay admin/internal; mobile cards show generic user-facing task labels.
- After the user uses all 5 spins and all 5 scratches, the Mini Games screen shows a required ad card.
- The required ad card records an interstitial ad event through the backend when Unity interstitial keys are configured.

## How To Check Setup

1. Add provider values in Replit Secrets.
2. Restart the backend.
3. Open `https://YOUR_BACKEND_DOMAIN/api/settings`.
4. Check `providerLaunch`:
   - `enabled: true` means that card can open.
   - `reason` explains what is missing if it is still disabled.
5. Open the app and visit Earning Tasks.
6. Complete 5 spins and 5 scratches, then confirm the required ad card appears.

## Coin Rule

The provider conversion rule remains:

```txt
1 USD = 5000 coins
```

These env values keep that rule:

```env
MONLIX_COINS_PER_USD=5000
TAPJOY_COINS_PER_USD=5000
AYET_COINS_PER_USD=5000
AYET_USD_TO_COINS=5000
PUBSCALE_COINS_PER_USD=5000
```
