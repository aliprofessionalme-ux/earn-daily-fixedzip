import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import usersRouter from "./users.js";
import withdrawalsRouter from "./withdrawals.js";
import webhooksRouter from "./webhooks.js";
import adsRouter from "./ads.js";
import settingsRouter from "./settings.js";
import { adminApiRouter } from "./admin.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/admin", adminApiRouter);
router.use("/users", usersRouter);
router.use("/users/:deviceId/withdrawals", withdrawalsRouter);
router.use("/users/:deviceId/ads", adsRouter);
router.use("/webhooks", webhooksRouter);
router.use("/settings", settingsRouter);

export default router;
