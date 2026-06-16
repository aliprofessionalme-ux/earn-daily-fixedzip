import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import adminPanelRouter from "./routes/admin.js";
import { adminSupportPanelRouter, enhanceAdminDashboardSupportLink } from "./routes/admin-support.js";
import { logger } from "./lib/logger";

const DEFAULT_PROVIDER_COINS_PER_USD = "5000";
const providerCoinRateKeys = [
  "MONLIX_COINS_PER_USD",
  "TAPJOY_COINS_PER_USD",
  "AYET_COINS_PER_USD",
  "AYET_USD_TO_COINS",
  "PUBSCALE_COINS_PER_USD",
  "CPX_RESEARCH_COINS_PER_USD",
] as const;

// Product rule: a 1 USD offer payout equals 5000 coins.
for (const key of providerCoinRateKeys) {
  process.env[key] = DEFAULT_PROVIDER_COINS_PER_USD;
}

const isProduction = process.env["NODE_ENV"] === "production";

function normalizeOrigin(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  try {
    const parsed = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return raw.replace(/\/$/, "");
  }
}

const allowedOrigins = Array.from(
  new Set(
    [
      ...(process.env["ALLOWED_ORIGINS"] ?? "").split(","),
      process.env["PUBLIC_BASE_URL"],
      process.env["APP_PUBLIC_URL"],
      process.env["EXPO_PUBLIC_API_BASE_URL"],
    ]
      .map(normalizeOrigin)
      .filter(Boolean),
  ),
);

const app: Express = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      const normalizedOrigin = normalizeOrigin(origin);
      if (!isProduction && allowedOrigins.length === 0) {
        callback(null, true);
        return;
      }

      callback(null, allowedOrigins.includes(normalizedOrigin));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/admin", enhanceAdminDashboardSupportLink, adminSupportPanelRouter, adminPanelRouter);
app.use("/api", router);

export default app;
