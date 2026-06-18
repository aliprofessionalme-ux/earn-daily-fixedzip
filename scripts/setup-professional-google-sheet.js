import { google } from "googleapis";

const SHEET_ID = process.env.SHEET_ID || process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
const CREATE_BACKUP = process.env.SKIP_BACKUP !== "true";
const BACKUP_ONLY = process.env.BACKUP_ONLY === "true";
const PROTECT_RAW_TABS = process.env.PROTECT_RAW_TABS !== "false";

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive",
];

const COLORS = {
  black: { red: 0.035, green: 0.039, blue: 0.047 },
  charcoal: { red: 0.075, green: 0.082, blue: 0.098 },
  card: { red: 0.105, green: 0.113, blue: 0.137 },
  gold: { red: 0.973, green: 0.753, blue: 0.098 },
  yellow: { red: 1, green: 0.86, blue: 0.22 },
  white: { red: 0.94, green: 0.94, blue: 0.94 },
  gray: { red: 0.72, green: 0.75, blue: 0.80 },
  border: { red: 0.82, green: 0.82, blue: 0.82 },
  green: { red: 0.12, green: 0.68, blue: 0.36 },
  red: { red: 0.86, green: 0.20, blue: 0.20 },
  orange: { red: 0.95, green: 0.50, blue: 0.12 },
};

const RAW_TABS = [
  {
    name: "RAW_Users",
    headers: ["User ID", "Name", "Email", "Phone", "Signup Date", "Last Active", "Status", "Country", "Device", "Referral Code", "Referred By", "Risk Status", "Notes"],
  },
  {
    name: "RAW_Wallets",
    headers: ["User ID", "Pending Coins", "Confirmed Coins", "Locked Coins", "Lifetime Coins", "Withdrawn Coins", "Available Balance", "Last Wallet Update", "Wallet Status"],
  },
  {
    name: "RAW_Transactions",
    headers: ["Transaction ID", "User ID", "Type", "Source", "Amount Coins", "Amount Currency", "Status", "Created At", "Confirmed At", "Provider", "Reference ID", "Notes"],
  },
  {
    name: "RAW_Withdrawals",
    headers: ["Withdrawal ID", "User ID", "User Name", "Email", "Phone", "Method", "Account Details", "Requested Coins", "Payable Amount", "Currency", "Status", "Requested At", "Approved At", "Rejected At", "Paid At", "Admin Notes", "Risk Flag"],
  },
  {
    name: "RAW_Task_Postbacks",
    headers: ["Postback ID", "Task ID", "User ID", "Provider", "Public Label", "Category", "Offer Name", "Reward Coins", "Revenue", "Status", "Started At", "Completed At", "Verified At", "Transaction ID", "Notes"],
  },
  {
    name: "RAW_Advertiser_Revenue",
    headers: ["Revenue ID", "Date", "Provider", "Task ID", "User ID", "Revenue Amount", "Currency", "Status", "Reference ID", "Notes"],
  },
  {
    name: "RAW_Expenses",
    headers: ["Expense ID", "Date", "Expense Type", "Provider", "Amount", "Currency", "Billing Period", "Status", "Notes"],
  },
  {
    name: "RAW_Support",
    headers: ["Ticket ID", "User ID", "User Name", "Email", "Subject", "Message", "Status", "Priority", "Created At", "Last Reply At", "Admin Reply", "Resolution Notes"],
  },
  {
    name: "RAW_Admin_Logs",
    headers: ["Log ID", "Admin", "Action", "Target Type", "Target ID", "Old Value", "New Value", "Timestamp", "Notes"],
  },
];

const REPORT_TABS = [
  "01_Dashboard",
  "02_User_Lookup",
  "03_Finance_Summary",
  "04_Monthly_PnL",
  "05_Yearly_Summary",
  "06_User_Analytics",
  "07_Withdrawals_Pay_Queue",
  "08_Advertiser_Performance",
  "09_Tasks_Offers_Report",
  "10_Expenses",
  "11_Support_Tickets",
  "12_Admin_Audit",
  "13_Settings",
];

const ALL_TABS = [...REPORT_TABS, ...RAW_TABS.map((tab) => tab.name)];

function q(sheetName) {
  return `'${sheetName.replace(/'/g, "''")}'`;
}

const S = Object.fromEntries(ALL_TABS.map((name) => [name.replace(/[^A-Za-z0-9]/g, "_"), q(name)]));

function columnLetter(index) {
  let text = "";
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    text = String.fromCharCode(65 + rem) + text;
    n = Math.floor((n - 1) / 26);
  }
  return text;
}

function isDateHeader(header) {
  return /date|time|created|updated|active|signup|requested|approved|rejected|paid|completed|verified|timestamp|reply/i.test(header);
}

function isAmountHeader(header) {
  return /amount|coins|coin|revenue|expense|profit|payout|balance|currency|value|margin|rate|users|tasks|withdrawals|tickets|risk/i.test(header);
}

function isPercentHeader(header) {
  return /%|rate|margin/i.test(header);
}

function widthFor(header) {
  if (/notes|message|details|reply|resolution|proof|reference/i.test(header)) return 240;
  if (/id|code|transaction|postback|withdrawal/i.test(header)) return 170;
  if (isDateHeader(header)) return 150;
  if (isAmountHeader(header)) return 130;
  if (/status|priority|type|provider|category|currency/i.test(header)) return 135;
  return 150;
}

function cellFormat({ bg = COLORS.charcoal, fg = COLORS.white, bold = false, size = 10, align = "LEFT", wrap = false } = {}) {
  return {
    backgroundColor: bg,
    horizontalAlignment: align,
    verticalAlignment: "MIDDLE",
    wrapStrategy: wrap ? "WRAP" : "CLIP",
    textFormat: { foregroundColor: fg, bold, fontSize: size, fontFamily: "Arial" },
  };
}

async function getAuth() {
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = (process.env.GOOGLE_SHEETS_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  if (clientEmail && privateKey) {
    return new google.auth.JWT({ email: clientEmail, key: privateKey, scopes: SCOPES });
  }

  return new google.auth.GoogleAuth({ scopes: SCOPES });
}

async function createBackupCopy(drive, spreadsheetId) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupName = `Earn Daily Workbook Backup ${timestamp}`;
  const copy = await drive.files.copy({
    fileId: spreadsheetId,
    requestBody: { name: backupName },
    fields: "id,name,webViewLink",
  });
  console.log(`Backup created: ${copy.data.name} (${copy.data.id})`);
  if (copy.data.webViewLink) console.log(copy.data.webViewLink);
  return copy.data;
}

async function getMetadata(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(sheetId,title,index,gridProperties,rowCount,columnCount),protectedRanges(protectedRangeId,description))",
  });
  return meta.data.sheets || [];
}

