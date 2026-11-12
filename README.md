# GATP Ledger

Bulk import, export and delete for QuickBooks Online, across every GATP client company.
Upload any spreadsheet → match columns → review every row → post straight to QuickBooks → undo if needed.

Built with Next.js 15 (App Router), MongoDB and the QuickBooks Online Accounting API. Deploys to Vercel.

## What it does

### Updates and linked bank deposits

The mapping screen starts with the selected transaction/list type, then displays the worksheet's actual headers and sample values. Each column can map only to fields for that type, or be ignored. Changing type reloads that type's saved matching and resets unrelated defaults. A field can use only one source column; common values and defaults for blank cells remain available. Old saved mappings are restricted to the selected type and actual worksheet headers before use.

- Choose **Update existing invoices / credit memos** on Import, or upload a sheet named `Modify - Invoices`. Updates match an exported QuickBooks ID (preferred), or a unique document number and customer. Include the complete set of product/service lines: these replace the existing lines. Unmapped headers are preserved. Paid/applied, taxed and complex documents are blocked. Validation freezes the target version; changed records must be reviewed again through Change columns. Originals are backed up before API updates; undo restores them only if the returned version is still current.
- Exported invoice/credit memo files now include `SyncToken` and re-importable customer/line columns. Create mode blocks existing IDs to prevent accidental copies.
- Bank deposits from Undeposited Funds accept comma-separated **Payment IDs**. Each payment must exist in the selected company, be in that account, be unused in deposits and this file, and add up exactly to the deposit. The app never guesses payment links from an equal amount.
- Bank bill payments accept **Bill No**, including partial payments within that vendor bill's open balance. A register cannot create the missing underlying bill or customer receipts.
- **Missing products template** downloads the missing item names with blank Type and Income Account. Review and fill these accounting choices, import the Items sheet, then recheck the transaction file. Products/accounts are never silently invented.
- **Download results** is available during review as well as after posting. It includes row problems and target/result IDs. Entire multi-line transactions are held back when any line fails. Only names needed by ready transactions appear in the posting confirmation.
- Conversion sheets, Inventory Adjustment, Budget and General Ledger remain blocked. This is a limited bulk importer, not complete SaasAnt feature parity.

Validation: `npm test`, `npm run typecheck`, `npm run build`. Recovery tests simulate lost API responses, backup failures and stale updates without writing to QuickBooks. `npm run test:files -- <paths>` checks workbook structure only; it does not prove live posting.

| Area | Details |
|---|---|
| **Companies** | Connect any number of client companies through GATP's Intuit accountant login. Each person picks the company they work in (top bar); the choice is per browser, so several people can work at once on different clients. |
| **Login** | One shared login (`APP_LOGIN_EMAIL` / `APP_PASSWORD`). Everyone types their own name, which is written to the activity log. |
| **Import** | Excel (.xlsx .xls .xlsm .xlsb), CSV, TSV, TXT, OpenDocument, Google Sheets links. Header row found automatically (bank exports with text on top work). SaasAnt template files are recognised sheet by sheet. |
| **Import types (27)** | Bank statement, credit card statement, expenses, checks, card credits, deposits, transfers, card payments, bills, bill payments, vendor credits, purchase orders, invoices, estimates, sales receipts, credit memos, refund receipts, receive payments, journal entries, trial balance, time activities, customers, vendors, employees, products & services, chart of accounts, classes, locations. |
| **Column matching** | Automatic by column title (SaasAnt names + common bank names), saved per file layout and reused next time. Any field can be given one fixed value for every row (for example the bank account). |
| **Review** | Every row checked before posting: dates, numbers, required fields, names matched to QuickBooks (with "did you mean"), inactive records, journal balance, conflicting transaction headers, bills/invoices being paid, and duplicates (same account + date + amount, or same document number) — duplicates are left out unless you include them. Edit any cell in the grid, fill a column for many rows at once, leave rows out. |
| **Bank rules** | "Description contains UBER → account Travel, payee Uber". Per company or for all companies. First match wins; only empty cells are filled. |
| **Posting** | QuickBooks batch API (30 per call), in ~40-second chunks. Transaction payloads and request IDs are saved before sending, and results before row updates, so interrupted requests resume with the identical payload. Posting is serialized per company and re-checks duplicates before starting. Older uncertain imports without a saved payload are blocked for review. Missing vendors/customers/classes/locations/payment methods are created first (option). Rows with errors are left out; the rest are posted. |
| **Undo** | Deletes records an import posted (imported list records are made inactive). Records changed later in QuickBooks are preserved and reported for review. Automatically created reference names stay active because other transactions may now use them. |
| **Export** | Any transaction type or list, by transaction date / date added / date changed, to Excel or CSV (one row per line). |
| **Delete** | Find, select, confirm by typing DELETE. A backup Excel file downloads first. Full records are saved in MongoDB before deletion; a failed backup prevents the delete. Records changed after selection are preserved. |
| **History & log** | Every import and delete with its rows and results; an activity log of who did what in which company. |
| **Dashboard** | Last 30 days per company or all companies, imports waiting for review, companies that need reconnecting. |

