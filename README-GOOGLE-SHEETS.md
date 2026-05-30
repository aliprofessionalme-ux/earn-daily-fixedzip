# Earn Daily Professional Google Sheets Workbook

This workbook system is designed as a company-level reporting layer for the Earn Daily app.

The safe data flow is:

```text
Replit/Firebase -> RAW_* tabs -> formulas/reporting tabs -> dashboards
```

The setup script is additive. It creates missing tabs, writes headers/formulas, formats the workbook, and protects RAW tabs with warning-only protection. It does not commit credentials and does not hardcode private Google Sheet URLs.

## Files

- `scripts/setup-professional-google-sheet.js` - Node.js Google Sheets API setup script.
- `scripts/package.json` - Adds `setup:google-sheet` script and `googleapis` dependency.
- `README-GOOGLE-SHEETS.md` - This guide.

## Safety Rules

1. Do not delete existing sheet data.
2. Keep Firebase/Replit data pushes pointed at RAW tabs.
3. Do not push app data directly into dashboard/report tabs.
4. Use `SHEET_ID` from environment variables.
5. Do not commit service account JSON, tokens, private keys, or downloaded credentials.
6. The setup script creates a backup copy by default before making changes.
7. RAW tabs are protected with warning-only protection to reduce accidental manual edits.
8. Internal provider names stay in admin/reporting sheets only.

## Required Environment Variables

Set the target spreadsheet ID:

```bash
export SHEET_ID="your_google_sheet_id"
```

Use either service account environment variables:

```bash
export GOOGLE_SHEETS_CLIENT_EMAIL="service-account@project.iam.gserviceaccount.com"
export GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Or use Application Default Credentials:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/secure/path/service-account.json"
```

Never commit the JSON credential file or private key.

## Install and Run

From the repo root:

```bash
pnpm install
pnpm --filter @workspace/scripts setup:google-sheet
```

The script creates a backup copy first. To create only a backup and stop:

```bash
BACKUP_ONLY=true pnpm --filter @workspace/scripts setup:google-sheet
```

To skip backup only when you are testing on a disposable sheet:

```bash
SKIP_BACKUP=true pnpm --filter @workspace/scripts setup:google-sheet
```

## Workbook Tabs

### Reporting and Dashboard Tabs

- `01_Dashboard` - Executive KPI dashboard.
- `02_User_Lookup` - Search by user ID, email, or phone.
- `03_Finance_Summary` - Revenue, payouts, expenses, profit, liabilities.
- `04_Monthly_PnL` - Month-by-month profit and loss.
- `05_Yearly_Summary` - Year-by-year business summary.
- `06_User_Analytics` - User growth, activity, retention, risk.
- `07_Withdrawals_Pay_Queue` - Payment queue view for withdrawals.
- `08_Advertiser_Performance` - Provider/task revenue and approval performance.
- `09_Tasks_Offers_Report` - Task/offer activity report.
- `10_Expenses` - Expense reporting view.
- `11_Support_Tickets` - Support ticket reporting view.
- `12_Admin_Audit` - Admin action reporting view.
- `13_Settings` - Workbook constants and admin notes.

### RAW Data Tabs

- `RAW_Users`
- `RAW_Wallets`
- `RAW_Transactions`
- `RAW_Withdrawals`
- `RAW_Task_Postbacks`
- `RAW_Advertiser_Revenue`
- `RAW_Expenses`
- `RAW_Support`
- `RAW_Admin_Logs`

Replit/Firebase should write only to these RAW tabs.

## How Replit/Firebase Should Push Data

Push app data into RAW tabs using stable column mappings:

- User profile/status data -> `RAW_Users`
- Wallet balances -> `RAW_Wallets`
- Coin ledger / balance changes -> `RAW_Transactions`
- Withdrawal requests/status changes -> `RAW_Withdrawals`
- Provider postbacks/task outcomes -> `RAW_Task_Postbacks`
- Advertiser revenue rows -> `RAW_Advertiser_Revenue`
- Firebase/Replit/manual business costs -> `RAW_Expenses`
- Support tickets/admin replies -> `RAW_Support`
- Admin actions -> `RAW_Admin_Logs`

