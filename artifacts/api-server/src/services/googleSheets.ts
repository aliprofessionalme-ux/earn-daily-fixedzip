import { google, type sheets_v4 } from "googleapis";
import { logger } from "../lib/logger.js";

// ==================== COLOR PALETTE ====================
const PAGE_BG: sheets_v4.Schema$Color = { red: 0.043, green: 0.059, blue: 0.078 };
const CARD_BG: sheets_v4.Schema$Color = { red: 0.067, green: 0.094, blue: 0.153 };
const GOLD_BG: sheets_v4.Schema$Color = { red: 0.98, green: 0.80, blue: 0.082 };
const GOLD_TEXT: sheets_v4.Schema$Color = { red: 0.98, green: 0.80, blue: 0.082 };
const BLACK_TEXT: sheets_v4.Schema$Color = { red: 0, green: 0, blue: 0 };
const WHITE_TEXT: sheets_v4.Schema$Color = { red: 0.9, green: 0.9, blue: 0.9 };
const GREEN_BADGE: sheets_v4.Schema$Color = { red: 0.20, green: 0.75, blue: 0.35 };
const YELLOW_BADGE: sheets_v4.Schema$Color = { red: 0.95, green: 0.75, blue: 0.10 };
const RED_BADGE: sheets_v4.Schema$Color = { red: 0.90, green: 0.25, blue: 0.20 };
const ORANGE_BADGE: sheets_v4.Schema$Color = { red: 0.95, green: 0.55, blue: 0.15 };
const ALT_ROW_BG: sheets_v4.Schema$Color = { red: 0.08, green: 0.11, blue: 0.18 };
const DARK_GOLD_BORDER: sheets_v4.Schema$Color = { red: 0.631, green: 0.384, blue: 0.027 };

const TAB1 = "User Data & Activity";
const TAB2 = "Tax & Finance Dashboard";
const ALL_VISIBLE_TABS = [TAB1, TAB2];

const KNOWN_OLD_TABS = [
  "Dashboard","Users Data","User Balances","Transactions",
  "App Data Dashboard","Tax & Finance Dashboard old copy",
  "Raw Export Backup","Provider Revenue","Offerwall Events",
  "Ad Events","Withdrawals","Daily Summary","Manual Notes",
  "Top Users","Tax Records",
];

export interface GoogleSheetsConfig {
  enabled: boolean;
  clientEmail?: string;
  privateKey?: string;
  ownerEmail?: string;
  spreadsheetId?: string;
}

export function loadGoogleSheetsConfig(): GoogleSheetsConfig {
  return {
    enabled: process.env["GOOGLE_SHEETS_ENABLED"] === "true",
    clientEmail: process.env["GOOGLE_SHEETS_CLIENT_EMAIL"] || undefined,
    privateKey: process.env["GOOGLE_SHEETS_PRIVATE_KEY"]?.replace(/\\n/g, "\n") || undefined,
    ownerEmail: process.env["GOOGLE_SHEETS_OWNER_EMAIL"] || undefined,
    spreadsheetId: process.env["GOOGLE_SHEETS_SPREADSHEET_ID"] || undefined,
  };
}

function hasRequiredSecrets(cfg: GoogleSheetsConfig): boolean {
  return !!(cfg.clientEmail && cfg.privateKey && cfg.spreadsheetId);
}

function getAuthClient(cfg: GoogleSheetsConfig) {
  if (!cfg.clientEmail || !cfg.privateKey) return null;
  return new google.auth.GoogleAuth({
    credentials: { client_email: cfg.clientEmail, private_key: cfg.privateKey },
    scopes: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"],
  });
}

// ==================== STATUS COLOR ====================
function badgeColor(status: string): sheets_v4.Schema$Color {
  const s = status.toLowerCase();
  if (s.includes("paid") || s.includes("confirmed") || s.includes("completed") || s.includes("active") || s.includes("normal")) return GREEN_BADGE;
  if (s.includes("approved")) return ORANGE_BADGE;
  if (s.includes("pending")) return YELLOW_BADGE;
  if (s.includes("manual_review") || s.includes("review")) return ORANGE_BADGE;
  if (s.includes("rejected") || s.includes("reversed") || s.includes("banned") || s.includes("failed")) return RED_BADGE;
  return CARD_BG;
}

function badgeFg(status: string): sheets_v4.Schema$Color {
  const s = status.toLowerCase();
  if (s.includes("pending") || s.includes("manual") || s.includes("approved")) return BLACK_TEXT;
  return WHITE_TEXT;
}