## Bank updates (replacing SaasAnt)

Monthly routine for each client:

1. **Once per client — teach it.** Bank rules → *Learn from a register*. Upload a register report of a month that is already done
   (QuickBooks: Chart of accounts → bank account → View register → Export to Excel). GATP Ledger finds the bank text that is always
   categorised the same way ("HCCLAIMPMT" → 11001 Undeposited Funds, class Corporate; "CABLE SVCS" → IT Services, payee COMCAST …)
   and suggests rules. Lines categorised differently each time get no rule, so nothing is guessed.
2. **Each month — import the bank download.** Import → drop the CSV/Excel from online banking → pick the bank account once →
   Check rows. Rules fill account, class, payee and type. With the Eldersburg register as teacher, all 87 lines of the next raw
   Truist download were filled automatically.
3. **Review** anything red or amber, then **Post**. Lines already in QuickBooks (same bank account, date and amount — counted one for one,
   so two genuine $375.00 payments on the same day are both kept) are left out automatically.

Also understood:

- QuickBooks register exports as input (title line gives the bank account; Memo = bank text; Payment / Deposit columns;
  Type = Deposit, Expense, Check, Transfer, Credit Card Pmt, Bill Payment).
- Accounts written as "70000 Operating Expenses:70019 IT Services / Software" (names win over numbers, since numbers can repeat).
- **Bill Payment** lines pay the vendor's unpaid bill(s) in QuickBooks (one uniquely matching bill, or all of the vendor’s remaining bills if their total matches)
  instead of posting a second expense. Ambiguous matches require an explicit Bill No in a Bill payments file.

## Deploy (Vercel Pro + MongoDB Atlas)

1. **MongoDB Atlas** → create a cluster (M10 or higher recommended for production; M0 works for testing) → Database Access: add a user → Network Access: allow `0.0.0.0/0` (Vercel uses changing IPs) → Connect → Drivers → copy the connection string.
2. **GitHub** → create a new repository (for example `AccountingGatp/gatp-ledger`) and push this folder.
3. **Vercel** → Add New Project → import the repository. Framework: Next.js (detected).
4. **Vercel → Settings → Environment Variables** (see `.env.example`):

   | Variable | Value |
   |---|---|
   | `APP_LOGIN_EMAIL` | `accounting@gatpsolutions.com` |
   | `APP_PASSWORD` | a strong shared password |
   | `SESSION_SECRET` | 32+ random characters (`openssl rand -hex 32`) |
   | `TOKEN_ENCRYPTION_KEY` | another 32+ random characters — **never change it later** (stored QuickBooks tokens would become unreadable and every company would need reconnecting) |
   | `MONGODB_URI` | the Atlas connection string |
   | `MONGODB_DB` | `gatp_ledger` |
   | `QB_CLIENT_ID`, `QB_CLIENT_SECRET` | Intuit app → Keys & credentials |
   | `QB_ENVIRONMENT` | `sandbox` while testing, `production` for real clients |
   | `QB_REDIRECT_URI` | `https://<your-domain>/api/qbo/callback` |

5. Redeploy. Open the site → log in → **Settings** shows whether MongoDB and the keys are set, and lists the exact URLs for the Intuit app.

### Intuit app

