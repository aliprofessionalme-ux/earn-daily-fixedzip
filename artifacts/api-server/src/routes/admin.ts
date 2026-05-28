import { Router } from "express";
import type admin from "firebase-admin";
import {
  adjustUserCoins,
  adjustUserEnergy,
  adminConfirmOfferEvent,
  adminRejectOfferEvent,
  adminReverseOfferEvent,
  getAppSettings,
  getFirestoreDb,
  handleRouteError,
  markWithdrawalStatus,
  rejectWithdrawal,
  runConfirmPendingRewardsJob,
  serializeDoc,
  nowTs,
} from "../services/firebase-admin.js";
import { createAdminSession, getAdminCsrfToken, isAdminSession, validateAdminCsrfToken, validateAdminPassword } from "../lib/admin-auth.js";
import {
  loadGoogleSheetsConfig,
  ensureSpreadsheet,
  syncGoogleSheetsReport,
} from "../services/googleSheets.js";

export const adminPanelRouter = Router();
export const adminApiRouter = Router();

function injectCsrf(content: string, csrfToken?: string) {
  if (!csrfToken) return content;
  return content.replace(/<form([^>]*method=["\']post["\'][^>]*)>/gi, `<form$1><input type="hidden" name="_csrf" value="${csrfToken}" />`);
}

function adminShell(content: string, csrfToken?: string) {
  const safeContent = injectCsrf(content, csrfToken);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin</title><style>body{margin:0;font-family:Inter,Arial,sans-serif;background:#080814;color:#fff}a,input,button,textarea{font:inherit}.wrap{max-width:1180px;margin:0 auto;padding:24px}.card{background:#131326;border:1px solid #2d2d4a;border-radius:18px;padding:18px}.row{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}.muted{color:#9ca3af}.btn{background:#7c3aed;color:#fff;border:0;border-radius:12px;padding:10px 13px;cursor:pointer;text-decoration:none;display:inline-block}.btn.gold{background:#f59e0b;color:#160a00}.btn.red{background:#ef4444}.btn.green{background:#10b981}.input{width:100%;padding:10px 12px;border-radius:12px;border:1px solid #384163;background:#0d0d1a;color:#fff;box-sizing:border-box}table{width:100%;border-collapse:collapse}td,th{padding:10px;border-bottom:1px solid #2d2d4a;text-align:left;font-size:13px;vertical-align:top}.pill{display:inline-block;padding:4px 10px;border-radius:999px;background:#243150;color:#dbe4ff}.actions{display:flex;gap:6px;flex-wrap:wrap}.inline{display:inline}.stack{display:grid;gap:8px}h1,h2,h3{margin-top:0}.small{font-size:12px}.danger{color:#fca5a5}.ok{color:#86efac}.warn{color:#fcd34d}.tab{display:inline-block;padding:8px 14px;border-radius:10px;background:#1a1a2e;color:#9ca3af;text-decoration:none;margin-right:6px;margin-bottom:6px}.tab.active{background:#7c3aed;color:#fff}.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}.stat-card{padding:14px;border-radius:12px;background:#1a1a2e;border:1px solid #2d2d4a}</style></head><body><div class="wrap">${safeContent}</div></body></html>`;
}

function adminCookieHeader(token: string) {
  const isProd = process.env["NODE_ENV"] === "production";
  const maxAge = 60 * 60 * 12;
  return `admin_session=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax${isProd ? "; Secure" : ""}`;
}

function readSession(req: { headers: { cookie?: string } }) {
  const cookie = String(req.headers.cookie ?? "");
  const match = cookie.match(/(?:^|;\s*)admin_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

function requireAdmin(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) {
  if (!isAdminSession(readSession(req))) {
    res.status(401).json({ error: "Unauthorized", code: "admin_unauthorized" });
    return;
  }
  next();
}

function requireAdminCsrf(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) {
  if (req.method !== "POST") {
    next();
    return;
  }
  const submitted = String(req.body?._csrf ?? req.headers["x-csrf-token"] ?? "");
  if (!validateAdminCsrfToken(readSession(req), submitted)) {
    res.status(403).json({ error: "Invalid CSRF token.", code: "admin_csrf_invalid" });
    return;
  }
  next();
}

function requireAdminPanel(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) {
  if (!isAdminSession(readSession(req))) {
    res.redirect("/admin/login");
    return;
  }
  next();
}

function sendError(res: import("express").Response, err: unknown, fallback: string) {
  const normalized = handleRouteError(err, fallback);
  res.status(normalized.status).json(normalized.body);
}

function htmlEscape(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formRedirect(res: import("express").Response, fallbackJson: unknown) {
  const accepts = String(res.req.headers.accept ?? "");
  if (accepts.includes("text/html")) {
    res.redirect("/admin/dashboard");
  } else {
    res.json(fallbackJson);
  }
}

adminPanelRouter.get("/", (req, res) => {
  if (!isAdminSession(readSession(req))) {
    res.redirect("/admin/login");
    return;
  }
  res.redirect("/admin/dashboard");
});

adminPanelRouter.get("/login", (_req, res) => {
  res.send(adminShell(`<div class="card" style="max-width:420px;margin:80px auto"><h1>Admin Login</h1><p class="muted">Enter ADMIN_PASSWORD to continue.</p><form method="post" action="/admin/login"><input class="input" type="password" name="password" placeholder="ADMIN_PASSWORD" autocomplete="current-password" /><div style="height:12px"></div><button class="btn gold" type="submit">Login</button></form></div>`));
});

adminPanelRouter.post("/login", (req, res) => {
  const password = String(req.body?.password ?? "");
  try {
    if (!validateAdminPassword(password)) {
      res.status(401).send(adminShell(`<div class="card" style="max-width:420px;margin:80px auto"><h1>Admin Login</h1><p class="danger">Invalid password.</p><form method="post" action="/admin/login"><input class="input" type="password" name="password" placeholder="ADMIN_PASSWORD" /><div style="height:12px"></div><button class="btn gold" type="submit">Login</button></form></div>`));
      return;
    }
    const token = createAdminSession();
    res.setHeader("Set-Cookie", adminCookieHeader(token));
    res.redirect("/admin/dashboard");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Admin login failed";
    res.status(500).send(adminShell(`<div class="card"><h1>Admin configuration error</h1><p class="danger">${htmlEscape(message)}</p></div>`));
  }
});

adminPanelRouter.get("/logout", (_req, res) => {
  const isProd = process.env["NODE_ENV"] === "production";
  res.setHeader("Set-Cookie", `admin_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${isProd ? "; Secure" : ""}`);
  res.redirect("/admin/login");
});

async function getDashboardStats(db: ReturnType<typeof getFirestoreDb>) {
  const [usersSnap, withdrawalsSnap, pendingSnap, supportSnap, offerEventsSnap, adEventsSnap] = await Promise.all([
    db.collection("users").get(),
    db.collection("withdrawals").get(),
    db.collection("withdrawals").where("status", "==", "pending").get(),
    db.collection("supportTickets").where("status", "==", "open").get(),
    db.collection("offerEvents").get(),
    db.collection("adEvents").get(),
  ]);

  // Provider revenue stats
  const providerStats = { monlix: 0, tapjoy: 0, ayet: 0, pubscale: 0, unity: 0 };
  const statusStats = { pending: 0, confirmed: 0, rejected: 0, reversed: 0, manual_review: 0 };
  let totalEnergyFromAds = 0;
  let totalAdsWatched = 0;

  offerEventsSnap.docs.forEach((doc: admin.firestore.QueryDocumentSnapshot) => {
    const d = doc.data();
    const st = String(d.status ?? "");
    if (st === "confirmed" && d.provider && providerStats[d.provider as keyof typeof providerStats] !== undefined) {
      providerStats[d.provider as keyof typeof providerStats] += Number(d.payoutUSD ?? 0);
    }
    if (st === "pending_verification") statusStats.pending += 1;
    if (st === "confirmed") statusStats.confirmed += 1;
    if (st === "rejected") statusStats.rejected += 1;
    if (st === "reversed") statusStats.reversed += 1;
    if (st === "manual_review_required") statusStats.manual_review += 1;
  });

  adEventsSnap.docs.forEach((doc: admin.firestore.QueryDocumentSnapshot) => {
    const d = doc.data();
    totalAdsWatched += 1;
    totalEnergyFromAds += Number(d.energyGiven ?? 0);
  });

  // User liability (total confirmed coins across all users)
  let totalConfirmedLiability = 0;
  let totalPendingLiability = 0;
  usersSnap.docs.forEach((doc: admin.firestore.QueryDocumentSnapshot) => {
    const d = doc.data();
    totalConfirmedLiability += Number(d.confirmedCoinsBalance ?? d.coinsBalance ?? 0);
    totalPendingLiability += Number(d.pendingCoinsBalance ?? 0);
  });

  return {
    users: usersSnap.size,
    withdrawals: withdrawalsSnap.size,
    pendingWithdrawals: pendingSnap.size,
    openSupportTickets: supportSnap.size,
    offerEvents: offerEventsSnap.size,
    adEvents: adEventsSnap.size,
    providerStats,
    statusStats,
    totalEnergyFromAds,
    totalAdsWatched,
    totalConfirmedLiability,
    totalPendingLiability,
  };
}

adminPanelRouter.get("/dashboard", requireAdminPanel, async (_req, res) => {
  const db = getFirestoreDb();
  const settings = await getAppSettings();
  const [usersSnap, withdrawalsSnap, txSnap, supportSnap] = await Promise.all([
    db.collection("users").orderBy("updatedAt", "desc").limit(30).get(),
    db.collection("withdrawals").orderBy("createdAt", "desc").limit(30).get(),
    db.collection("coinTransactions").orderBy("createdAt", "desc").limit(25).get(),
    db.collection("supportTickets").orderBy("createdAt", "desc").limit(25).get(),
  ]);

  const stats = await getDashboardStats(db);

  const content = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;gap:12px">
      <div><h1 style="margin:0">Earn Daily Admin</h1><div class="muted">Multi-provider monetization dashboard</div></div>
      <a class="pill" href="/admin/logout">Logout</a>
    </div>
    <div class="row">
      <div class="card"><div class="muted">Confirmed Rate</div><h2>1000 = PKR ${settings.coinRatePKR}</h2></div>
      <div class="card"><div class="muted">Min Withdrawal</div><h2>PKR ${settings.minimumWithdrawalPKR}</h2></div>
      <div class="card"><div class="muted">Pending Rewards</div><h2>${stats.statusStats.pending + stats.statusStats.manual_review}</h2></div>
      <div class="card"><div class="muted">Users</div><h2>${stats.users}</h2></div>
    </div>
    <div style="height:18px"></div>
    <div class="row">
      <div class="card"><h3>Revenue by Provider</h3>
        <div class="stat-grid">
          <div class="stat-card"><div class="muted">Monlix</div><div class="ok">$${stats.providerStats.monlix.toFixed(2)}</div></div>
          <div class="stat-card"><div class="muted">Tapjoy</div><div class="ok">$${stats.providerStats.tapjoy.toFixed(2)}</div></div>
          <div class="stat-card"><div class="muted">ayeT</div><div class="ok">$${stats.providerStats.ayet.toFixed(2)}</div></div>
          <div class="stat-card"><div class="muted">PubScale</div><div class="ok">$${stats.providerStats.pubscale.toFixed(2)}</div></div>
        </div>
      </div>
      <div class="card"><h3>Reward Status</h3>
        <div class="stat-grid">
          <div class="stat-card"><div class="muted">Pending</div><div class="warn">${stats.statusStats.pending}</div></div>
          <div class="stat-card"><div class="muted">Confirmed</div><div class="ok">${stats.statusStats.confirmed}</div></div>
          <div class="stat-card"><div class="muted">Rejected</div><div class="danger">${stats.statusStats.rejected}</div></div>
          <div class="stat-card"><div class="muted">Reversed</div><div class="danger">${stats.statusStats.reversed}</div></div>
        </div>
      </div>
    </div>
    <div class="row" style="margin-top:14px">
      <div class="card"><h3>Unity Ads</h3>
        <div class="stat-grid">
          <div class="stat-card"><div class="muted">Total Views</div><div>${stats.totalAdsWatched}</div></div>
          <div class="stat-card"><div class="muted">Energy Given</div><div>${stats.totalEnergyFromAds}</div></div>
          <div class="stat-card"><div class="muted">User Liability (PKR)</div><div class="danger">${coinsToPKRDisplay(stats.totalConfirmedLiability)}</div></div>
        </div>
      </div>
      <div class="card"><h3>Job Actions</h3>
        <form class="inline" method="post" action="/api/admin/jobs/confirm-pending-rewards"><button class="btn" type="submit">Run Auto-Confirm Job</button></form>
      </div>
      ${buildGoogleSheetsCard()}
    </div>
    <div style="height:18px"></div>
    <div class="card"><h3>Recent Users</h3><table><thead><tr><th>Device</th><th>Energy</th><th>Pending</th><th>Confirmed</th><th>PKR</th><th>Status</th><th>Admin</th></tr></thead><tbody>${usersSnap.docs.map((doc) => { const data = doc.data(); return `<tr><td>${htmlEscape(data.deviceId)}</td><td>${htmlEscape(data.energyBalance ?? 0)}</td><td>${htmlEscape(data.pendingCoinsBalance ?? 0)}</td><td>${htmlEscape(data.confirmedCoinsBalance ?? data.coinsBalance ?? 0)}</td><td>${htmlEscape(data.pkrBalance)}</td><td>${data.isBanned ? '<span class="danger">Banned</span>' : data.manualReviewRequired ? '<span class="warn">Review</span>' : '<span class="ok">Active</span>'}</td><td class="actions"><form class="inline" method="post" action="/api/admin/users/${encodeURIComponent(data.deviceId)}/ban"><input type="hidden" name="reason" value="Manual admin ban"/><button class="btn red" type="submit">Ban</button></form><form class="inline" method="post" action="/api/admin/users/${encodeURIComponent(data.deviceId)}/unban"><button class="btn green" type="submit">Unban</button></form><a class="btn" href="/admin/user/${encodeURIComponent(data.deviceId)}">Details</a></td></tr>`; }).join("")}</tbody></table></div>
    <div style="height:18px"></div>
    <div class="card"><h3>Withdrawals</h3><table><thead><tr><th>ID</th><th>Device</th><th>Amount</th><th>Method</th><th>Status</th><th>Admin</th></tr></thead><tbody>${withdrawalsSnap.docs.map((doc) => { const d = doc.data(); return `<tr><td>${htmlEscape(d.withdrawalId)}</td><td>${htmlEscape(d.deviceId)}</td><td>PKR ${htmlEscape(d.amountPKR)}</td><td>${htmlEscape(d.paymentMethod)}<br/><span class="muted small">${htmlEscape(d.accountNumber)} · ${htmlEscape(d.accountTitle)}</span></td><td>${htmlEscape(d.status)}</td><td class="actions"><form class="inline" method="post" action="/api/admin/withdrawals/${encodeURIComponent(d.withdrawalId)}/approve"><button class="btn" type="submit">Approve</button></form><form class="inline" method="post" action="/api/admin/withdrawals/${encodeURIComponent(d.withdrawalId)}/mark-paid"><button class="btn green" type="submit">Paid</button></form><form class="inline" method="post" action="/api/admin/withdrawals/${encodeURIComponent(d.withdrawalId)}/reject"><input class="input" style="width:150px" name="reason" placeholder="reason"/><button class="btn red" type="submit">Reject</button></form></td></tr>`; }).join("")}</tbody></table></div>
    <div style="height:18px"></div>
    <div class="row">
      <div class="card"><h3>Transactions</h3><table><thead><tr><th>Type</th><th>Device</th><th>Coins</th><th>Status</th></tr></thead><tbody>${txSnap.docs.map((doc) => { const d = doc.data(); return `<tr><td>${htmlEscape(d.type)}</td><td>${htmlEscape(d.deviceId)}</td><td>${htmlEscape(d.coinsChange)}</td><td>${htmlEscape(d.status)}</td></tr>`; }).join("")}</tbody></table></div>
      <div class="card"><h3>Support Tickets</h3><table><thead><tr><th>Issue</th><th>Message</th><th>Status</th><th>Admin</th></tr></thead><tbody>${supportSnap.docs.map((doc) => { const d = doc.data(); return `<tr><td>${htmlEscape(d.issueType)}</td><td>${htmlEscape(d.message)}</td><td>${htmlEscape(d.status)}</td><td><form method="post" action="/api/admin/support/${encodeURIComponent(d.ticketId)}/close"><button class="btn" type="submit">Close</button></form></td></tr>`; }).join("")}</tbody></table></div>
    </div>`;
  res.send(adminShell(content, getAdminCsrfToken(readSession(_req))));
});

function buildGoogleSheetsCard(): string {
  const cfg = loadGoogleSheetsConfig();
  if (!cfg.enabled) {
    return `<div class="card"><h3>Google Sheets Reports</h3><div class="muted">Google Sheets reporting is disabled.</div><div style="height:8px"></div><div class="small">Set GOOGLE_SHEETS_ENABLED=true and add credentials to enable.</div></div>`;
  }
  const missing: string[] = [];
  if (!cfg.clientEmail) missing.push("GOOGLE_SHEETS_CLIENT_EMAIL");
  if (!cfg.privateKey) missing.push("GOOGLE_SHEETS_PRIVATE_KEY");
  if (!cfg.spreadsheetId) missing.push("GOOGLE_SHEETS_SPREADSHEET_ID");
  if (missing.length > 0) {
    return `<div class="card"><h3>Google Sheets Reports</h3><div class="warn">Not configured</div><div style="height:8px"></div><div class="small">Missing: ${missing.join(", ")}</div></div>`;
  }

  const url = cfg.spreadsheetId ? `https://docs.google.com/spreadsheets/d/${cfg.spreadsheetId}/edit` : null;

  return `<div class="card"><h3>Google Sheets Reports</h3><div class="ok">Ready</div><div style="height:8px"></div>
    <div class="small muted">Spreadsheet ID: ${htmlEscape(cfg.spreadsheetId ?? "—")}</div>
    <div style="height:8px"></div>
    <div class="actions">
      <form class="inline" method="post" action="/api/admin/reports/google-sheets/setup"><button class="btn" type="submit">Redesign Sheet</button></form>
      <form class="inline" method="post" action="/api/admin/reports/google-sheets/sync"><button class="btn green" type="submit">Sync Now</button></form>
      ${url ? `<a class="btn gold" href="${htmlEscape(url)}" target="_blank" rel="noopener noreferrer">Open Sheet</a>` : ""}
    </div>
    ${lastSyncAt ? `<div class="small muted" style="margin-top:6px">Last sync: ${htmlEscape(lastSyncAt)}</div>` : ""}
    ${lastSyncError ? `<div class="small danger" style="margin-top:6px">Last error: ${htmlEscape(lastSyncError)}</div>` : ""}
  </div>`;
}

function coinsToPKRDisplay(coins: number): string {
  return "PKR " + Number(((coins / 1000) * 20).toFixed(2));
}

// User detail page with tabs
adminPanelRouter.get("/user/:deviceId", requireAdminPanel, async (req, res) => {
  const db = getFirestoreDb();
  const deviceId = String(req.params.deviceId);
  const tab = String(Array.isArray(req.query.tab) ? req.query.tab[0] : req.query.tab ?? "overview");

  const userSnap = await db.collection("users").doc(deviceId).get();
  if (!userSnap.exists) {
    res.status(404).send(adminShell(`<div class="card"><h1>User Not Found</h1><p class="danger">No user with deviceId ${htmlEscape(deviceId)}</p></div>`));
    return;
  }
  const user = userSnap.data() as Record<string, unknown>;

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "ads", label: "Ads" },
    { key: "offerwall", label: "Offerwall Tasks" },
    { key: "transactions", label: "Transactions" },
    { key: "withdrawals", label: "Withdrawals" },
    { key: "risk", label: "Risk" },
  ];

  let tabContent = "";

  if (tab === "overview") {
    tabContent = `<div class="stat-grid">
      <div class="stat-card"><div class="muted">Energy</div><div>${htmlEscape(user.energyBalance ?? 0)}</div></div>
      <div class="stat-card"><div class="muted">Pending Coins</div><div class="warn">${htmlEscape(user.pendingCoinsBalance ?? 0)}</div></div>
      <div class="stat-card"><div class="muted">Confirmed Coins</div><div class="ok">${htmlEscape(user.confirmedCoinsBalance ?? user.coinsBalance ?? 0)}</div></div>
      <div class="stat-card"><div class="muted">PKR Balance</div><div>${htmlEscape(user.pkrBalance)}</div></div>
      <div class="stat-card"><div class="muted">Suspicious Score</div><div class="${Number(user.suspiciousScore ?? 0) > 3 ? 'danger' : ''}">${htmlEscape(Number(user.suspiciousScore ?? 0))}</div></div>
      <div class="stat-card"><div class="muted">Fraud Flags</div><div>${htmlEscape(Array.isArray(user.fraudFlags) ? user.fraudFlags.join(", ") : "None")}</div></div>
      <div class="stat-card"><div class="muted">Manual Review</div><div>${user.manualReviewRequired ? '<span class="danger">Required</span>' : 'No'}</div></div>
      <div class="stat-card"><div class="muted">Banned</div><div>${user.isBanned ? '<span class="danger">Yes</span>' : 'No'}</div></div>
    </div>
    <div style="height:14px"></div>
    <div class="actions">
      <form class="inline" method="post" action="/api/admin/users/${encodeURIComponent(deviceId)}/adjust-coins"><input class="input" style="width:95px" name="coinsChange" placeholder="coins"/><input type="hidden" name="reason" value="Manual dashboard adjustment"/><button class="btn" type="submit">Adjust Coins</button></form>
      <form class="inline" method="post" action="/api/admin/users/${encodeURIComponent(deviceId)}/adjust-energy"><input class="input" style="width:95px" name="energyChange" placeholder="energy"/><input type="hidden" name="reason" value="Manual dashboard adjustment"/><button class="btn" type="submit">Adjust Energy</button></form>
    </div>`;
  } else if (tab === "ads") {
    const adsSnap = await db.collection("adEvents").where("deviceId", "==", deviceId).orderBy("createdAt", "desc").limit(50).get();
    tabContent = `<table><thead><tr><th>Provider</th><th>Type</th><th>Placement</th><th>Status</th><th>Energy</th><th>Date</th></tr></thead><tbody>${adsSnap.docs.map((doc) => { const d = doc.data(); return `<tr><td>${htmlEscape(d.provider)}</td><td>${htmlEscape(d.adType)}</td><td>${htmlEscape(d.placementId ?? "-")}</td><td>${htmlEscape(d.status)}</td><td>${htmlEscape(d.energyGiven ?? 0)}</td><td>${htmlEscape(d.createdAt?.toDate?.()?.toISOString?.() ?? "-")}</td></tr>`; }).join("") || '<tr><td colspan="6" class="muted">No ad events</td></tr>'}</tbody></table>`;
  } else if (tab === "offerwall") {
    const offersSnap = await db.collection("offerEvents").where("deviceId", "==", deviceId).orderBy("createdAt", "desc").limit(50).get();
    tabContent = `<table><thead><tr><th>Provider</th><th>External ID</th><th>Offer</th><th>Category</th><th>USD</th><th>Coins</th><th>Status</th><th>Hold Until</th><th>Admin</th></tr></thead><tbody>${offersSnap.docs.map((doc) => { const d = doc.data(); const isPending = d.status === "pending_verification" || d.status === "manual_review_required"; return `<tr><td>${htmlEscape(d.provider)}</td><td class="small">${htmlEscape(d.externalTransactionId)}</td><td>${htmlEscape(d.offerName)}</td><td>${htmlEscape(d.offerCategory)}</td><td>$${htmlEscape(d.payoutUSD)}</td><td>${htmlEscape(d.coinsCalculated)}</td><td class="${d.status === 'confirmed' ? 'ok' : d.status === 'rejected' || d.status === 'reversed' ? 'danger' : 'warn'}">${htmlEscape(d.status)}</td><td>${htmlEscape(d.verificationHoldUntil?.toDate?.()?.toISOString?.() ?? "-")}</td><td class="actions">${isPending ? `<form class="inline" method="post" action="/api/admin/offer-events/${encodeURIComponent(d.eventId)}/confirm"><button class="btn green" type="submit">Confirm</button></form><form class="inline" method="post" action="/api/admin/offer-events/${encodeURIComponent(d.eventId)}/reject"><input class="input" style="width:120px" name="reason" placeholder="reason"/><button class="btn red" type="submit">Reject</button></form>` : d.status === 'confirmed' ? `<form class="inline" method="post" action="/api/admin/offer-events/${encodeURIComponent(d.eventId)}/reverse"><input class="input" style="width:120px" name="reason" placeholder="reason"/><button class="btn red" type="submit">Reverse</button></form>` : '<span class="muted">Final</span>'}</td></tr>`; }).join("") || '<tr><td colspan="9" class="muted">No offer events</td></tr>'}</tbody></table>`;
  } else if (tab === "transactions") {
    const txSnap = await db.collection("coinTransactions").where("deviceId", "==", deviceId).orderBy("createdAt", "desc").limit(50).get();
    tabContent = `<table><thead><tr><th>Type</th><th>Coins</th><th>PKR</th><th>Status</th><th>Source</th><th>Date</th></tr></thead><tbody>${txSnap.docs.map((doc) => { const d = doc.data(); return `<tr><td>${htmlEscape(d.type)}</td><td>${htmlEscape(d.coinsChange)}</td><td>${htmlEscape(d.pkrChange)}</td><td>${htmlEscape(d.status)}</td><td>${htmlEscape(d.source)}</td><td>${htmlEscape(d.createdAt?.toDate?.()?.toISOString?.() ?? "-")}</td></tr>`; }).join("") || '<tr><td colspan="6" class="muted">No transactions</td></tr>'}</tbody></table>`;
  } else if (tab === "withdrawals") {
    const wdSnap = await db.collection("withdrawals").where("deviceId", "==", deviceId).orderBy("createdAt", "desc").limit(50).get();
    tabContent = `<table><thead><tr><th>ID</th><th>Amount</th><th>Method</th><th>Status</th><th>Date</th></tr></thead><tbody>${wdSnap.docs.map((doc) => { const d = doc.data(); return `<tr><td class="small">${htmlEscape(d.withdrawalId)}</td><td>PKR ${htmlEscape(d.amountPKR)}</td><td>${htmlEscape(d.paymentMethod)}</td><td>${htmlEscape(d.status)}</td><td>${htmlEscape(d.createdAt?.toDate?.()?.toISOString?.() ?? "-")}</td></tr>`; }).join("") || '<tr><td colspan="5" class="muted">No withdrawals</td></tr>'}</tbody></table>`;
  } else if (tab === "risk") {
    const dupeTx = await db.collection("coinTransactions").where("deviceId", "==", deviceId).where("type", "==", "offerwall_pending").get();
    const chargebacks = await db.collection("offerEvents").where("deviceId", "==", deviceId).where("status", "in", ["rejected", "reversed"]).get();
    tabContent = `<div class="stat-grid">
      <div class="stat-card"><div class="muted">Suspicious Score</div><div class="${Number(user.suspiciousScore ?? 0) > 3 ? 'danger' : ''}">${htmlEscape(Number(user.suspiciousScore ?? 0))}</div></div>
      <div class="stat-card"><div class="muted">Fraud Flags</div><div>${htmlEscape(Array.isArray(user.fraudFlags) ? user.fraudFlags.join(", ") : "None")}</div></div>
      <div class="stat-card"><div class="muted">Manual Review</div><div>${user.manualReviewRequired ? '<span class="danger">Required</span>' : 'No'}</div></div>
      <div class="stat-card"><div class="muted">Chargebacks/Rejected</div><div class="danger">${chargebacks.size}</div></div>
    </div>
    <div style="height:14px"></div>
    <div class="actions">
      <form class="inline" method="post" action="/api/admin/users/${encodeURIComponent(deviceId)}/ban"><input type="hidden" name="reason" value="Risk-based ban"/><button class="btn red" type="submit">Ban</button></form>
      <form class="inline" method="post" action="/api/admin/users/${encodeURIComponent(deviceId)}/unban"><button class="btn green" type="submit">Unban</button></form>
      <form class="inline" method="post" action="/api/admin/users/${encodeURIComponent(deviceId)}/toggle-review"><button class="btn" type="submit">Toggle Manual Review</button></form>
    </div>`;
  }

  const tabLinks = tabs.map((t) => `<a class="tab ${t.key === tab ? 'active' : ''}" href="/admin/user/${encodeURIComponent(deviceId)}?tab=${t.key}">${t.label}</a>`).join("");

  const content = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;gap:12px">
      <div><h1 style="margin:0">User: ${htmlEscape(deviceId)}</h1><div class="muted">${htmlEscape(user.firebaseUid ?? "No Firebase UID")}</div></div>
      <a class="pill" href="/admin/dashboard">Back to Dashboard</a>
    </div>
    <div style="margin-bottom:18px">${tabLinks}</div>
    <div class="card">${tabContent}</div>
  `;

  res.send(adminShell(content, getAdminCsrfToken(readSession(req))));
});

// ========================
// Admin API Routes
// ========================

adminApiRouter.use(requireAdmin);
adminApiRouter.use(requireAdminCsrf);

adminApiRouter.get("/stats", async (_req, res) => {
  try {
    const db = getFirestoreDb();
    const settings = await getAppSettings();
    const stats = await getDashboardStats(db);
    res.json({ settings, ...stats, transactionsKnown: true });
  } catch (err) {
    sendError(res, err, "Unable to load admin stats.");
  }
});

adminApiRouter.get("/users", async (_req, res) => {
  try {
    const snap = await getFirestoreDb().collection("users").orderBy("updatedAt", "desc").limit(200).get();
    res.json(snap.docs.map((doc) => serializeDoc({ id: doc.id, ...doc.data() })));
  } catch (err) {
    sendError(res, err, "Unable to load users.");
  }
});

adminApiRouter.get("/users/:deviceId", async (req, res) => {
  try {
    const snap = await getFirestoreDb().collection("users").doc(req.params.deviceId).get();
    if (!snap.exists) {
      res.status(404).json({ error: "User not found.", code: "user_not_found" });
      return;
    }
    res.json(serializeDoc({ id: snap.id, ...snap.data() }));
  } catch (err) {
    sendError(res, err, "Unable to load user.");
  }
});

adminApiRouter.post("/users/:deviceId/ban", async (req, res) => {
  try {
    await getFirestoreDb().collection("users").doc(req.params.deviceId).set({ isBanned: true, banReason: String(req.body?.reason ?? "Manual admin ban"), bannedAt: nowTs(), updatedAt: nowTs() }, { merge: true });
    formRedirect(res, { success: true, message: "User banned." });
  } catch (err) {
    sendError(res, err, "Unable to ban user.");
  }
});

adminApiRouter.post("/users/:deviceId/unban", async (req, res) => {
  try {
    await getFirestoreDb().collection("users").doc(req.params.deviceId).set({ isBanned: false, banReason: null, bannedAt: null, updatedAt: nowTs() }, { merge: true });
    formRedirect(res, { success: true, message: "User unbanned." });
  } catch (err) {
    sendError(res, err, "Unable to unban user.");
  }
});

adminApiRouter.post("/users/:deviceId/toggle-review", async (req, res) => {
  try {
    const snap = await getFirestoreDb().collection("users").doc(req.params.deviceId).get();
    if (!snap.exists) { res.status(404).json({ error: "User not found." }); return; }
    const current = Boolean(snap.data()?.manualReviewRequired);
    await snap.ref.set({ manualReviewRequired: !current, updatedAt: nowTs() }, { merge: true });
    formRedirect(res, { success: true, message: `Manual review ${!current ? "enabled" : "disabled"}.` });
  } catch (err) {
    sendError(res, err, "Unable to toggle review.");
  }
});

adminApiRouter.post("/users/:deviceId/adjust-coins", async (req, res) => {
  try {
    const coinsChange = Number(req.body?.coinsChange);
    if (!Number.isFinite(coinsChange) || coinsChange === 0) {
      res.status(400).json({ error: "coinsChange must be a non-zero number.", code: "invalid_adjustment" });
      return;
    }
    const result = await adjustUserCoins(req.params.deviceId, Math.trunc(coinsChange), String(req.body?.reason ?? "Manual admin adjustment"));
    formRedirect(res, result);
  } catch (err) {
    sendError(res, err, "Unable to adjust coins.");
  }
});

adminApiRouter.post("/users/:deviceId/adjust-energy", async (req, res) => {
  try {
    const energyChange = Number(req.body?.energyChange);
    if (!Number.isFinite(energyChange) || energyChange === 0) {
      res.status(400).json({ error: "energyChange must be a non-zero number.", code: "invalid_adjustment" });
      return;
    }
    const result = await adjustUserEnergy(req.params.deviceId, Math.trunc(energyChange), String(req.body?.reason ?? "Manual admin adjustment"));
    formRedirect(res, result);
  } catch (err) {
    sendError(res, err, "Unable to adjust energy.");
  }
});

adminApiRouter.get("/withdrawals", async (_req, res) => {
  try {
    const snap = await getFirestoreDb().collection("withdrawals").orderBy("createdAt", "desc").limit(200).get();
    res.json(snap.docs.map((doc) => serializeDoc({ id: doc.id, ...doc.data() })));
  } catch (err) {
    sendError(res, err, "Unable to load withdrawals.");
  }
});

adminApiRouter.post("/withdrawals/:withdrawalId/approve", async (req, res) => {
  try {
    const result = await markWithdrawalStatus(req.params.withdrawalId, "approved", String(req.body?.adminNote ?? ""));
    formRedirect(res, result);
  } catch (err) {
    sendError(res, err, "Unable to approve withdrawal.");
  }
});

adminApiRouter.post("/withdrawals/:withdrawalId/reject", async (req, res) => {
  try {
    const result = await rejectWithdrawal(req.params.withdrawalId, String(req.body?.reason ?? "Rejected by admin"));
    formRedirect(res, result);
  } catch (err) {
    sendError(res, err, "Unable to reject withdrawal.");
  }
});

adminApiRouter.post("/withdrawals/:withdrawalId/mark-paid", async (req, res) => {
  try {
    const result = await markWithdrawalStatus(req.params.withdrawalId, "paid", String(req.body?.adminNote ?? ""));
    formRedirect(res, result);
  } catch (err) {
    sendError(res, err, "Unable to mark withdrawal paid.");
  }
});

adminApiRouter.get("/transactions", async (_req, res) => {
  try {
    const snap = await getFirestoreDb().collection("coinTransactions").orderBy("createdAt", "desc").limit(300).get();
    res.json(snap.docs.map((doc) => serializeDoc({ id: doc.id, ...doc.data() })));
  } catch (err) {
    sendError(res, err, "Unable to load transactions.");
  }
});

adminApiRouter.get("/support", async (_req, res) => {
  try {
    const snap = await getFirestoreDb().collection("supportTickets").orderBy("createdAt", "desc").limit(200).get();
    res.json(snap.docs.map((doc) => serializeDoc({ id: doc.id, ...doc.data() })));
  } catch (err) {
    sendError(res, err, "Unable to load support tickets.");
  }
});

adminApiRouter.post("/support/:ticketId/close", async (req, res) => {
  try {
    await getFirestoreDb().collection("supportTickets").doc(req.params.ticketId).set({ status: "closed", updatedAt: nowTs() }, { merge: true });
    formRedirect(res, { success: true, message: "Ticket closed." });
  } catch (err) {
    sendError(res, err, "Unable to close ticket.");
  }
});

// Offer Events Admin API
adminApiRouter.get("/offer-events", async (_req, res) => {
  try {
    const snap = await getFirestoreDb().collection("offerEvents").orderBy("createdAt", "desc").limit(300).get();
    res.json(snap.docs.map((doc) => serializeDoc({ id: doc.id, ...doc.data() })));
  } catch (err) {
    sendError(res, err, "Unable to load offer events.");
  }
});

adminApiRouter.post("/offer-events/:eventId/confirm", async (req, res) => {
  try {
    const result = await adminConfirmOfferEvent(req.params.eventId, String(req.body?.adminNote ?? ""));
    formRedirect(res, result);
  } catch (err) {
    sendError(res, err, "Unable to confirm offer event.");
  }
});

adminApiRouter.post("/offer-events/:eventId/reject", async (req, res) => {
  try {
    const result = await adminRejectOfferEvent(req.params.eventId, String(req.body?.reason ?? "Rejected by admin"));
    formRedirect(res, result);
  } catch (err) {
    sendError(res, err, "Unable to reject offer event.");
  }
});

adminApiRouter.post("/offer-events/:eventId/reverse", async (req, res) => {
  try {
    const result = await adminReverseOfferEvent(req.params.eventId, String(req.body?.reason ?? "Reversed by admin"));
    formRedirect(res, result);
  } catch (err) {
    sendError(res, err, "Unable to reverse offer event.");
  }
});

// Auto-confirm job
adminApiRouter.post("/jobs/confirm-pending-rewards", async (_req, res) => {
  try {
    const result = await runConfirmPendingRewardsJob();
    res.json(result);
  } catch (err) {
    sendError(res, err, "Unable to run confirm job.");
  }
});

// Ad Events Admin API
adminApiRouter.get("/ad-events", async (_req, res) => {
  try {
    const snap = await getFirestoreDb().collection("adEvents").orderBy("createdAt", "desc").limit(300).get();
    res.json(snap.docs.map((doc) => serializeDoc({ id: doc.id, ...doc.data() })));
  } catch (err) {
    sendError(res, err, "Unable to load ad events.");
  }
});

// In-memory sync state (lost on restart; sufficient for admin reporting)
let lastSyncAt: string | null = null;
let lastSyncError: string | null = null;

// Google Sheets Admin API
adminApiRouter.get("/reports/google-sheets/status", async (_req, res) => {
  try {
    const cfg = loadGoogleSheetsConfig();
    const missingSecrets: string[] = [];
    if (!cfg.clientEmail) missingSecrets.push("GOOGLE_SHEETS_CLIENT_EMAIL");
    if (!cfg.privateKey) missingSecrets.push("GOOGLE_SHEETS_PRIVATE_KEY");

    res.json({
      enabled: cfg.enabled,
      configured: hasRequiredSecrets(cfg),
      spreadsheetId: cfg.spreadsheetId ?? null,
      spreadsheetUrl: cfg.spreadsheetId ? `https://docs.google.com/spreadsheets/d/${cfg.spreadsheetId}/edit` : null,
      lastSyncAt,
      missingSecrets,
      lastError: lastSyncError,
    });
  } catch (err) {
    sendError(res, err, "Unable to load Google Sheets status.");
  }
});

adminApiRouter.post("/reports/google-sheets/setup", async (_req, res) => {
  try {
    const cfg = loadGoogleSheetsConfig();
    if (!cfg.enabled) {
      res.status(400).json({ error: "Google Sheets is disabled.", code: "sheets_disabled" });
      return;
    }
    if (!cfg.clientEmail || !cfg.privateKey) {
      res.status(400).json({ error: "Missing Google Sheets credentials.", code: "sheets_missing_credentials" });
      return;
    }
    const result = await ensureSpreadsheet(cfg);
    if (!result) {
      res.status(500).json({ error: "Failed to create or access spreadsheet.", code: "sheets_setup_failed" });
      return;
    }
    res.json({ success: true, spreadsheetId: result.spreadsheetId, spreadsheetUrl: result.spreadsheetUrl });
  } catch (err) {
    sendError(res, err, "Unable to setup Google Sheets.");
  }
});

adminApiRouter.post("/reports/google-sheets/sync", async (_req, res) => {
  try {
    const cfg = loadGoogleSheetsConfig();
    if (!cfg.enabled) {
      res.status(400).json({ error: "Google Sheets is disabled.", code: "sheets_disabled" });
      return;
    }
    if (!cfg.clientEmail || !cfg.privateKey) {
      res.status(400).json({ error: "Missing Google Sheets credentials.", code: "sheets_missing_credentials" });
      return;
    }
    const spreadsheetId = cfg.spreadsheetId;
    if (!spreadsheetId) {
      res.status(400).json({ error: "No spreadsheet configured. Run setup first.", code: "sheets_not_setup" });
      return;
    }

    const db = getFirestoreDb();
    const summary = await syncGoogleSheetsReport(db, spreadsheetId);
    lastSyncAt = new Date().toISOString();
    lastSyncError = null;
    res.json({ success: true, summary, lastSyncAt });
  } catch (err) {
    lastSyncError = err instanceof Error ? err.message : String(err);
    sendError(res, err, "Unable to sync Google Sheets.");
  }
});

function hasRequiredSecrets(cfg: import("../services/googleSheets.js").GoogleSheetsConfig): boolean {
  return !!(cfg.clientEmail && cfg.privateKey);
}

export default adminPanelRouter;
