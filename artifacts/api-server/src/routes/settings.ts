import { Router, type Request } from "express";
import { getAppSettings, handleRouteError } from "../services/firebase-admin.js";

const router = Router();

type ProviderKey = "monlix" | "tapjoy" | "ayet" | "pubscale" | "unity";
type ProviderLaunchType = "webview" | "native" | "disabled";

type ProviderLaunchItem = {
  enabled: boolean;
  provider: ProviderKey;
  launchType: ProviderLaunchType;
  publicAppId?: string;
  publicSdkKey?: string;
  placementId?: string;
  launchUrl?: string;
  callbackUrl?: string;
  reason?: string;
};

type ProviderCallbackUrls = ReturnType<typeof buildProviderCallbackUrls>;

function sendError(res: import("express").Response, err: unknown, fallback: string) {
  const normalized = handleRouteError(err, fallback);
  res.status(normalized.status).json(normalized.body);
}

function envValue(name: string) {
  return String(process.env[name] ?? "").trim();
}

function truthyEnv(name: string) {
  return Boolean(envValue(name));
}

function getPublicBaseUrl(req: Request): string {
  const explicit = envValue("PUBLIC_BASE_URL") || envValue("APP_PUBLIC_URL");
  if (explicit) return explicit.replace(/\/$/, "");
  const replitDomain = (envValue("REPLIT_DEV_DOMAIN") || envValue("REPLIT_DOMAINS") || envValue("EXPO_PUBLIC_DOMAIN"))
    .split(",")[0]
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  if (replitDomain) return `https://${replitDomain}`;
  return `${req.protocol}://${req.get("host")}`.replace(/\/$/, "");
}

function buildProviderCallbackUrls(req: Request) {
  const base = getPublicBaseUrl(req);
  return {
    monlix: `${base}/api/webhooks/monlix`,
    tapjoy: `${base}/api/webhooks/tapjoy`,
    ayet: `${base}/api/webhooks/ayet`,
    pubscale: `${base}/api/webhooks/pubscale`,
    unity: `${base}/api/users/{deviceId}/ads/unity/interstitial-shown`,
  };
}

function disabled(provider: ProviderKey, reason: string, callbackUrl?: string): ProviderLaunchItem {
  return { enabled: false, provider, launchType: "disabled", callbackUrl, reason };
}

function launchTemplate(name: string) {
  const value = envValue(name);
  if (!value) return "";
  return value.includes("{deviceId}") ? value : `${value}${value.includes("?") ? "&" : "?"}user_id={deviceId}`;
}