// ==================== SHEET FORMATTING HELPERS ====================
function fmt(
  bg?: sheets_v4.Schema$Color,
  fg?: sheets_v4.Schema$Color,
  bold?: boolean,
  align?: "LEFT" | "CENTER" | "RIGHT",
  size?: number,
  border?: boolean,
): sheets_v4.Schema$CellFormat {
  const f: sheets_v4.Schema$CellFormat = {
    backgroundColor: bg,
    horizontalAlignment: align ?? "LEFT",
    verticalAlignment: "MIDDLE",
    textFormat: { foregroundColor: fg ?? WHITE_TEXT, bold: bold ?? false, fontSize: size ?? 10 },
    wrapStrategy: "CLIP",
  };
  if (border) {
    f.borders = {
      top: { style: "SOLID", color: DARK_GOLD_BORDER },
      bottom: { style: "SOLID", color: DARK_GOLD_BORDER },
      left: { style: "SOLID", color: DARK_GOLD_BORDER },
      right: { style: "SOLID", color: DARK_GOLD_BORDER },
    };
  }
  return f;
}

function mergeRequest(sheetId: number, r1: number, r2: number, c1: number, c2: number): sheets_v4.Schema$Request {
  return {
    mergeCells: {
      range: { sheetId, startRowIndex: r1, endRowIndex: r2, startColumnIndex: c1, endColumnIndex: c2 },
      mergeType: "MERGE_ALL",
    },
  };
}

function cellValue(text: string, format?: sheets_v4.Schema$CellFormat): sheets_v4.Schema$CellData {
  return {
    userEnteredValue: { stringValue: text },
    userEnteredFormat: format,
  };
}

function colLetter(i: number): string {
  let r = ""; let n = i;
  while (n > 0) { const rem = (n - 1) % 26; r = String.fromCharCode(65 + rem) + r; n = Math.floor((n - 1) / 26); }
  return r || "A";
}

