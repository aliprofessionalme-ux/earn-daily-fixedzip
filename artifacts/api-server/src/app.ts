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

const app: Express = express();

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

const allowedOrigins = (process.env["ALLOWED_ORIGINS"] ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : true, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/admin", enhanceAdminDashboardSupportLink, adminSupportPanelRouter, adminPanelRouter);
app.use("/api", router);

export default app;