1. developer.intuit.com → your app (or create one, scope **Accounting**).
2. Settings → Redirect URIs → add `https://<your-domain>/api/qbo/callback` (Development and Production).
3. Production: complete the app checklist. Use the URLs from the Settings page: Host domain / Launch URL = site root, Disconnect URL = `/companies`, Privacy = `/privacy`, Terms = `/terms`.
4. Switch the Vercel variables to the production keys and `QB_ENVIRONMENT=production`, redeploy.
5. **Companies → Connect a company** → sign in with GATP's Intuit login → pick a client → Connect. Repeat for each client (no limit). A company that shows *Reconnect* is reconnected the same way; its history and rules stay.

## Run locally

```bash
npm install
cp .env.example .env.local     # fill in; or set QB_MOCK=1 to use a fake QuickBooks with demo companies
npm run dev                    # http://localhost:3000
```

`QB_MOCK=1` (demo mode) needs only MongoDB and the login variables. "Add demo companies" creates three fake client companies with accounts, vendors, customers and a few existing transactions, so every screen — including duplicate detection, posting and undo — can be tried safely.

Local regression tests (no database, Intuit credentials or QuickBooks writes):

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run test:files -- /private/path/to/test-file.xlsx
```

The file check parses, maps, groups and builds structural payloads using reference test doubles. It reports blocked sheets, missing fields, unresolved payment targets and duplicate files; it does not confirm actual QBO names, IDs, open balances, permissions or successful posting. Keep client spreadsheets outside this public repository.

Sheets named **Modify / Update / Edit** or **Type Chg / Convert** are blocked in the UI and API because this app currently creates new records only. A modification sheet must never silently become a new import. New invoice sheets preserve positive and negative adjustment lines.

Bank deposits from **Undeposited Funds** require the existing customer-payment links. A register export alone does not contain enough information to recreate those deposits, so they remain blocked. Complete or match them in QuickBooks; do not substitute an arbitrary income account.

Engine test (imports every sheet of a SaasAnt template against the fake QuickBooks, posts and undoes):

```bash
MONGODB_URI=mongodb://127.0.0.1:27017 MONGODB_DB=smoke QB_MOCK=1 TOKEN_ENCRYPTION_KEY=any-32-chars-xxxxxxxxxxxxxxxxxxxx \
  npm run test:engine -- path/to/SaasAnt_Template.xlsx
```

## Code map

```
app/(app)/          dashboard, import, import/[id], export, delete, history, rules, companies, settings
app/api/            JSON routes (auth, qbo, companies, jobs, rows, mapping, validate, post, rollback, export, delete, rules, settings, stats, activity)
lib/qbo/            client.ts (API, token refresh with lock, retries, batch), oauth.ts, lists.ts (name cache), mock.ts (fake QuickBooks)
lib/import/         entities.ts (all import types: fields + QuickBooks builders), automap.ts, resolver.ts (name matching),
                    validate.ts (checks, rules, duplicates), post.ts (chunked posting + undo)
lib/parse/          file.ts (any spreadsheet → rows), values.ts (dates, money, yes/no)
lib/export.ts       search + flatten for export / delete
components/         Shell (sidebar, company switcher), ui kit, import Mapping + Review grid
```

### MongoDB collections

`companies` (encrypted tokens, settings, per-company posting lease) · `post_batches` (immutable posting requests and responses for recovery) · `jobs` (imports / deletes) · `job_rows` (each row: values, problems, result, QuickBooks id; delete backups) · `mappings` (saved column matching) · `rules` (bank rules) · `audit` (activity log) · `list_cache` (QuickBooks names, 15 min) · `mock_qbo` (demo mode only). Indexes are created automatically on first use.

## Not included yet

- PDF / image bank statements (needs an OCR/AI step; export CSV from online banking meanwhile).
- Inventory adjustments, budgets and general-ledger files from the SaasAnt template (recognised and skipped).
- Scheduled / emailed automatic imports, and editing existing QuickBooks transactions in place.
- Per-person logins and roles (today: one shared login + name). Easy to add later with NextAuth or Clerk.

Note: the `xlsx` package from npm (0.18.5) has published advisories for maliciously crafted files. Files come only from GATP staff, so the risk is low; to remove it, install SheetJS 0.20.x from `https://cdn.sheetjs.com` in `package.json`.