// ==================== SHEET SETUP (REDESIGN) ====================
export async function ensureSpreadsheet(cfg: GoogleSheetsConfig): Promise<{ spreadsheetId: string; spreadsheetUrl: string } | null> {
  if (!cfg.enabled || !hasRequiredSecrets(cfg)) return null;
  const auth = getAuthClient(cfg);
  if (!auth) return null;
  const sheets = google.sheets({ version: "v4", auth });
  const id = cfg.spreadsheetId!.trim();

  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: id });
    logger.info({ spreadsheetId: id }, "Redesigning existing spreadsheet");
    await redesignSpreadsheet(id, auth, meta.data.sheets || []);
    return { spreadsheetId: id, spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${id}/edit` };
  } catch (err) {
    logger.error({ err, spreadsheetId: id }, "Cannot access spreadsheet");
    return null;
  }
}

async function redesignSpreadsheet(
  spreadsheetId: string,
  auth: ReturnType<typeof getAuthClient>,
  existingSheets: sheets_v4.Schema$Sheet[],
): Promise<void> {
  if (!auth) return;
  const sheets = google.sheets({ version: "v4", auth });

  const existingTitles = new Set(existingSheets.map((s) => s.properties?.title));
  const sheetIdMap = new Map<string, number>();
  existingSheets.forEach((s) => { const t = s.properties?.title; if (t) sheetIdMap.set(t, s.properties?.sheetId!); });

  // 1. Delete old tabs
  const delReqs: sheets_v4.Schema$Request[] = [];
  for (const name of [...KNOWN_OLD_TABS, ...ALL_VISIBLE_TABS]) {
    if (existingTitles.has(name)) {
      const sid = sheetIdMap.get(name);
      if (sid != null) delReqs.push({ deleteSheet: { sheetId: sid } });
    }
  }
  if (delReqs.length > 0) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: delReqs } });
  }

  // 2. Create clean tabs
  const addReqs: sheets_v4.Schema$Request[] = [];
  for (const tabName of ALL_VISIBLE_TABS) {
    addReqs.push({ addSheet: { properties: { title: tabName, gridProperties: { rowCount: 5000, columnCount: 22 } } } });
  }
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: addReqs } });

  // Refresh
  const freshMeta = await sheets.spreadsheets.get({ spreadsheetId });
  const freshSheets = freshMeta.data.sheets || [];
  const freshMap = new Map<string, number>();
  freshSheets.forEach((s) => { const t = s.properties?.title; if (t) freshMap.set(t, s.properties?.sheetId!); });

  // 3. Apply dark background to entire sheets
  for (const [name, sid] of freshMap) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          repeatCell: {
            range: { sheetId: sid, startRowIndex: 0, endRowIndex: 5000, startColumnIndex: 0, endColumnIndex: 22 },
            cell: { userEnteredFormat: { backgroundColor: PAGE_BG } },
            fields: "userEnteredFormat.backgroundColor",
          },
        }],
      },
    });
  }

  // 4. Build layouts
  await buildTab1Layout(sheets, spreadsheetId, freshMap.get(TAB1)!);
  await buildTab2Layout(sheets, spreadsheetId, freshMap.get(TAB2)!);

  logger.info({ spreadsheetId }, "Spreadsheet redesign complete");
}

// ==================== TAB 1: USER DATA & ACTIVITY ====================
async function buildTab1Layout(sheets: sheets_v4.Sheets, spreadsheetId: string, sheetId: number): Promise<void> {
  const R: sheets_v4.Schema$Request[] = [];

  // Row 0-1: Merged title
  R.push(mergeRequest(sheetId, 0, 2, 0, 22));
  R.push({
    updateCells: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 22 },
      rows: [{ values: [cellValue("EARN DAILY \u2014 USER DATA & APP ACTIVITY", fmt(PAGE_BG, GOLD_TEXT, true, "CENTER", 18, true))] }],
      fields: "userEnteredValue,userEnteredFormat",
    },
  });

  // Row 3-5: Summary cards (5 cards, 4 columns each)
  const cards = ["Total Users", "Active Users", "Manual Review", "Banned Users", "Total Paid PKR"];
  for (let i = 0; i < cards.length; i++) {
    const c1 = i * 4;
    const c2 = c1 + 4;
    R.push(mergeRequest(sheetId, 3, 4, c1, c2));
    R.push(mergeRequest(sheetId, 4, 5, c1, c2));
    R.push({
      updateCells: {
        range: { sheetId, startRowIndex: 3, endRowIndex: 5, startColumnIndex: c1, endColumnIndex: c2 },
        rows: [
          { values: [cellValue(cards[i], fmt(CARD_BG, GOLD_TEXT, true, "CENTER", 11, true))] },
          { values: [cellValue("0", fmt(CARD_BG, WHITE_TEXT, true, "CENTER", 14, true))] },
        ],
        fields: "userEnteredValue,userEnteredFormat",
      },
    });
  }

  // Row 7: Section title
  R.push(mergeRequest(sheetId, 7, 8, 0, 22));
  R.push({
    updateCells: {
      range: { sheetId, startRowIndex: 7, endRowIndex: 8, startColumnIndex: 0, endColumnIndex: 22 },
      rows: [{ values: [cellValue("USER DATA & BALANCES", fmt(CARD_BG, GOLD_TEXT, true, "LEFT", 13))] }],
      fields: "userEnteredValue,userEnteredFormat",
    },
  });

  // Row 9: Table headers
  const udHeaders = [
    "Date", "Device ID", "Firebase UID", "User Name", "Email", "Phone",
    "Status", "Banned", "Manual Review", "Risk Score", "Energy",
    "Pending Coins", "Confirmed Coins", "PKR Balance",
    "Lifetime Pending", "Lifetime Confirmed", "Lifetime Paid PKR",
    "Tasks", "Ads", "WD Requested", "Last Active", "Admin Note",
  ];
  R.push({
    updateCells: {
      range: { sheetId, startRowIndex: 9, endRowIndex: 10, startColumnIndex: 0, endColumnIndex: udHeaders.length },
      rows: [{
        values: udHeaders.map((h) => cellValue(h, fmt(GOLD_BG, BLACK_TEXT, true, "CENTER", 10, true))),
      }],
      fields: "userEnteredValue,userEnteredFormat",
    },
  });

  // Freeze rows 0-9
  R.push({
    updateSheetProperties: {
      properties: { sheetId, gridProperties: { frozenRowCount: 10 } },
      fields: "gridProperties.frozenRowCount",
    },
  });

  // Column widths
  const widths = [100, 180, 220, 130, 220, 130, 100, 70, 90, 70, 70, 100, 110, 90, 110, 120, 110, 60, 60, 90, 130, 280];
  for (let i = 0; i < widths.length; i++) {
    R.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: "COLUMNS", startIndex: i, endIndex: i + 1 },
        properties: { pixelSize: widths[i] },
        fields: "pixelSize",
      },
    });
  }

  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: R } });
}

// ==================== TAB 2: TAX & FINANCE DASHBOARD ====================
async function buildTab2Layout(sheets: sheets_v4.Sheets, spreadsheetId: string, sheetId: number): Promise<void> {
  const R: sheets_v4.Schema$Request[] = [];

  // Row 0-1: Title
  R.push(mergeRequest(sheetId, 0, 2, 0, 22));
  R.push({
    updateCells: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 22 },
      rows: [{ values: [cellValue("EARN DAILY \u2014 TAX & FINANCIAL DASHBOARD", fmt(PAGE_BG, GOLD_TEXT, true, "CENTER", 18, true))] }],
      fields: "userEnteredValue,userEnteredFormat",
    },
  });

  // Row 3-5: Summary cards
  const cards = ["Total Rev USD", "Total Rev PKR", "User Payouts", "Net Profit", "Taxable Est"];
  for (let i = 0; i < cards.length; i++) {
    const c1 = i * 4;
    const c2 = c1 + 4;
    R.push(mergeRequest(sheetId, 3, 4, c1, c2));
    R.push(mergeRequest(sheetId, 4, 5, c1, c2));
    R.push({
      updateCells: {
        range: { sheetId, startRowIndex: 3, endRowIndex: 5, startColumnIndex: c1, endColumnIndex: c2 },
        rows: [
          { values: [cellValue(cards[i], fmt(CARD_BG, GOLD_TEXT, true, "CENTER", 11, true))] },
          { values: [cellValue("0", fmt(CARD_BG, WHITE_TEXT, true, "CENTER", 14, true))] },
        ],
        fields: "userEnteredValue,userEnteredFormat",
      },
    });
  }

  // Row 7-8: Monthly Tax Summary section title
  R.push(mergeRequest(sheetId, 7, 8, 0, 22));
  R.push({
    updateCells: {
      range: { sheetId, startRowIndex: 7, endRowIndex: 8, startColumnIndex: 0, endColumnIndex: 22 },
      rows: [{ values: [cellValue("MONTHLY TAX SUMMARY", fmt(CARD_BG, GOLD_TEXT, true, "LEFT", 13))] }],
      fields: "userEnteredValue,userEnteredFormat",
    },
  });

  // Row 9: Tax headers
  const taxHeaders = [
    "Month", "USD\u2192PKR", "Rev USD", "Rev PKR", "Payouts PKR", "Provider Fees",
    "Bank/Platform Fees", "Gross Profit", "Net Profit", "Taxable Est", "Notes",
  ];
  R.push({
    updateCells: {
      range: { sheetId, startRowIndex: 9, endRowIndex: 10, startColumnIndex: 0, endColumnIndex: taxHeaders.length },
      rows: [{
        values: taxHeaders.map((h) => cellValue(h, fmt(GOLD_BG, BLACK_TEXT, true, "CENTER", 10, true))),
      }],
      fields: "userEnteredValue,userEnteredFormat",
    },
  });

  // Row 23-24: Withdrawals Ledger section title
  R.push(mergeRequest(sheetId, 23, 24, 0, 22));
  R.push({
    updateCells: {
      range: { sheetId, startRowIndex: 23, endRowIndex: 24, startColumnIndex: 0, endColumnIndex: 22 },
      rows: [{ values: [cellValue("WITHDRAWALS LEDGER", fmt(CARD_BG, GOLD_TEXT, true, "LEFT", 13))] }],
      fields: "userEnteredValue,userEnteredFormat",
    },
  });

  // Row 25: WD headers
  const wdHeaders = [
    "Date", "WD ID", "Device ID", "Firebase UID", "Amount PKR", "Coins Ded",
    "Method", "Account #", "Status", "Requested", "Approved", "Paid", "Admin Note",
  ];
  R.push({
    updateCells: {
      range: { sheetId, startRowIndex: 25, endRowIndex: 26, startColumnIndex: 0, endColumnIndex: wdHeaders.length },
      rows: [{
        values: wdHeaders.map((h) => cellValue(h, fmt(GOLD_BG, BLACK_TEXT, true, "CENTER", 10, true))),
      }],
      fields: "userEnteredValue,userEnteredFormat",
    },
  });

  // Row 39-40: Provider Revenue section title
  R.push(mergeRequest(sheetId, 39, 40, 0, 22));
  R.push({
    updateCells: {
      range: { sheetId, startRowIndex: 39, endRowIndex: 40, startColumnIndex: 0, endColumnIndex: 22 },
      rows: [{ values: [cellValue("PROVIDER REVENUE LEDGER", fmt(CARD_BG, GOLD_TEXT, true, "LEFT", 13))] }],
      fields: "userEnteredValue,userEnteredFormat",
    },
  });

  // Row 41: Provider headers
  const provHeaders = [
    "Date", "Provider", "Rev USD", "Rev PKR", "Pending", "Confirmed",
    "Rejected", "Reversed", "User Payout Est", "Profit Est", "Tasks", "Status",
  ];
  R.push({
    updateCells: {
      range: { sheetId, startRowIndex: 41, endRowIndex: 42, startColumnIndex: 0, endColumnIndex: provHeaders.length },
      rows: [{
        values: provHeaders.map((h) => cellValue(h, fmt(GOLD_BG, BLACK_TEXT, true, "CENTER", 10, true))),
      }],
      fields: "userEnteredValue,userEnteredFormat",
    },
  });

  // Row 55-56: Transaction Summary section title
  R.push(mergeRequest(sheetId, 55, 56, 0, 22));
  R.push({
    updateCells: {
      range: { sheetId, startRowIndex: 55, endRowIndex: 56, startColumnIndex: 0, endColumnIndex: 22 },
      rows: [{ values: [cellValue("TRANSACTION SUMMARY", fmt(CARD_BG, GOLD_TEXT, true, "LEFT", 13))] }],
      fields: "userEnteredValue,userEnteredFormat",
    },
  });

  // Row 57: Transaction headers
  const txHeaders = [
    "Date", "Tx ID", "Device ID", "Firebase UID", "Type", "Source",
    "Provider", "Coins", "Energy", "PKR", "Status", "Note",
  ];
  R.push({
    updateCells: {
      range: { sheetId, startRowIndex: 57, endRowIndex: 58, startColumnIndex: 0, endColumnIndex: txHeaders.length },
      rows: [{
        values: txHeaders.map((h) => cellValue(h, fmt(GOLD_BG, BLACK_TEXT, true, "CENTER", 10, true))),
      }],
      fields: "userEnteredValue,userEnteredFormat",
    },
  });

  // Freeze rows 0-9
  R.push({
    updateSheetProperties: {
      properties: { sheetId, gridProperties: { frozenRowCount: 10 } },
      fields: "gridProperties.frozenRowCount",
    },
  });

  // Column widths for tab2
  const widths = [100, 160, 180, 220, 100, 100, 100, 100, 100, 100, 100, 140, 180];
  for (let i = 0; i < widths.length; i++) {
    R.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: "COLUMNS", startIndex: i, endIndex: i + 1 },
        properties: { pixelSize: widths[i] },
        fields: "pixelSize",
      },
    });
  }

  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: R } });
}

// ==================== DATA SYNC ====================
export interface SyncSummary {
  usersAdded: number;
  withdrawalsAdded: number;
  taxRowsAdded: number;
  providerRowsAdded: number;
  txRowsAdded: number;
}

export async function syncGoogleSheetsReport(
  db: import("firebase-admin").firestore.Firestore,
  spreadsheetId: string,
): Promise<SyncSummary> {
  const summary: SyncSummary = { usersAdded: 0, withdrawalsAdded: 0, taxRowsAdded: 0, providerRowsAdded: 0, txRowsAdded: 0 };

  const cfg = loadGoogleSheetsConfig();
  if (!cfg.enabled || !hasRequiredSecrets(cfg)) return summary;
  const auth = getAuthClient(cfg);
  if (!auth) return summary;
  const sheets = google.sheets({ version: "v4", auth });

  // Fetch metadata
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const allSheets = meta.data.sheets || [];
  const sidMap = new Map<string, number>();
  allSheets.forEach((s) => { const t = s.properties?.title; if (t) sidMap.set(t, s.properties?.sheetId!); });

  const sid1 = sidMap.get(TAB1);
  const sid2 = sidMap.get(TAB2);
  if (!sid1 || !sid2) {
    logger.warn("Clean tabs not found. Run redesign first.");
    return summary;
  }

  // ========== FETCH FIRESTORE DATA ==========
  let usersSnap: import("firebase-admin").firestore.QuerySnapshot | null = null;
  let wdSnap: import("firebase-admin").firestore.QuerySnapshot | null = null;
  let offerSnap: import("firebase-admin").firestore.QuerySnapshot | null = null;
  let adSnap: import("firebase-admin").firestore.QuerySnapshot | null = null;
  let txSnap: import("firebase-admin").firestore.QuerySnapshot | null = null;

  try { usersSnap = await db.collection("users").get(); } catch (e) { logger.warn({ err: e }, "users fetch"); }
  try { wdSnap = await db.collection("withdrawals").get(); } catch (e) { logger.warn({ err: e }, "withdrawals fetch"); }
  try { offerSnap = await db.collection("offerEvents").get(); } catch (e) { logger.warn({ err: e }, "offerEvents fetch"); }
  try { adSnap = await db.collection("adEvents").get(); } catch (e) { logger.warn({ err: e }, "adEvents fetch"); }
  try { txSnap = await db.collection("coinTransactions").get(); } catch (e) { logger.warn({ err: e }, "coinTransactions fetch"); }

  const settingsSnap = await db.collection("settings").doc("app").get().catch(() => null);
  const appSettings = settingsSnap?.exists ? settingsSnap.data() ?? {} : {};
  const coinRateCoins = Number(appSettings.coinRateCoins ?? 1000) || 1000;
  const coinRatePKR = Number(appSettings.coinRatePKR ?? 20) || 20;
  const usdToPKRRate = Number(process.env["USD_TO_PKR_RATE"] ?? 278) || 278;
  const coinsToPKR = (coins: number) => Number(((Number(coins || 0) / coinRateCoins) * coinRatePKR).toFixed(2));

  // ========== COMPUTE AGGREGATES ==========
  const activeUsers = usersSnap?.size ?? 0;
  let totalPendingCoins = 0;
  let totalConfirmedCoins = 0;
  let totalEnergy = 0;
  let manualReviewCount = 0;
  let bannedCount = 0;
  let pendingWDCount = 0;
  let paidWDTotal = 0;
  let totalRevenueUSD = 0;
  let totalTasks = 0;
  const userTaskCount: Record<string, number> = {};
  const userAdCount: Record<string, number> = {};
  const userWDReq: Record<string, number> = {};
  const userWDPaid: Record<string, number> = {};

  usersSnap?.docs.forEach((doc) => {
    const d = doc.data();
    totalPendingCoins += Number(d.pendingCoinsBalance ?? 0);
    totalConfirmedCoins += Number(d.confirmedCoinsBalance ?? d.coinsBalance ?? 0);
    totalEnergy += Number(d.energyBalance ?? 0);
    if (d.manualReviewRequired) manualReviewCount += 1;
    if (d.isBanned) bannedCount += 1;
  });

  wdSnap?.docs.forEach((doc) => {
    const d = doc.data();
    const id = d.deviceId ?? "";
    if (d.status === "pending") pendingWDCount += 1;
    if (d.status === "paid") paidWDTotal += Number(d.amountPKR ?? 0);
    userWDReq[id] = (userWDReq[id] ?? 0) + 1;
    if (d.status === "paid") userWDPaid[id] = (userWDPaid[id] ?? 0) + Number(d.amountPKR ?? 0);
  });

  offerSnap?.docs.forEach((doc) => {
    const d = doc.data();
    const id = d.deviceId ?? "";
    userTaskCount[id] = (userTaskCount[id] ?? 0) + 1;
    if (d.status === "confirmed") {
      totalTasks += 1;
      totalRevenueUSD += Number(d.payoutUSD ?? 0);
    }
  });

  adSnap?.docs.forEach((doc) => {
    const d = doc.data();
    const id = d.deviceId ?? "";
    userAdCount[id] = (userAdCount[id] ?? 0) + 1;
  });

  const revenuePKR = totalRevenueUSD * usdToPKRRate;
  const netProfitPKR = revenuePKR - paidWDTotal;
  const taxableEst = netProfitPKR * 0.15;

  // ========== TAB 1: UPDATE DATA ==========
  try {
    // Update KPI cards (row 4, columns 0,4,8,12,16)
    const kpiValues = [String(activeUsers), String(activeUsers), String(manualReviewCount), String(bannedCount), `PKR ${paidWDTotal.toFixed(2)}`];
    const kpiRow: sheets_v4.Schema$RowData[] = [];
    for (let i = 0; i < kpiValues.length; i++) {
      kpiRow.push({ values: [cellValue(kpiValues[i], fmt(CARD_BG, WHITE_TEXT, true, "CENTER", 14, true))] });
    }
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          updateCells: {
            range: { sheetId: sid1, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: 20 },
            rows: [{ values: kpiValues.map((v) => cellValue(v, fmt(CARD_BG, WHITE_TEXT, true, "CENTER", 14))) }],
            fields: "userEnteredValue,userEnteredFormat",
          },
        }],
      },
    });

    // Write user data (row 10+)
    const userRows: (string | number)[][] = [];
    usersSnap?.docs.forEach((doc) => {
      const d = doc.data();
      const did = d.deviceId ?? doc.id;
      const st = d.isBanned ? "Banned" : d.manualReviewRequired ? "Manual Review" : "Active";
      const tasks = userTaskCount[did] ?? 0;
      const ads = userAdCount[did] ?? 0;
      const wdReq = userWDReq[did] ?? 0;
      userRows.push([
        d.createdAt?.toDate?.()?.toISOString?.()?.split("T")?.[0] ?? "",
        did,
        d.firebaseUid ?? "",
        d.displayName ?? "",
        d.email ?? "",
        d.phone ?? "",
        st,
        d.isBanned ? "Yes" : "No",
        d.manualReviewRequired ? "Yes" : "No",
        d.suspiciousScore ?? 0,
        d.energyBalance ?? 0,
        d.pendingCoinsBalance ?? 0,
        d.confirmedCoinsBalance ?? d.coinsBalance ?? 0,
        d.pkrBalance ?? 0,
        d.lifetimePendingCoins ?? d.pendingCoinsBalance ?? 0,
        d.lifetimeConfirmedCoins ?? d.confirmedCoinsBalance ?? d.coinsBalance ?? 0,
        userWDPaid[did] ?? 0,
        tasks,
        ads,
        wdReq,
        d.lastActiveAt?.toDate?.()?.toISOString?.() ?? "",
        d.adminNote ?? "",
      ]);
    });

    // Clear old user data rows (row 10 to 5000)
    await clearRows(sheets, spreadsheetId, sid1, 10, 5000);
    if (userRows.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${TAB1}!A11`,
        valueInputOption: "RAW",
        requestBody: { values: userRows },
      });
      await applyAlternatingAndStatus(sheets, spreadsheetId, sid1, 10, userRows, 6, true);
      summary.usersAdded = userRows.length;
    }
  } catch (err) {
    logger.error({ err }, "Tab1 sync failed");
  }

  // ========== TAB 2: UPDATE DATA ==========
  try {
    // KPI cards row 4
    const kpi2 = [
      `$${totalRevenueUSD.toFixed(2)}`,
      `PKR ${revenuePKR.toFixed(2)}`,
      `PKR ${paidWDTotal.toFixed(2)}`,
      `PKR ${netProfitPKR.toFixed(2)}`,
      `PKR ${taxableEst.toFixed(2)}`,
    ];
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          updateCells: {
            range: { sheetId: sid2, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: 20 },
            rows: [{ values: kpi2.map((v) => cellValue(v, fmt(CARD_BG, WHITE_TEXT, true, "CENTER", 14))) }],
            fields: "userEnteredValue,userEnteredFormat",
          },
        }],
      },
    });

    // Monthly Tax Summary (row 10)
    const month = new Date().toISOString().slice(0, 7);
    const taxRow = [
      month, usdToPKRRate,
      totalRevenueUSD.toFixed(2), revenuePKR.toFixed(2),
      paidWDTotal.toFixed(2), "0", "0",
      (revenuePKR - paidWDTotal).toFixed(2),
      netProfitPKR.toFixed(2), taxableEst.toFixed(2), "",
    ];
    await clearRows(sheets, spreadsheetId, sid2, 10, 22);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${TAB2}!A11`,
      valueInputOption: "RAW",
      requestBody: { values: [taxRow] },
    });
    await applyAlternatingAndStatus(sheets, spreadsheetId, sid2, 10, [taxRow], 10, false);
    summary.taxRowsAdded = 1;

    // Withdrawals Ledger (row 26+)
    const wdRows: (string | number)[][] = [];
    wdSnap?.docs.forEach((doc) => {
      const d = doc.data();
      wdRows.push([
        d.createdAt?.toDate?.()?.toISOString?.()?.split("T")?.[0] ?? "",
        d.withdrawalId ?? "",
        d.deviceId ?? "",
        d.firebaseUid ?? "",
        d.amountPKR ?? 0,
        d.coinsDeducted ?? 0,
        d.paymentMethod ?? "",
        d.accountNumber ?? "",
        d.status ?? "",
        d.createdAt?.toDate?.()?.toISOString?.() ?? "",
        d.processedAt?.toDate?.()?.toISOString?.() ?? "",
        d.paidAt?.toDate?.()?.toISOString?.() ?? "",
        d.adminNote ?? d.rejectionReason ?? "",
      ]);
    });
    await clearRows(sheets, spreadsheetId, sid2, 26, 38);
    if (wdRows.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${TAB2}!A27`,
        valueInputOption: "RAW",
        requestBody: { values: wdRows },
      });
      await applyAlternatingAndStatus(sheets, spreadsheetId, sid2, 26, wdRows, 8, true);
      summary.withdrawalsAdded = wdRows.length;
    }

    // Provider Revenue (row 42+)
    const provMap: Record<string, { revUSD: number; pending: number; confirmed: number; rejected: number; reversed: number; tasks: number }> = {};
    offerSnap?.docs.forEach((doc) => {
      const d = doc.data();
      const p = String(d.provider ?? "unknown");
      if (!provMap[p]) provMap[p] = { revUSD: 0, pending: 0, confirmed: 0, rejected: 0, reversed: 0, tasks: 0 };
      const coins = Number(d.coinsCalculated ?? 0);
      if (d.status === "confirmed") {
        provMap[p].revUSD += Number(d.payoutUSD ?? 0);
        provMap[p].confirmed += coins;
        provMap[p].tasks += 1;
      }
      if (d.status === "pending_verification" || d.status === "manual_review_required") provMap[p].pending += coins;
      if (d.status === "rejected") provMap[p].rejected += coins;
      if (d.status === "reversed") provMap[p].reversed += coins;
    });

    const provRows = Object.entries(provMap).map(([name, p]) => [
      new Date().toISOString().split("T")[0], name,
      p.revUSD.toFixed(2), (p.revUSD * usdToPKRRate).toFixed(2),
      p.pending, p.confirmed, p.rejected, p.reversed,
      coinsToPKR(p.confirmed).toFixed(2),
      ((p.revUSD * usdToPKRRate) - coinsToPKR(p.confirmed)).toFixed(2),
      p.tasks,
      p.tasks > 0 ? "Active" : "Inactive",
    ]);
    await clearRows(sheets, spreadsheetId, sid2, 42, 54);
    if (provRows.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${TAB2}!A43`,
        valueInputOption: "RAW",
        requestBody: { values: provRows },
      });
      await applyAlternatingAndStatus(sheets, spreadsheetId, sid2, 42, provRows, 11, true);
      summary.providerRowsAdded = provRows.length;
    }

    // Transaction Summary (row 58+)
    const txRows: (string | number)[][] = [];
    txSnap?.docs.forEach((doc) => {
      const d = doc.data();
      txRows.push([
        d.createdAt?.toDate?.()?.toISOString?.()?.split("T")?.[0] ?? "",
        doc.id,
        d.deviceId ?? "",
        "",
        d.type ?? "",
        d.source ?? "",
        d.source ?? "",
        d.coinsChange ?? 0,
        d.metadata?.energyAwarded ?? 0,
        d.pkrChange ?? 0,
        d.status ?? "",
        "",
      ]);
    });
    await clearRows(sheets, spreadsheetId, sid2, 58, 500);
    if (txRows.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${TAB2}!A59`,
        valueInputOption: "RAW",
        requestBody: { values: txRows },
      });
      await applyAlternatingAndStatus(sheets, spreadsheetId, sid2, 58, txRows, 10, true);
      summary.txRowsAdded = txRows.length;
    }
  } catch (err) {
    logger.error({ err }, "Tab2 sync failed");
  }

  return summary;
}