function buildProviderLaunchStatus(callbackUrls: ProviderCallbackUrls) {
  const monlixAppId = envValue("MONLIX_APP_ID");
  const monlixReady = Boolean(monlixAppId && (truthyEnv("MONLIX_API_SECRET") || truthyEnv("MONLIX_SECRET")));
  const monlixLaunchUrl = launchTemplate("MONLIX_OFFERWALL_URL_TEMPLATE") || `https://offers.monlix.com/?app=${encodeURIComponent(monlixAppId)}&user={deviceId}`;
  const monlixItem: ProviderLaunchItem = monlixReady
    ? {
        enabled: true,
        provider: "monlix",
        launchType: "webview",
        publicAppId: monlixAppId,
        launchUrl: monlixLaunchUrl,
        callbackUrl: callbackUrls.monlix,
      }
    : disabled("monlix", "Requires MONLIX_APP_ID plus MONLIX_API_SECRET or MONLIX_SECRET.", callbackUrls.monlix);

  const tapjoyAppId = envValue("TAPJOY_APP_ID");
  const tapjoySdkKey = envValue("TAPJOY_SDK_KEY") || envValue("TAPJOY_WEB_SDK_KEY");
  const tapjoyTemplate = launchTemplate("TAPJOY_OFFERWALL_URL_TEMPLATE");
  const tapjoyLaunchUrl = tapjoyTemplate || (tapjoySdkKey ? `https://rewards.unity.com/owp/web/link/${encodeURIComponent(tapjoySdkKey)}/u/{deviceId}` : "");
  const tapjoyReady = Boolean(tapjoyAppId && truthyEnv("TAPJOY_SECRET_KEY") && tapjoyLaunchUrl);
  const tapjoyItem: ProviderLaunchItem = tapjoyReady
    ? {
        enabled: true,
        provider: "tapjoy",
        launchType: "webview",
        publicAppId: tapjoyAppId,
        publicSdkKey: tapjoySdkKey || undefined,
        launchUrl: tapjoyLaunchUrl,
        callbackUrl: callbackUrls.tapjoy,
      }
    : disabled(
        "tapjoy",
        "Requires TAPJOY_APP_ID, TAPJOY_SECRET_KEY, and either TAPJOY_SDK_KEY or TAPJOY_OFFERWALL_URL_TEMPLATE with {deviceId}.",
        callbackUrls.tapjoy,
      );

  const ayetAccountId = envValue("AYET_ACCOUNT_ID");
  const ayetAdslotId = envValue("AYET_ADSLOT_ID") || envValue("AYET_PLACEMENT_ID");
  const ayetTemplate = launchTemplate("AYET_OFFERWALL_URL_TEMPLATE");
  const ayetLaunchUrl = ayetTemplate || (ayetAdslotId ? `https://www.ayetstudios.com/offers/web_offerwall/${encodeURIComponent(ayetAdslotId)}?external_identifier={deviceId}` : "");
  const ayetReady = Boolean(ayetAccountId && ayetAdslotId && truthyEnv("AYET_API_KEY") && truthyEnv("AYET_POSTBACK_SECRET") && ayetLaunchUrl);
  const ayetItem: ProviderLaunchItem = ayetReady
    ? {
        enabled: true,
        provider: "ayet",
        launchType: "webview",
        publicAppId: ayetAccountId,
        placementId: ayetAdslotId,
        launchUrl: ayetLaunchUrl,
        callbackUrl: callbackUrls.ayet,
      }
    : disabled(
        "ayet",
        "Requires AYET_ACCOUNT_ID, AYET_ADSLOT_ID or AYET_PLACEMENT_ID, AYET_API_KEY, AYET_POSTBACK_SECRET, and a tested launch URL/template.",
        callbackUrls.ayet,
      );

  const pubscaleAppId = envValue("PUBSCALE_APP_ID");
  const pubscaleLaunchUrl = launchTemplate("PUBSCALE_OFFERWALL_URL_TEMPLATE");
  const pubscaleReady = Boolean(pubscaleAppId && truthyEnv("PUBSCALE_API_KEY") && pubscaleLaunchUrl);
  const pubscaleItem: ProviderLaunchItem = pubscaleReady
    ? {
        enabled: true,
        provider: "pubscale",
        launchType: "webview",
        publicAppId: pubscaleAppId,
        launchUrl: pubscaleLaunchUrl,
        callbackUrl: callbackUrls.pubscale,
      }
    : disabled("pubscale", "Requires PUBSCALE_APP_ID, PUBSCALE_API_KEY, and PUBSCALE_OFFERWALL_URL_TEMPLATE with {deviceId}.", callbackUrls.pubscale);

  const unityGameId = envValue("UNITY_ANDROID_GAME_ID");
  const unityInterstitialPlacement = envValue("UNITY_INTERSTITIAL_PLACEMENT_ID");
  const unityRewardedPlacement = envValue("UNITY_REWARDED_PLACEMENT_ID");
  const unityGateReady = Boolean(unityGameId && unityInterstitialPlacement);
  const unityRewardedReady = Boolean(unityGameId && unityRewardedPlacement && truthyEnv("UNITY_SERVER_SIDE_VERIFICATION_SECRET"));

  return {
    gameTasks: monlixItem,
    highRewardOffers: monlixItem,
    surveyRewards: tapjoyItem,
    appInstallTasks: ayetItem,
    partnerTasks: pubscaleItem,
    watchAdsEnergy: unityRewardedReady
      ? {
          enabled: true,
          provider: "unity",
          launchType: "native",
          publicAppId: unityGameId,
          placementId: unityRewardedPlacement,
          reason: "Native Unity rewarded placement is configured. Mobile APK must call the SDK before reward confirmation.",
        }
      : disabled(
          "unity",
          "Rewarded Energy needs UNITY_ANDROID_GAME_ID, UNITY_REWARDED_PLACEMENT_ID, and server-side verification secret before it can give Energy safely.",
        ),
    dailyGameAdGate: unityGateReady
      ? {
          enabled: true,
          provider: "unity",
          launchType: "native",
          publicAppId: unityGameId,
          placementId: unityInterstitialPlacement,
          callbackUrl: callbackUrls.unity,
          reason: "After 5 spins and 5 scratches, show one Unity interstitial ad and then record it here.",
        }
      : disabled("unity", "Required game-session ad needs UNITY_ANDROID_GAME_ID and UNITY_INTERSTITIAL_PLACEMENT_ID.", callbackUrls.unity),
  };
}

// Public endpoint: returns app settings plus safe launch status (no secrets)
router.get("/", async (req, res) => {
  try {
    const settings = await getAppSettings();
    const providerCallbackUrls = buildProviderCallbackUrls(req);
    res.json({
      ...settings,
      providerLaunch: buildProviderLaunchStatus(providerCallbackUrls),
      providerCallbackUrls,
    });
  } catch (err) {
    sendError(res, err, "Unable to load app settings.");
  }
});

export default router;