Dashboard and report tabs read from RAW tabs using formulas. Do not manually paste Firebase exports into reporting tabs.

## User Lookup

Open `02_User_Lookup` and enter a value in cell `B2`:

- User ID
- Email
- Phone

The profile area resolves the user and pulls balances, referral fields, risk status, withdrawals, transactions, task completions, support tickets, and admin notes from RAW tabs.

## Monthly P&L

Open `04_Monthly_PnL` to review month-by-month performance.

Important formulas:

```text
Gross Profit = Advertiser Revenue - User Payout Amount
Net Profit = Advertiser Revenue - User Payout Amount - Firebase Expense - Replit Expense - Other Expenses
Profit Margin % = Net Profit / Advertiser Revenue
```

Use this tab to identify:

- Highest revenue month
- Highest profit month
- Highest expense month
- Highest user payout month
- Highest active-user month

## Finance Summary

Open `03_Finance_Summary` for the control center:

- Total advertiser revenue
- Revenue today/month/year
- User payout totals
- Pending liabilities
- Firebase/Replit/other expenses
- Gross profit
- Net profit
- Profit margin
- ARPU and average payout per user

## Expenses

Add expense rows to `RAW_Expenses` with these types:

- Firebase
- Replit
- Other Tools
- Marketing
- Manual Adjustment
- Miscellaneous

`03_Finance_Summary`, `04_Monthly_PnL`, and `05_Yearly_Summary` read expenses from `RAW_Expenses`.

## Withdrawal Pay Queue

Open `07_Withdrawals_Pay_Queue` to pay users.

Useful filters:

- Pending only
- Approved only
- Paid only
- Rejected only
- High risk only
- Today requests
- This month requests

Conditional formatting highlights:

- Pending = yellow
- Approved/Paid = green
- Rejected = red
- Review/Needs Review = orange
- High Risk = red

## Advertiser Performance

Open `08_Advertiser_Performance` to compare providers:

- Monlix
- Tapjoy
- Unity
- ayeT
- PubScale

Public labels stay generic, for example:

- Game Tasks
- Partner Tasks
- Play Games & Earn
- App Install Tasks
- High Reward Offers

Key formulas:

```text
Conversion Rate = Completed Tasks / Task Starts
Approval Rate = Approved Tasks / Completed Tasks
Rejection Rate = Rejected Tasks / Completed Tasks
Gross Profit = Revenue Received - Estimated User Payout
```

## Backup Workflow

Before applying changes to a live workbook:

1. Confirm `SHEET_ID` points to the correct Google Sheet.
2. Run backup only first:

```bash
BACKUP_ONLY=true pnpm --filter @workspace/scripts setup:google-sheet
```

3. Open the backup link printed by the script.
4. Then run the full setup:

```bash
pnpm --filter @workspace/scripts setup:google-sheet
```

The full setup also creates a backup by default.

## What the Script Does

The setup script:

- Creates all required tabs if missing.
- Adds RAW headers.
- Adds reporting headers and formulas.
- Adds filters.
- Freezes the first row.
- Applies premium black/yellow styling.
- Adds visible borders and readable column widths.
- Formats dates, amounts, and percentages.
- Wraps long text columns.
- Applies conditional formatting.
- Protects RAW tabs with warning-only protection.
- Creates a backup copy before modifying the workbook unless `SKIP_BACKUP=true` is set.

## What the Script Does Not Do

- It does not delete existing data.
- It does not change Firebase/Replit app code.
- It does not push credentials into the repo.
- It does not hardcode private Google Sheet URLs.
- It does not expose internal provider names in user-facing mobile UI.

## Recommended Next Step

After this setup is merged, update the live backend mapping only when ready so Firebase/Replit writes to the RAW tabs listed above. Keep the reporting tabs formula-only.