// ==================== UTILITY FUNCTIONS ====================
async function clearRows(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetId: number,
  startRow: number,
  endRow: number,
): Promise<void> {
  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          repeatCell: {
            range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: 0, endColumnIndex: 22 },
            cell: { userEnteredValue: null },
            fields: "userEnteredValue",
          },
        }],
      },
    });
  } catch (err) {
    logger.warn({ err }, "Unable to clear fixed sheet value range");
  }
}

async function applyAlternatingAndStatus(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetId: number,
  startRow: number,
  rows: (string | number)[][],
  statusColIdx: number,
  hasStatus: boolean,
): Promise<void> {
  const requests: sheets_v4.Schema$Request[] = [];

  for (let i = 0; i < rows.length; i++) {
    // Alternating row background
    if (i % 2 === 1) {
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: startRow + i, endRowIndex: startRow + i + 1, startColumnIndex: 0, endColumnIndex: 22 },
          cell: { userEnteredFormat: { backgroundColor: ALT_ROW_BG } },
          fields: "userEnteredFormat.backgroundColor",
        },
      });
    }

    // Body text white
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: startRow + i, endRowIndex: startRow + i + 1, startColumnIndex: 0, endColumnIndex: 22 },
        cell: { userEnteredFormat: { textFormat: { foregroundColor: WHITE_TEXT, fontSize: 10 }, horizontalAlignment: "LEFT" } },
        fields: "userEnteredFormat(textFormat,horizontalAlignment)",
      },
    });

    // Status badge
    if (hasStatus && statusColIdx < rows[i].length) {
      const status = String(rows[i][statusColIdx] ?? "");
      const bg = badgeColor(status);
      const fg = badgeFg(status);
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: startRow + i, endRowIndex: startRow + i + 1, startColumnIndex: statusColIdx, endColumnIndex: statusColIdx + 1 },
          cell: {
            userEnteredFormat: {
              backgroundColor: bg,
              textFormat: { foregroundColor: fg, bold: true, fontSize: 10 },
              horizontalAlignment: "CENTER",
            },
          },
          fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
        },
      });
    }
  }

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  }
}