function sheetMap(sheetMeta) {
  return new Map(sheetMeta.map((sheet) => [sheet.properties?.title, sheet]));
}

async function ensureTabs(sheets, spreadsheetId) {
  const existing = sheetMap(await getMetadata(sheets, spreadsheetId));
  const requests = [];

  ALL_TABS.forEach((title, index) => {
    if (!existing.has(title)) {
      requests.push({
        addSheet: {
          properties: {
            title,
            index,
            tabColor: title.startsWith("RAW_") ? COLORS.gray : COLORS.gold,
            gridProperties: { rowCount: 1200, columnCount: 32, frozenRowCount: 1 },
          },
        },
      });
    }
  });

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
    console.log(`Created ${requests.length} missing tabs.`);
  }
}

async function ensureGridSizes(sheets, spreadsheetId, metaByTitle) {
  const requests = [];
  for (const title of ALL_TABS) {
    const sheet = metaByTitle.get(title);
    if (!sheet) continue;
    const props = sheet.properties;
    const rowCount = props?.gridProperties?.rowCount || 0;
    const columnCount = props?.gridProperties?.columnCount || 0;
    const requiredCols = Math.max(32, headersForTab(title).length + 4);
    const requiredRows = title === "01_Dashboard" ? 120 : 1200;
    if (rowCount < requiredRows || columnCount < requiredCols) {
      requests.push({
        updateSheetProperties: {
          properties: {
            sheetId: props.sheetId,
            gridProperties: {
              rowCount: Math.max(rowCount, requiredRows),
              columnCount: Math.max(columnCount, requiredCols),
              frozenRowCount: 1,
            },
          },
          fields: "gridProperties(rowCount,columnCount,frozenRowCount)",
        },
      });
    }
  }
  if (requests.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
}

function headersForTab(title) {
  const raw = RAW_TABS.find((tab) => tab.name === title);
  if (raw) return raw.headers;

  const reportHeaders = {
    "04_Monthly_PnL": ["Year", "Month", "Month Number", "New Users", "Active Users", "Task Starts", "Task Completions", "Approved Tasks", "Rejected Tasks", "Pending Tasks", "Advertiser Revenue", "Coins Given to Users", "User Payout Amount", "Pending Payout Amount", "Firebase Expense", "Replit Expense", "Other Expenses", "Gross Profit", "Net Profit", "Profit Margin %", "Withdrawal Requests", "Approved Withdrawals", "Rejected Withdrawals", "Notes"],
    "05_Yearly_Summary": ["Year", "Total Users", "New Users", "Active Users", "Total Advertiser Revenue", "Total User Payout", "Total Firebase Expense", "Total Replit Expense", "Total Other Expenses", "Gross Profit", "Net Profit", "Profit Margin %", "Total Tasks Completed", "Total Withdrawals", "Total Approved Withdrawals", "Total Rejected Withdrawals", "Best Month", "Worst Month", "Notes"],
    "06_User_Analytics": ["Date", "Total Users", "New Users", "Active Users", "Returning Users", "Dormant Users", "Users With Pending Coins", "Users With Confirmed Coins", "Users Requested Withdrawal", "Average Coins Per User", "Average Revenue Per User", "Top Earning User", "Top Active User", "Suspicious Users", "Retention Notes"],
    "07_Withdrawals_Pay_Queue": ["Withdrawal ID", "User ID", "User Name", "Email", "Phone", "Payment Method", "Account Details", "Requested Coins", "Payable Amount", "Currency", "Status", "Requested At", "Approved At", "Rejected At", "Paid At", "Admin Notes", "Risk Flag", "Payment Priority", "Payment Batch", "Proof/Reference"],
    "08_Advertiser_Performance": ["Advertiser / Provider", "Public Category", "Clicks", "Task Starts", "Completed Tasks", "Approved Tasks", "Rejected Tasks", "Pending Tasks", "Revenue Received", "Coins Given to Users", "Estimated User Payout", "Gross Profit", "Conversion Rate", "Approval Rate", "Rejection Rate", "Last Postback", "Notes"],
    "09_Tasks_Offers_Report": ["Task ID", "User ID", "User Name", "Internal Provider", "Public Label", "Category", "Offer Name", "Reward Coins", "Revenue", "Status", "Started At", "Completed At", "Verified At", "Postback ID", "Transaction ID", "Notes"],
    "10_Expenses": ["Expense ID", "Date", "Expense Type", "Provider", "Amount", "Currency", "Billing Period", "Payment Status", "Notes"],
    "11_Support_Tickets": ["Ticket ID", "User ID", "User Name", "Email", "Subject", "Message", "Status", "Priority", "Created At", "Last Reply At", "Admin Reply", "Resolution Notes"],
    "12_Admin_Audit": ["Log ID", "Admin", "Action", "Target Type", "Target ID", "Old Value", "New Value", "Timestamp", "Notes"],
    "13_Settings": ["Setting Key", "Setting Value", "Description", "Last Updated"],
  };
  return reportHeaders[title] || ["Metric", "Value", "Notes"];
}

async function writeValues(sheets, spreadsheetId, tabName, values, start = "A1") {
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${q(tabName)}!${start}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

function dashboardRows() {
  const revenue = `IFERROR(SUM(${S.RAW_Advertiser_Revenue}!F2:F),0)`;
  const userPayout = `IFERROR(SUMIF(${S.RAW_Withdrawals}!K2:K,"Paid",${S.RAW_Withdrawals}!I2:I),0)`;
  const firebaseExpense = `IFERROR(SUMIF(${S.RAW_Expenses}!C2:C,"Firebase",${S.RAW_Expenses}!E2:E),0)`;
  const replitExpense = `IFERROR(SUMIF(${S.RAW_Expenses}!C2:C,"Replit",${S.RAW_Expenses}!E2:E),0)`;
  const otherExpense = `IFERROR(SUM(SUMIFS(${S.RAW_Expenses}!E2:E,${S.RAW_Expenses}!C2:C,{"Other Tools","Marketing","Manual Adjustment","Miscellaneous","Other"})),0)`;
  const grossProfit = `${revenue}-${userPayout}`;
  const netProfit = `${revenue}-${userPayout}-${firebaseExpense}-${replitExpense}-${otherExpense}`;

  const card = (label, formula, note = "") => [label, formula, note, ""];
  return [
    ["Earn Daily Executive Dashboard", "", "Last Updated Time", "=NOW()", "", "All reports read from RAW tabs only."],
    ["Business Overview", "", "", "", "", ""],
    card("Total Users", `=IFERROR(COUNTA(FILTER(${S.RAW_Users}!A2:A,${S.RAW_Users}!A2:A<>"")),0)`),
    card("Active Users", `=IFERROR(COUNTIF(${S.RAW_Users}!G2:G,"Active"),0)`),
    card("New Users Today", `=COUNTIFS(${S.RAW_Users}!E2:E,">="&TODAY(),${S.RAW_Users}!E2:E,"<"&TODAY()+1)`),
    card("New Users This Month", `=COUNTIFS(${S.RAW_Users}!E2:E,">="&EOMONTH(TODAY(),-1)+1,${S.RAW_Users}!E2:E,"<"&EOMONTH(TODAY(),0)+1)`),
    ["Wallet Overview", "", "", "", "", ""],
    card("Total Pending Coins", `=IFERROR(SUM(${S.RAW_Wallets}!B2:B),0)`),
    card("Total Confirmed Coins", `=IFERROR(SUM(${S.RAW_Wallets}!C2:C),0)`),
    card("Total Coins Given", `=IFERROR(SUM(${S.RAW_Task_Postbacks}!H2:H),0)`),
    card("High Risk Users", `=COUNTIF(${S.RAW_Users}!L2:L,"*Risk*")`),
    ["Withdrawal Overview", "", "", "", "", ""],
    card("Total Withdrawals Requested", `=IFERROR(COUNTA(FILTER(${S.RAW_Withdrawals}!A2:A,${S.RAW_Withdrawals}!A2:A<>"")),0)`),
    card("Pending Withdrawals", `=COUNTIF(${S.RAW_Withdrawals}!K2:K,"Pending")`),
    card("Approved Withdrawals", `=COUNTIF(${S.RAW_Withdrawals}!K2:K,"Approved")`),
    card("Rejected Withdrawals", `=COUNTIF(${S.RAW_Withdrawals}!K2:K,"Rejected")`),
    card("Total User Payout", `=${userPayout}`),
    ["Revenue Overview", "", "", "", "", ""],
    card("Total Advertiser Revenue", `=${revenue}`),
    card("Today Revenue", `=SUMIFS(${S.RAW_Advertiser_Revenue}!F2:F,${S.RAW_Advertiser_Revenue}!B2:B,">="&TODAY(),${S.RAW_Advertiser_Revenue}!B2:B,"<"&TODAY()+1)`),
    card("This Month Revenue", `=SUMIFS(${S.RAW_Advertiser_Revenue}!F2:F,${S.RAW_Advertiser_Revenue}!B2:B,">="&EOMONTH(TODAY(),-1)+1,${S.RAW_Advertiser_Revenue}!B2:B,"<"&EOMONTH(TODAY(),0)+1)`),
    card("This Year Revenue", `=SUMIFS(${S.RAW_Advertiser_Revenue}!F2:F,${S.RAW_Advertiser_Revenue}!B2:B,">="&DATE(YEAR(TODAY()),1,1),${S.RAW_Advertiser_Revenue}!B2:B,"<"&DATE(YEAR(TODAY())+1,1,1))`),
    ["Expense Overview", "", "", "", "", ""],
    card("Firebase Expense", `=${firebaseExpense}`),
    card("Replit Expense", `=${replitExpense}`),
    card("Other Expenses", `=${otherExpense}`),
    card("Gross Profit", `=${grossProfit}`),
    card("Net Profit", `=${netProfit}`),
    card("Profit Margin %", `=IFERROR((${netProfit})/(${revenue}),0)`),
    ["Advertiser Performance Summary", "", "", "", "", ""],
    card("Conversion Rate", `=IFERROR(COUNTIF(${S.RAW_Task_Postbacks}!J2:J,"Completed")/COUNTA(FILTER(${S.RAW_Task_Postbacks}!A2:A,${S.RAW_Task_Postbacks}!A2:A<>"")),0)`),
    card("Approval Rate", `=IFERROR(COUNTIF(${S.RAW_Task_Postbacks}!J2:J,"Approved")/COUNTA(FILTER(${S.RAW_Task_Postbacks}!A2:A,${S.RAW_Task_Postbacks}!A2:A<>"")),0)`),
    card("Rejection Rate", `=IFERROR(COUNTIF(${S.RAW_Task_Postbacks}!J2:J,"Rejected")/COUNTA(FILTER(${S.RAW_Task_Postbacks}!A2:A,${S.RAW_Task_Postbacks}!A2:A<>"")),0)`),
    ["Risk/Fraud Alerts", "", "", "", "", ""],
    card("High Risk Users", `=COUNTIF(${S.RAW_Users}!L2:L,"*Risk*")`),
    card("Needs Review Withdrawals", `=COUNTIF(${S.RAW_Withdrawals}!Q2:Q,"*Risk*")`),
    ["Support Overview", "", "", "", "", ""],
    card("Open Support Tickets", `=COUNTIF(${S.RAW_Support}!G2:G,"Open")`),
    card("Pending Support Tickets", `=COUNTIF(${S.RAW_Support}!G2:G,"Pending")`),
    ["Notes", "RAW tabs are the only source tabs. Reporting tabs read from RAW tabs using formulas. Do not manually edit RAW data unless you know the Firebase/Replit mapping.", "", "", "", ""],
  ];
}

function userLookupRows() {
  const userIdFormula = `=IFERROR(INDEX(FILTER(${S.RAW_Users}!A2:A,(${S.RAW_Users}!A2:A=$B$2)+(${S.RAW_Users}!C2:C=$B$2)+(${S.RAW_Users}!D2:D=$B$2)),1),"")`;
  const xUser = (col) => `=IF($B$4="","",IFERROR(XLOOKUP($B$4,${S.RAW_Users}!A:A,${S.RAW_Users}!${col}:${col},""),""))`;
  const xWallet = (col) => `=IF($B$4="","",IFERROR(XLOOKUP($B$4,${S.RAW_Wallets}!A:A,${S.RAW_Wallets}!${col}:${col},0),0))`;
  return [
    ["User Lookup", "Search by User ID / Email / Phone", "", ""],
    ["Search Input", "", "Enter a value in B2", ""],
    ["", "", "", ""],
    ["User ID", userIdFormula, "", ""],
    ["Name", xUser("B"), "Email", xUser("C")],
    ["Phone", xUser("D"), "Signup Date", xUser("E")],
    ["Last Active", xUser("F"), "Status", xUser("G")],
    ["Country", xUser("H"), "Device", xUser("I")],
    ["Referral Code", xUser("J"), "Referred By", xUser("K")],
    ["Energy Balance", "Connect from RAW_Transactions or app export if needed", "Pending Coins", xWallet("B")],
    ["Confirmed Coins", xWallet("C"), "Lifetime Coins", xWallet("E")],
    ["Total Earned", xWallet("E"), "Total Withdrawn", xWallet("F")],
    ["Available Balance", xWallet("G"), "Pending Withdrawal Amount", `=IF($B$4="","",SUMIFS(${S.RAW_Withdrawals}!I:I,${S.RAW_Withdrawals}!B:B,$B$4,${S.RAW_Withdrawals}!K:K,"Pending"))`],
    ["Approved Withdrawal Amount", `=IF($B$4="","",SUMIFS(${S.RAW_Withdrawals}!I:I,${S.RAW_Withdrawals}!B:B,$B$4,${S.RAW_Withdrawals}!K:K,"Approved"))`, "Rejected Withdrawal Amount", `=IF($B$4="","",SUMIFS(${S.RAW_Withdrawals}!I:I,${S.RAW_Withdrawals}!B:B,$B$4,${S.RAW_Withdrawals}!K:K,"Rejected"))`],
    ["Risk/Fraud Status", xUser("L"), "Admin Notes", xUser("M")],
    ["", "", "", ""],
    ["User Transactions", "", "", ""],
    ["Transaction ID", "User ID", "Type", "Source", "Amount Coins", "Amount Currency", "Status", "Created At", "Confirmed At", "Provider", "Reference ID", "Notes"],
    [`=IFERROR(TAKE(SORT(FILTER(${S.RAW_Transactions}!A2:L,${S.RAW_Transactions}!B2:B=$B$4),8,FALSE),25),"No transaction records")`],
    ...Array.from({ length: 28 }, () => [""]),
    ["User Task Completions", "", "", ""],
    ["Postback ID", "Task ID", "User ID", "Provider", "Public Label", "Category", "Offer Name", "Reward Coins", "Revenue", "Status", "Started At", "Completed At", "Verified At", "Transaction ID", "Notes"],
    [`=IFERROR(TAKE(SORT(FILTER(${S.RAW_Task_Postbacks}!A2:O,${S.RAW_Task_Postbacks}!C2:C=$B$4),13,FALSE),25),"No task records")`],
    ...Array.from({ length: 28 }, () => [""]),
    ["User Withdrawals", "", "", ""],
    ["Withdrawal ID", "User ID", "User Name", "Email", "Phone", "Method", "Account Details", "Requested Coins", "Payable Amount", "Currency", "Status", "Requested At", "Approved At", "Rejected At", "Paid At", "Admin Notes", "Risk Flag"],
    [`=IFERROR(TAKE(SORT(FILTER(${S.RAW_Withdrawals}!A2:Q,${S.RAW_Withdrawals}!B2:B=$B$4),12,FALSE),25),"No withdrawal records")`],
    ...Array.from({ length: 28 }, () => [""]),
    ["User Support Tickets", "", "", ""],
    ["Ticket ID", "User ID", "User Name", "Email", "Subject", "Message", "Status", "Priority", "Created At", "Last Reply At", "Admin Reply", "Resolution Notes"],
    [`=IFERROR(TAKE(SORT(FILTER(${S.RAW_Support}!A2:L,${S.RAW_Support}!B2:B=$B$4),9,FALSE),25),"No support records")`],
  ];
}

function financeSummaryRows() {
  const revenue = `IFERROR(SUM(${S.RAW_Advertiser_Revenue}!F2:F),0)`;
  const payout = `IFERROR(SUMIF(${S.RAW_Withdrawals}!K2:K,"Paid",${S.RAW_Withdrawals}!I2:I),0)`;
  const pendingPayout = `IFERROR(SUMIF(${S.RAW_Withdrawals}!K2:K,"Pending",${S.RAW_Withdrawals}!I2:I),0)`;
  const approvedPayout = `IFERROR(SUMIF(${S.RAW_Withdrawals}!K2:K,"Approved",${S.RAW_Withdrawals}!I2:I),0)`;
  const rejectedValue = `IFERROR(SUMIF(${S.RAW_Withdrawals}!K2:K,"Rejected",${S.RAW_Withdrawals}!I2:I),0)`;
  const firebaseExpense = `IFERROR(SUMIF(${S.RAW_Expenses}!C2:C,"Firebase",${S.RAW_Expenses}!E2:E),0)`;
  const replitExpense = `IFERROR(SUMIF(${S.RAW_Expenses}!C2:C,"Replit",${S.RAW_Expenses}!E2:E),0)`;
  const otherExpense = `IFERROR(SUM(SUMIFS(${S.RAW_Expenses}!E2:E,${S.RAW_Expenses}!C2:C,{"Other Tools","Marketing","Manual Adjustment","Miscellaneous","Other"})),0)`;
  const marketingExpense = `IFERROR(SUMIF(${S.RAW_Expenses}!C2:C,"Marketing",${S.RAW_Expenses}!E2:E),0)`;
  const gross = `${revenue}-${payout}`;
  const net = `${revenue}-${payout}-${firebaseExpense}-${replitExpense}-${otherExpense}`;
  return [
    ["Finance Summary", "Value", "Formula / Notes"],
    ["Revenue", "", ""],
    ["Total Advertiser Revenue", `=${revenue}`, "Sum RAW_Advertiser_Revenue revenue amount"],
    ["Revenue Today", `=SUMIFS(${S.RAW_Advertiser_Revenue}!F2:F,${S.RAW_Advertiser_Revenue}!B2:B,">="&TODAY(),${S.RAW_Advertiser_Revenue}!B2:B,"<"&TODAY()+1)`, ""],
    ["Revenue This Month", `=SUMIFS(${S.RAW_Advertiser_Revenue}!F2:F,${S.RAW_Advertiser_Revenue}!B2:B,">="&EOMONTH(TODAY(),-1)+1,${S.RAW_Advertiser_Revenue}!B2:B,"<"&EOMONTH(TODAY(),0)+1)`, ""],
    ["Revenue This Year", `=SUMIFS(${S.RAW_Advertiser_Revenue}!F2:F,${S.RAW_Advertiser_Revenue}!B2:B,">="&DATE(YEAR(TODAY()),1,1),${S.RAW_Advertiser_Revenue}!B2:B,"<"&DATE(YEAR(TODAY())+1,1,1))`, ""],
    ["Payouts", "", ""],
    ["Total User Payout", `=${payout}`, "Paid withdrawals only"],
    ["Pending User Payout", `=${pendingPayout}`, ""],
    ["Approved User Payout", `=${approvedPayout}`, ""],
    ["Rejected Withdrawal Value", `=${rejectedValue}`, ""],
    ["Expenses", "", ""],
    ["Firebase Expense", `=${firebaseExpense}`, ""],
    ["Replit Expense", `=${replitExpense}`, ""],
    ["Other Expenses", `=${otherExpense}`, ""],
    ["Marketing Expense", `=${marketingExpense}`, ""],
    ["Profit", "", ""],
    ["Gross Profit", `=${gross}`, "Advertiser Revenue - User Payout"],
    ["Net Profit", `=${net}`, "Advertiser Revenue - User Payout - Firebase - Replit - Other"],
    ["Profit Margin %", `=IFERROR((${net})/(${revenue}),0)`, "Net Profit / Advertiser Revenue"],
    ["Pending Liabilities", "", ""],
    ["Pending Coins Liability", `=IFERROR(SUM(${S.RAW_Wallets}!B2:B),0)`, "Pending coins not yet paid"],
    ["Confirmed Coins Liability", `=IFERROR(SUM(${S.RAW_Wallets}!C2:C),0)`, "Confirmed coins still in user wallets"],
    ["Average Revenue Per User", `=IFERROR((${revenue})/COUNTA(FILTER(${S.RAW_Users}!A2:A,${S.RAW_Users}!A2:A<>"")),0)`, ""],
    ["Average Payout Per User", `=IFERROR((${payout})/COUNTA(FILTER(${S.RAW_Users}!A2:A,${S.RAW_Users}!A2:A<>"")),0)`, ""],
  ];
}

function monthlyPnlRows() {
  const headers = headersForTab("04_Monthly_PnL");
  const rows = [headers];
  for (let i = 0; i < 36; i += 1) {
    const row = i + 2;
    const monthStart = `DATE($A${row},$C${row},1)`;
    const monthEnd = `EOMONTH(${monthStart},0)+1`;
    rows.push([
      `=YEAR(EDATE(DATE(YEAR(TODAY())-1,1,1),ROW()-2))`,
      `=TEXT(EDATE(DATE(YEAR(TODAY())-1,1,1),ROW()-2),"mmmm")`,
      `=MONTH(EDATE(DATE(YEAR(TODAY())-1,1,1),ROW()-2))`,
      `=COUNTIFS(${S.RAW_Users}!E:E,">="&${monthStart},${S.RAW_Users}!E:E,"<"&${monthEnd})`,
      `=COUNTIFS(${S.RAW_Users}!F:F,">="&${monthStart},${S.RAW_Users}!F:F,"<"&${monthEnd})`,
      `=COUNTIFS(${S.RAW_Task_Postbacks}!K:K,">="&${monthStart},${S.RAW_Task_Postbacks}!K:K,"<"&${monthEnd})`,
      `=COUNTIFS(${S.RAW_Task_Postbacks}!L:L,">="&${monthStart},${S.RAW_Task_Postbacks}!L:L,"<"&${monthEnd})`,
      `=COUNTIFS(${S.RAW_Task_Postbacks}!J:J,"Approved",${S.RAW_Task_Postbacks}!M:M,">="&${monthStart},${S.RAW_Task_Postbacks}!M:M,"<"&${monthEnd})`,
      `=COUNTIFS(${S.RAW_Task_Postbacks}!J:J,"Rejected",${S.RAW_Task_Postbacks}!M:M,">="&${monthStart},${S.RAW_Task_Postbacks}!M:M,"<"&${monthEnd})`,
      `=COUNTIFS(${S.RAW_Task_Postbacks}!J:J,"Pending Verification",${S.RAW_Task_Postbacks}!K:K,">="&${monthStart},${S.RAW_Task_Postbacks}!K:K,"<"&${monthEnd})`,
      `=SUMIFS(${S.RAW_Advertiser_Revenue}!F:F,${S.RAW_Advertiser_Revenue}!B:B,">="&${monthStart},${S.RAW_Advertiser_Revenue}!B:B,"<"&${monthEnd})`,
      `=SUMIFS(${S.RAW_Task_Postbacks}!H:H,${S.RAW_Task_Postbacks}!L:L,">="&${monthStart},${S.RAW_Task_Postbacks}!L:L,"<"&${monthEnd})`,
      `=SUMIFS(${S.RAW_Withdrawals}!I:I,${S.RAW_Withdrawals}!K:K,"Paid",${S.RAW_Withdrawals}!O:O,">="&${monthStart},${S.RAW_Withdrawals}!O:O,"<"&${monthEnd})`,
      `=SUMIFS(${S.RAW_Withdrawals}!I:I,${S.RAW_Withdrawals}!K:K,"Pending",${S.RAW_Withdrawals}!L:L,">="&${monthStart},${S.RAW_Withdrawals}!L:L,"<"&${monthEnd})`,
      `=SUMIFS(${S.RAW_Expenses}!E:E,${S.RAW_Expenses}!C:C,"Firebase",${S.RAW_Expenses}!B:B,">="&${monthStart},${S.RAW_Expenses}!B:B,"<"&${monthEnd})`,
      `=SUMIFS(${S.RAW_Expenses}!E:E,${S.RAW_Expenses}!C:C,"Replit",${S.RAW_Expenses}!B:B,">="&${monthStart},${S.RAW_Expenses}!B:B,"<"&${monthEnd})`,
      `=SUM(SUMIFS(${S.RAW_Expenses}!E:E,${S.RAW_Expenses}!C:C,{"Other Tools","Marketing","Manual Adjustment","Miscellaneous","Other"},${S.RAW_Expenses}!B:B,">="&${monthStart},${S.RAW_Expenses}!B:B,"<"&${monthEnd}))`,
      `=K${row}-M${row}`,
      `=K${row}-M${row}-O${row}-P${row}-Q${row}`,
      `=IFERROR(S${row}/K${row},0)`,
      `=COUNTIFS(${S.RAW_Withdrawals}!L:L,">="&${monthStart},${S.RAW_Withdrawals}!L:L,"<"&${monthEnd})`,
      `=COUNTIFS(${S.RAW_Withdrawals}!K:K,"Approved",${S.RAW_Withdrawals}!M:M,">="&${monthStart},${S.RAW_Withdrawals}!M:M,"<"&${monthEnd})+COUNTIFS(${S.RAW_Withdrawals}!K:K,"Paid",${S.RAW_Withdrawals}!O:O,">="&${monthStart},${S.RAW_Withdrawals}!O:O,"<"&${monthEnd})`,
      `=COUNTIFS(${S.RAW_Withdrawals}!K:K,"Rejected",${S.RAW_Withdrawals}!N:N,">="&${monthStart},${S.RAW_Withdrawals}!N:N,"<"&${monthEnd})`,
      "",
    ]);
  }
  return rows;
}

function yearlySummaryRows() {
  const headers = headersForTab("05_Yearly_Summary");
  const rows = [headers];
  for (let i = 0; i < 8; i += 1) {
    const row = i + 2;
    const start = `DATE($A${row},1,1)`;
    const end = `DATE($A${row}+1,1,1)`;
    rows.push([
      `=YEAR(TODAY())-5+ROW()-2`,
      `=COUNTIFS(${S.RAW_Users}!E:E,"<"&${end})`,
      `=COUNTIFS(${S.RAW_Users}!E:E,">="&${start},${S.RAW_Users}!E:E,"<"&${end})`,
      `=COUNTIFS(${S.RAW_Users}!F:F,">="&${start},${S.RAW_Users}!F:F,"<"&${end})`,
      `=SUMIFS(${S.RAW_Advertiser_Revenue}!F:F,${S.RAW_Advertiser_Revenue}!B:B,">="&${start},${S.RAW_Advertiser_Revenue}!B:B,"<"&${end})`,
      `=SUMIFS(${S.RAW_Withdrawals}!I:I,${S.RAW_Withdrawals}!K:K,"Paid",${S.RAW_Withdrawals}!O:O,">="&${start},${S.RAW_Withdrawals}!O:O,"<"&${end})`,
      `=SUMIFS(${S.RAW_Expenses}!E:E,${S.RAW_Expenses}!C:C,"Firebase",${S.RAW_Expenses}!B:B,">="&${start},${S.RAW_Expenses}!B:B,"<"&${end})`,
      `=SUMIFS(${S.RAW_Expenses}!E:E,${S.RAW_Expenses}!C:C,"Replit",${S.RAW_Expenses}!B:B,">="&${start},${S.RAW_Expenses}!B:B,"<"&${end})`,
      `=SUM(SUMIFS(${S.RAW_Expenses}!E:E,${S.RAW_Expenses}!C:C,{"Other Tools","Marketing","Manual Adjustment","Miscellaneous","Other"},${S.RAW_Expenses}!B:B,">="&${start},${S.RAW_Expenses}!B:B,"<"&${end}))`,
      `=E${row}-F${row}`,
      `=E${row}-F${row}-G${row}-H${row}-I${row}`,
      `=IFERROR(K${row}/E${row},0)`,
      `=COUNTIFS(${S.RAW_Task_Postbacks}!J:J,"Completed",${S.RAW_Task_Postbacks}!L:L,">="&${start},${S.RAW_Task_Postbacks}!L:L,"<"&${end})+COUNTIFS(${S.RAW_Task_Postbacks}!J:J,"Approved",${S.RAW_Task_Postbacks}!M:M,">="&${start},${S.RAW_Task_Postbacks}!M:M,"<"&${end})`,
      `=COUNTIFS(${S.RAW_Withdrawals}!L:L,">="&${start},${S.RAW_Withdrawals}!L:L,"<"&${end})`,
      `=COUNTIFS(${S.RAW_Withdrawals}!K:K,"Approved",${S.RAW_Withdrawals}!M:M,">="&${start},${S.RAW_Withdrawals}!M:M,"<"&${end})+COUNTIFS(${S.RAW_Withdrawals}!K:K,"Paid",${S.RAW_Withdrawals}!O:O,">="&${start},${S.RAW_Withdrawals}!O:O,"<"&${end})`,
      `=COUNTIFS(${S.RAW_Withdrawals}!K:K,"Rejected",${S.RAW_Withdrawals}!N:N,">="&${start},${S.RAW_Withdrawals}!N:N,"<"&${end})`,
      `=IFERROR(INDEX(SORT(FILTER({${S["04_Monthly_PnL"]}!B:B,${S["04_Monthly_PnL"]}!S:S},${S["04_Monthly_PnL"]}!A:A=$A${row}),2,FALSE),1,1),"")`,
      `=IFERROR(INDEX(SORT(FILTER({${S["04_Monthly_PnL"]}!B:B,${S["04_Monthly_PnL"]}!S:S},${S["04_Monthly_PnL"]}!A:A=$A${row}),2,TRUE),1,1),"")`,
      "",
    ]);
  }
  return rows;
}

function userAnalyticsRows() {
  const headers = headersForTab("06_User_Analytics");
  const rows = [headers];
  for (let i = 0; i < 120; i += 1) {
    const row = i + 2;
    rows.push([
      `=TODAY()-ROW()+2`,
      `=COUNTIFS(${S.RAW_Users}!E:E,"<="&$A${row})`,
      `=COUNTIFS(${S.RAW_Users}!E:E,">="&$A${row},${S.RAW_Users}!E:E,"<"&$A${row}+1)`,
      `=COUNTIFS(${S.RAW_Users}!F:F,">="&$A${row},${S.RAW_Users}!F:F,"<"&$A${row}+1)`,
      `=COUNTIFS(${S.RAW_Users}!F:F,">="&$A${row}-7,${S.RAW_Users}!F:F,"<"&$A${row})`,
      `=COUNTIFS(${S.RAW_Users}!F:F,"<"&$A${row}-30)`,
      `=COUNTIF(${S.RAW_Wallets}!B:B,">0")`,
      `=COUNTIF(${S.RAW_Wallets}!C:C,">0")`,
      `=COUNTIFS(${S.RAW_Withdrawals}!L:L,">="&$A${row},${S.RAW_Withdrawals}!L:L,"<"&$A${row}+1)`,
      `=IFERROR(AVERAGE(${S.RAW_Wallets}!E2:E),0)`,
      `=IFERROR(SUMIFS(${S.RAW_Advertiser_Revenue}!F:F,${S.RAW_Advertiser_Revenue}!B:B,">="&$A${row},${S.RAW_Advertiser_Revenue}!B:B,"<"&$A${row}+1)/B${row},0)`,
      `=IFERROR(INDEX(SORT(${S.RAW_Wallets}!A2:E,5,FALSE),1,1),"")`,
      `=IFERROR(INDEX(SORT(${S.RAW_Users}!A2:F,6,FALSE),1,1),"")`,
      `=COUNTIF(${S.RAW_Users}!L:L,"*Risk*")`,
      "",
    ]);
  }
  return rows;
}

function advertiserRows() {
  const providers = [
    ["Monlix", "Game Tasks"],
    ["Tapjoy", "Partner Tasks"],
    ["Unity", "Play Games & Earn"],
    ["ayeT", "App Install Tasks"],
    ["PubScale", "High Reward Offers"],
  ];
  const rows = [headersForTab("08_Advertiser_Performance")];
  providers.forEach(([provider, label], index) => {
    const row = index + 2;
    rows.push([
      provider,
      label,
      "",
      `=COUNTIF(${S.RAW_Task_Postbacks}!D:D,$A${row})`,
      `=COUNTIFS(${S.RAW_Task_Postbacks}!D:D,$A${row},${S.RAW_Task_Postbacks}!J:J,"Completed")+COUNTIFS(${S.RAW_Task_Postbacks}!D:D,$A${row},${S.RAW_Task_Postbacks}!J:J,"Approved")`,
      `=COUNTIFS(${S.RAW_Task_Postbacks}!D:D,$A${row},${S.RAW_Task_Postbacks}!J:J,"Approved")`,
      `=COUNTIFS(${S.RAW_Task_Postbacks}!D:D,$A${row},${S.RAW_Task_Postbacks}!J:J,"Rejected")`,
      `=COUNTIFS(${S.RAW_Task_Postbacks}!D:D,$A${row},${S.RAW_Task_Postbacks}!J:J,"Pending Verification")`,
      `=SUMIF(${S.RAW_Advertiser_Revenue}!C:C,$A${row},${S.RAW_Advertiser_Revenue}!F:F)`,
      `=SUMIF(${S.RAW_Task_Postbacks}!D:D,$A${row},${S.RAW_Task_Postbacks}!H:H)`,
      `=IFERROR(J${row}*VALUE(XLOOKUP("Coin to currency rate",${S["13_Settings"]}!A:A,${S["13_Settings"]}!B:B,0)),0)`,
      `=I${row}-K${row}`,
      `=IFERROR(E${row}/D${row},0)`,
      `=IFERROR(F${row}/E${row},0)`,
      `=IFERROR(G${row}/E${row},0)`,
      `=IFERROR(MAX(FILTER(${S.RAW_Task_Postbacks}!M:M,${S.RAW_Task_Postbacks}!D:D=$A${row})),"")`,
      "",
    ]);
  });
  return rows;
}

function formulaMirrorRows(title, source, queryRange, queryText) {
  return [
    headersForTab(title),
    [`=IFERROR(QUERY(${source}!${queryRange},"${queryText}",0),"No records")`],
  ];
}

function settingsRows() {
  const now = "=NOW()";
  return [
    headersForTab("13_Settings"),
    ["Coin to currency rate", "0.02", "Currency value per coin used for estimated reporting. Update if your payout conversion changes.", now],
    ["Minimum withdrawal", "500", "Minimum withdrawal amount in local currency.", now],
    ["Firebase monthly expense", "0", "Enter monthly Firebase bill here or push via RAW_Expenses.", now],
    ["Replit monthly expense", "0", "Enter monthly Replit bill here or push via RAW_Expenses.", now],
    ["Currency symbol", "PKR", "Default payout currency display.", now],
    ["Dashboard refresh notes", "Reports update when RAW data changes or formulas recalculate.", "Use File > Settings > Calculation if needed.", now],
    ["Admin notes", "", "Internal workbook notes.", now],
  ];
}

async function writeWorkbookContent(sheets, spreadsheetId) {
  for (const tab of RAW_TABS) {
    await writeValues(sheets, spreadsheetId, tab.name, [tab.headers]);
  }

  await writeValues(sheets, spreadsheetId, "01_Dashboard", dashboardRows());
  await writeValues(sheets, spreadsheetId, "02_User_Lookup", userLookupRows());
  await writeValues(sheets, spreadsheetId, "03_Finance_Summary", financeSummaryRows());
  await writeValues(sheets, spreadsheetId, "04_Monthly_PnL", monthlyPnlRows());
  await writeValues(sheets, spreadsheetId, "05_Yearly_Summary", yearlySummaryRows());
  await writeValues(sheets, spreadsheetId, "06_User_Analytics", userAnalyticsRows());
  await writeValues(sheets, spreadsheetId, "07_Withdrawals_Pay_Queue", formulaMirrorRows("07_Withdrawals_Pay_Queue", S.RAW_Withdrawals, "A2:Q", "select A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q where A is not null order by L asc"));
  await writeValues(sheets, spreadsheetId, "08_Advertiser_Performance", advertiserRows());
  await writeValues(sheets, spreadsheetId, "09_Tasks_Offers_Report", formulaMirrorRows("09_Tasks_Offers_Report", S.RAW_Task_Postbacks, "A2:O", "select B,C,'',D,E,F,G,H,I,J,K,L,M,A,N,O where B is not null"));
  await writeValues(sheets, spreadsheetId, "10_Expenses", formulaMirrorRows("10_Expenses", S.RAW_Expenses, "A2:I", "select A,B,C,D,E,F,G,H,I where A is not null order by B desc"));
  await writeValues(sheets, spreadsheetId, "11_Support_Tickets", formulaMirrorRows("11_Support_Tickets", S.RAW_Support, "A2:L", "select A,B,C,D,E,F,G,H,I,J,K,L where A is not null order by I desc"));
  await writeValues(sheets, spreadsheetId, "12_Admin_Audit", formulaMirrorRows("12_Admin_Audit", S.RAW_Admin_Logs, "A2:I", "select A,B,C,D,E,F,G,H,I where A is not null order by H desc"));
  await writeValues(sheets, spreadsheetId, "13_Settings", settingsRows());
}

function conditionalRules(sheetId, headers) {
  const requests = [];
  const statusIndexes = headers
    .map((header, index) => (/status|risk|priority/i.test(header) ? index : -1))
    .filter((index) => index >= 0);

  const rules = [
    ["Pending", COLORS.yellow, { red: 0, green: 0, blue: 0 }],
    ["Pending Verification", COLORS.yellow, { red: 0, green: 0, blue: 0 }],
    ["Needs Review", COLORS.orange, { red: 0, green: 0, blue: 0 }],
    ["Review", COLORS.orange, { red: 0, green: 0, blue: 0 }],
    ["Approved", COLORS.green, COLORS.white],
    ["Paid", COLORS.green, COLORS.white],
    ["Resolved", COLORS.green, COLORS.white],
    ["Completed", COLORS.green, COLORS.white],
    ["Rejected", COLORS.red, COLORS.white],
    ["Failed", COLORS.red, COLORS.white],
    ["High Risk", COLORS.red, COLORS.white],
    ["Open", COLORS.orange, { red: 0, green: 0, blue: 0 }],
    ["Closed", COLORS.gray, { red: 0, green: 0, blue: 0 }],
  ];

  for (const col of statusIndexes) {
    for (const [text, bg, fg] of rules) {
      requests.push({
        addConditionalFormatRule: {
          rule: {
            ranges: [{ sheetId, startRowIndex: 1, endRowIndex: 1200, startColumnIndex: col, endColumnIndex: col + 1 }],
            booleanRule: {
              condition: { type: "TEXT_CONTAINS", values: [{ userEnteredValue: text }] },
              format: { backgroundColor: bg, textFormat: { foregroundColor: fg, bold: true } },
            },
          },
          index: 0,
        },
      });
    }
  }

  return requests;
}

function formattingRequestsForTab(sheetId, title, headers) {
  const maxCols = Math.max(headers.length, title === "01_Dashboard" ? 8 : 4);
  const maxRows = title === "01_Dashboard" ? 120 : 1200;
  const requests = [
    {
      updateSheetProperties: {
        properties: { sheetId, tabColor: title.startsWith("RAW_") ? COLORS.gray : COLORS.gold, gridProperties: { frozenRowCount: 1 } },
        fields: "tabColor,gridProperties.frozenRowCount",
      },
    },
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: maxRows, startColumnIndex: 0, endColumnIndex: maxCols },
        cell: { userEnteredFormat: cellFormat({ bg: COLORS.black, fg: COLORS.white, size: 10, wrap: true }) },
        fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment,wrapStrategy)",
      },
    },
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: maxCols },
        cell: { userEnteredFormat: cellFormat({ bg: COLORS.gold, fg: { red: 0, green: 0, blue: 0 }, bold: true, size: 11, align: "CENTER", wrap: true }) },
        fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)",
      },
    },
    {
      setBasicFilter: {
        filter: { range: { sheetId, startRowIndex: 0, endRowIndex: maxRows, startColumnIndex: 0, endColumnIndex: maxCols } },
      },
    },
    {
      updateBorders: {
        range: { sheetId, startRowIndex: 0, endRowIndex: Math.min(maxRows, 250), startColumnIndex: 0, endColumnIndex: maxCols },
        top: { style: "SOLID", color: COLORS.border },
        bottom: { style: "SOLID", color: COLORS.border },
        left: { style: "SOLID", color: COLORS.border },
        right: { style: "SOLID", color: COLORS.border },
        innerHorizontal: { style: "SOLID", color: COLORS.border },
        innerVertical: { style: "SOLID", color: COLORS.border },
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 36 },
        fields: "pixelSize",
      },
    },
  ];

  headers.forEach((header, index) => {
    const align = isAmountHeader(header) ? "RIGHT" : isDateHeader(header) || /status|priority/i.test(header) ? "CENTER" : "LEFT";
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: "COLUMNS", startIndex: index, endIndex: index + 1 },
        properties: { pixelSize: widthFor(header) },
        fields: "pixelSize",
      },
    });
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: maxRows, startColumnIndex: index, endColumnIndex: index + 1 },
        cell: { userEnteredFormat: { horizontalAlignment: align, verticalAlignment: "MIDDLE", wrapStrategy: /notes|message|details|reply/i.test(header) ? "WRAP" : "CLIP" } },
        fields: "userEnteredFormat(horizontalAlignment,verticalAlignment,wrapStrategy)",
      },
    });
    if (isDateHeader(header)) {
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: 1, endRowIndex: maxRows, startColumnIndex: index, endColumnIndex: index + 1 },
          cell: { userEnteredFormat: { numberFormat: { type: "DATE_TIME", pattern: "yyyy-mm-dd hh:mm" } } },
          fields: "userEnteredFormat.numberFormat",
        },
      });
    }
    if (isPercentHeader(header)) {
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: 1, endRowIndex: maxRows, startColumnIndex: index, endColumnIndex: index + 1 },
          cell: { userEnteredFormat: { numberFormat: { type: "PERCENT", pattern: "0.00%" } } },
          fields: "userEnteredFormat.numberFormat",
        },
      });
    } else if (isAmountHeader(header)) {
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: 1, endRowIndex: maxRows, startColumnIndex: index, endColumnIndex: index + 1 },
          cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: "#,##0.00" } } },
          fields: "userEnteredFormat.numberFormat",
        },
      });
    }
  });

  if (title === "01_Dashboard" || title === "02_User_Lookup" || title === "03_Finance_Summary") {
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: maxRows, startColumnIndex: 0, endColumnIndex: maxCols },
        cell: { userEnteredFormat: cellFormat({ bg: COLORS.card, fg: COLORS.white, size: 11, wrap: true }) },
        fields: "userEnteredFormat(backgroundColor,textFormat,wrapStrategy)",
      },
    });
  }

  return [...requests, ...conditionalRules(sheetId, headers)];
}

async function applyFormatting(sheets, spreadsheetId) {
  const meta = await getMetadata(sheets, spreadsheetId);
  const byTitle = sheetMap(meta);
  await ensureGridSizes(sheets, spreadsheetId, byTitle);

  const fresh = sheetMap(await getMetadata(sheets, spreadsheetId));
  const requests = [];
  for (const title of ALL_TABS) {
    const sheet = fresh.get(title);
    if (!sheet?.properties?.sheetId) continue;
    requests.push(...formattingRequestsForTab(sheet.properties.sheetId, title, headersForTab(title)));
  }

  const chunkSize = 80;
  for (let i = 0; i < requests.length; i += chunkSize) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: requests.slice(i, i + chunkSize) } });
  }
}

async function protectRawTabs(sheets, spreadsheetId) {
  if (!PROTECT_RAW_TABS) return;
  const meta = await getMetadata(sheets, spreadsheetId);
  const requests = [];

  for (const raw of RAW_TABS) {
    const sheet = meta.find((s) => s.properties?.title === raw.name);
    const sheetId = sheet?.properties?.sheetId;
    if (sheetId == null) continue;
    const description = `Earn Daily protected RAW source - ${raw.name}`;
    const alreadyProtected = (sheet.protectedRanges || []).some((range) => range.description === description);
    if (alreadyProtected) continue;
    requests.push({
      addProtectedRange: {
        protectedRange: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1200, startColumnIndex: 0, endColumnIndex: raw.headers.length },
          description,
          warningOnly: true,
        },
      },
    });
  }

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
    console.log(`Protected ${requests.length} RAW tabs with warning-only protection.`);
  }
}

async function main() {
  if (!SHEET_ID) {
    throw new Error("Missing SHEET_ID. Set SHEET_ID or GOOGLE_SHEETS_SPREADSHEET_ID before running this script.");
  }

  const auth = await getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const drive = google.drive({ version: "v3", auth });

  if (CREATE_BACKUP) {
    await createBackupCopy(drive, SHEET_ID);
  } else {
    console.warn("SKIP_BACKUP=true was set. No backup copy was created.");
  }

  if (BACKUP_ONLY) {
    console.log("BACKUP_ONLY=true was set. Stopping after backup.");
    return;
  }

  await ensureTabs(sheets, SHEET_ID);
  await writeWorkbookContent(sheets, SHEET_ID);
  await applyFormatting(sheets, SHEET_ID);
  await protectRawTabs(sheets, SHEET_ID);

  console.log("Professional Earn Daily Google Sheets workbook setup complete.");
  console.log("RAW tabs were preserved and should remain the Firebase/Replit data source.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
