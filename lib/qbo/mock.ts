// Fake QuickBooks (QB_MOCK=1): lets every screen be tried with no Intuit keys.
// Data lives in MongoDB (collection mock_qbo), so it behaves like a real company across requests.
import { db } from "../db";

const ENTITIES = [
  "Account", "Vendor", "Customer", "Employee", "Item", "Class", "Department", "PaymentMethod", "Term",
  "Purchase", "Deposit", "Transfer", "Bill", "BillPayment", "VendorCredit", "PurchaseOrder", "Invoice",
  "Estimate", "SalesReceipt", "CreditMemo", "RefundReceipt", "Payment", "JournalEntry", "TimeActivity", "CompanyInfo",
];
const byLower = new Map(ENTITIES.map((e) => [e.toLowerCase(), e]));
const LISTS = new Set(["Account", "Vendor", "Customer", "Employee", "Item", "Class", "Department", "PaymentMethod", "Term"]);

type Rec = { realmId: string; entity: string; Id: string; data: any };

export const DEMO_COMPANIES = [
  { realmId: "demo-lxp", name: "LXP Enterprises, LLC" },
  { realmId: "demo-northwind", name: "Northwind Bakery Co" },
  { realmId: "demo-cedar", name: "Cedar Ridge Dental" },
  { realmId: "demo-eldersburg", name: "Eldersburg Arthritis (demo)" },
];

async function store() {
  return (await db()).collection<Rec>("mock_qbo");
}

let seq = Date.now() % 100000;
const nextId = () => String(++seq);
const nowIso = () => new Date().toISOString();

async function seed(realmId: string) {
  const s = await store();
  if (await s.findOne({ realmId, entity: "CompanyInfo" })) return;
  const name = DEMO_COMPANIES.find((d) => d.realmId === realmId)?.name || "Demo Company";
  const recs: Rec[] = [];
  const add = (entity: string, data: any) => {
    const Id = nextId();
    recs.push({ realmId, entity, Id, data: { Id, SyncToken: "0", Active: true, MetaData: { CreateTime: nowIso(), LastUpdatedTime: nowIso() }, ...data } });
    return Id;
  };
  add("CompanyInfo", { CompanyName: name, Country: "US" });
  if (realmId === "demo-eldersburg") { seedEldersburg(add); await s.insertMany(recs); return; }
  const acct = (Name: string, AccountType: string, AccountSubType: string, AcctNum?: string) =>
    add("Account", { Name, FullyQualifiedName: Name, AccountType, AccountSubType, AcctNum, Classification: "" });
  const checking = acct("Checking", "Bank", "Checking", "1010");
  acct("Savings", "Bank", "Savings", "1020");
  acct("Undeposited Funds", "Other Current Asset", "UndepositedFunds", "1200");
  acct("Accounts Receivable (A/R)", "Accounts Receivable", "AccountsReceivable", "1100");
  acct("Inventory Asset", "Other Current Asset", "Inventory", "1300");
  const visa = acct("Visa Credit Card", "Credit Card", "CreditCard", "2010");
  acct("Master Card", "Credit Card", "CreditCard", "2020");
  acct("Accounts Payable (A/P)", "Accounts Payable", "AccountsPayable", "2000");
  acct("Opening Balance Equity", "Equity", "OpeningBalanceEquity", "3000");
  const sales = acct("Sales", "Income", "SalesOfProductIncome", "4000");
  acct("Services", "Income", "ServiceFeeIncome", "4100");
  acct("Uncategorized Income", "Income", "OtherPrimaryIncome", "4900");
  acct("Cost of Goods Sold", "Cost of Goods Sold", "SuppliesMaterialsCogs", "5000");
  const office = acct("Office Supplies", "Expense", "OfficeGeneralAdministrativeExpenses", "6100");
  acct("Travel", "Expense", "Travel", "6200");
  acct("Meals and Entertainment", "Expense", "EntertainmentMeals", "6210");
  acct("Advertising", "Expense", "AdvertisingPromotional", "6300");
  acct("Promotional", "Expense", "AdvertisingPromotional", "6310");
  acct("Rent", "Expense", "RentOrLeaseOfBuildings", "6400");
  acct("Utilities", "Expense", "Utilities", "6500");
  acct("Bank Charges", "Expense", "BankCharges", "6600");
  acct("Software Subscriptions", "Expense", "OfficeGeneralAdministrativeExpenses", "6700");
  acct("Supplies", "Expense", "SuppliesMaterials", "6800");
  acct("Uncategorized Expense", "Expense", "OtherMiscellaneousServiceCost", "6999");

  const vendor = (DisplayName: string) => add("Vendor", { DisplayName });
  const staples = vendor("Staples");
  vendor("Amazon Business"); vendor("Comcast Business"); vendor("Uber"); vendor("Lee Advertising");
  vendor("Hicks Hardware"); vendor("Robertson & Associates"); vendor("Adobe"); vendor("Delta Air Lines");
  const cust = (DisplayName: string) => add("Customer", { DisplayName, FullyQualifiedName: DisplayName });
  cust("Travis Waldron"); cust("Mark Cho"); cust("Greenfield Market"); cust("Bayside Cafe");
  add("Employee", { DisplayName: "Emily Platt", GivenName: "Emily", FamilyName: "Platt" });
  add("Employee", { DisplayName: "John Johnson", GivenName: "John", FamilyName: "Johnson" });
  add("Item", { Name: "Sprinkler Pipes", FullyQualifiedName: "Sprinkler Pipes", Type: "NonInventory", Sku: "SP-100", UnitPrice: 5, IncomeAccountRef: { value: sales } });
  add("Item", { Name: "Design", FullyQualifiedName: "Design", Type: "Service", UnitPrice: 75, IncomeAccountRef: { value: sales } });
  add("Item", { Name: "Consulting", FullyQualifiedName: "Consulting", Type: "Service", UnitPrice: 120, IncomeAccountRef: { value: sales } });
  for (const n of ["Admin", "Operations", "Marketing"]) add("Class", { Name: n, FullyQualifiedName: n });
  for (const n of ["Main Store", "Warehouse"]) add("Department", { Name: n, FullyQualifiedName: n });
  for (const n of ["Cash", "Check", "Visa", "MasterCard", "ACH"]) add("PaymentMethod", { Name: n });
  add("Term", { Name: "Due on receipt", DueDays: 0 }); add("Term", { Name: "Net 15", DueDays: 15 }); add("Term", { Name: "Net 30", DueDays: 30 });

  // a few existing transactions, so the duplicate check has something to find
  const d = new Date(); const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  add("Purchase", { TxnDate: `${ym}-03`, PaymentType: "Cash", AccountRef: { value: checking, name: "Checking" }, EntityRef: { value: staples, name: "Staples", type: "Vendor" }, TotalAmt: 84.12, Line: [{ Amount: 84.12, DetailType: "AccountBasedExpenseLineDetail", Description: "STAPLES 00123", AccountBasedExpenseLineDetail: { AccountRef: { value: office, name: "Office Supplies" } } }] });
  add("Purchase", { TxnDate: `${ym}-05`, PaymentType: "CreditCard", AccountRef: { value: visa, name: "Visa Credit Card" }, TotalAmt: 52.99, Line: [{ Amount: 52.99, DetailType: "AccountBasedExpenseLineDetail", AccountBasedExpenseLineDetail: { AccountRef: { value: office, name: "Office Supplies" } } }] });
  add("Bill", { DocNumber: "INV-7781", TxnDate: `${ym}-01`, VendorRef: { value: staples, name: "Staples" }, TotalAmt: 410, Balance: 410, Line: [{ Amount: 410, DetailType: "AccountBasedExpenseLineDetail", AccountBasedExpenseLineDetail: { AccountRef: { value: office } } }] });
  await s.insertMany(recs);
}

/** A chart of accounts shaped like the Eldersburg Arthritis register (numbered, with sub-accounts). */
function seedEldersburg(add: (entity: string, data: any) => string) {
  const ids = new Map<string, string>();
  const acct = (full: string, AccountType: string, AccountSubType: string, AcctNum?: string) => {
    const parts = full.split(":");
    const Name = parts[parts.length - 1];
    const parent = parts.length > 1 ? ids.get(parts.slice(0, -1).join(":")) : undefined;
    const id = add("Account", { Name, FullyQualifiedName: full, AccountType, AccountSubType, AcctNum, ...(parent ? { SubAccount: true, ParentRef: { value: parent } } : {}) });
    ids.set(full, id);
    return id;
  };
  acct("Truist Checking 6638", "Bank", "Checking", "10004");
  acct("Truist Savings 2025", "Bank", "Savings", "10006");
  acct("Visa Card", "Credit Card", "CreditCard", "10015");
  acct("Undeposited Funds", "Other Current Asset", "UndepositedFunds", "11001");
  acct("Loan to/from Nexus Health Centre 2025", "Other Current Asset", "LoansToOthers", "11005");
  acct("Accounts Payable", "Accounts Payable", "AccountsPayable", "12000");
  acct("Due to/from NEC", "Other Current Liability", "OtherCurrentLiabilities");
  acct("Payroll Clearing", "Other Current Liability", "PayrollClearing");
  acct("Payroll Clearing:Taxes to Pay", "Other Current Liability", "PayrollTaxPayable");
  acct("Patient Revenue", "Income", "ServiceFeeIncome", "40000");
  acct("Ask My Accountant", "Expense", "OtherMiscellaneousServiceCost");
  acct("Bank Fees", "Expense", "BankCharges", "70016");
  acct("Billing Software", "Expense", "OfficeGeneralAdministrativeExpenses", "70028");
  acct("Rent Expense", "Expense", "RentOrLeaseOfBuildings", "70095");
  acct("Operating Expenses", "Expense", "OtherMiscellaneousServiceCost", "70000");
  acct("Operating Expenses:IT Services / Software", "Expense", "OfficeGeneralAdministrativeExpenses", "70019");
  acct("Operating Expenses:Software & Subscriptions / Dues", "Expense", "DuesSubscriptions", "70027");
  acct("Operating Expenses:Printing & Stationery", "Expense", "SuppliesMaterials", "70032");
  acct("Operating Expenses:Insurance Expense", "Expense", "Insurance", "70032");
  acct("Operating Expenses:Insurance Expense:Life and Disability Insurance", "Expense", "Insurance", "70033");
  acct("Operating Expenses:Operating expense Lease", "Expense", "RentOrLeaseOfBuildings", "70095");
  for (const n of ["Corporate", "Eldersburg"]) add("Class", { Name: n, FullyQualifiedName: n });
  const vendors = new Map<string, string>();
  for (const n of ["Global Payments", "Dex Imaging", "E Clinical Works", "PRIME STORAGE ELDERSBURG", "GATP Solutions", "Amwins", "The Hanover Insurance Group", "Principal Life", "Mid-Atlantic Rheumatology, LLC", "COMCAST"])
    vendors.set(n, add("Vendor", { DisplayName: n }));
  // "We Infuse" is left out on purpose: the import creates it
  add("Bill", { DocNumber: "AMW-0926", TxnDate: "2026-09-26", VendorRef: { value: vendors.get("Amwins"), name: "Amwins" }, TotalAmt: 13680.76, Balance: 13680.76, Line: [{ Amount: 13680.76, DetailType: "AccountBasedExpenseLineDetail", AccountBasedExpenseLineDetail: { AccountRef: { value: ids.get("Operating Expenses:Insurance Expense") } } }] });
}

// ---------------------------------------------------------------- tiny query engine
function get(o: any, path: string) {
  return path.split(".").reduce((x, k) => (x == null ? x : x[k]), o);
}
function parseVal(v: string): any {
  v = v.trim();
  if (/^'.*'$/s.test(v)) return v.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, "\\");
  if (/^(true|false)$/i.test(v)) return v.toLowerCase() === "true";
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}
function matches(rec: any, where: string) {
  if (!where.trim()) return true;
  const conds = where.split(/\s+and\s+/i);
  return conds.every((c) => {
    const m = c.match(/^\s*([\w.]+)\s*(>=|<=|!=|=|>|<|\bin\b|\blike\b)\s*(.+)$/i);
    if (!m) return true;
    const [, field, opRaw, valRaw] = m;
    const op = opRaw.toLowerCase();
    let actual = get(rec, field);
    if (field === "Active" && actual === undefined) actual = true;
    if (op === "in") {
      const vals = valRaw.replace(/^\(|\)$/g, "").split(",").map(parseVal);
      return vals.some((v) => String(v).toLowerCase() === String(actual).toLowerCase());
    }
    const v = parseVal(valRaw);
    if (op === "like") return new RegExp("^" + String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$", "i").test(String(actual ?? ""));
    const a = typeof v === "number" ? Number(actual) : String(actual ?? "");
    const b = typeof v === "number" ? v : String(v);
    if (op === "=") return typeof a === "string" ? a.toLowerCase() === String(b).toLowerCase() : a === b;
    if (op === "!=") return a !== b;
    if (op === ">=") return a >= b;
    if (op === "<=") return a <= b;
    if (op === ">") return a > b;
    if (op === "<") return a < b;
    return true;
  });
}

async function runQuery(realmId: string, q: string) {
  const m = q.match(/^select\s+(\*|count\(\*\))\s+from\s+(\w+)(?:\s+where\s+(.+?))?(?:\s+orderby\s+.+?)?(?:\s+startposition\s+(\d+))?(?:\s+maxresults\s+(\d+))?\s*$/i);
  if (!m) throw new Error("Mock QuickBooks: query not understood: " + q);
  const entity = byLower.get(m[2].toLowerCase()) || m[2];
  const all = (await (await store()).find({ realmId, entity }).toArray()).map((r) => r.data);
  const hasActive = /\bactive\b/i.test(m[3] || "");
  const rows = all.filter((r) => matches(r, m[3] || "") && (hasActive || !LISTS.has(entity) || r.Active !== false));
  if (m[1].toLowerCase().startsWith("count")) return { QueryResponse: { totalCount: rows.length } };
  const start = Number(m[4] || 1) - 1, max = Number(m[5] || 100);
  const page = rows.slice(start, start + max);
  return { QueryResponse: page.length ? { [entity]: page, startPosition: start + 1, maxResults: page.length } : {} };
}

// ---------------------------------------------------------------- writes
function fault(message: string, detail?: string) {
  const e = new Error(detail ? `${message}: ${detail}` : message);
  (e as any).qbo = { Fault: { Error: [{ Message: message, Detail: detail || message, code: "6000" }], type: "ValidationFault" } };
  return e;
}

function total(entity: string, body: any) {
  const lines: any[] = body.Line || [];
  if (entity === "JournalEntry")
    return lines.filter((l) => l.JournalEntryLineDetail?.PostingType === "Debit").reduce((s, l) => s + Number(l.Amount || 0), 0);
  if (entity === "Transfer") return Number(body.Amount || 0);
  return lines.filter((l) => l.DetailType !== "SubTotalLineDetail").reduce((s, l) => s + Number(l.Amount || 0), 0);
}

async function refExists(realmId: string, ref: any) {
  if (!ref?.value) return true;
  return !!(await (await store()).findOne({ realmId, Id: String(ref.value) }));
}

async function create(realmId: string, entity: string, body: any) {
  const s = await store();
  if (["Vendor", "Customer", "Employee"].includes(entity)) {
    const name = String(body.DisplayName || [body.GivenName, body.FamilyName].filter(Boolean).join(" ") || body.CompanyName || "").trim();
    if (!name) throw fault("Required param missing", "DisplayName is required");
    const taken = await s.find({ realmId, entity: { $in: ["Vendor", "Customer", "Employee"] } }).toArray();
    if (taken.some((t) => String(t.data.DisplayName).toLowerCase() === name.toLowerCase()))
      throw fault("Duplicate Name Exists Error", `The name supplied already exists. : ${name}`);
    body = { ...body, DisplayName: name, FullyQualifiedName: name };
  }
  if (["Item", "Class", "Department", "Account", "PaymentMethod", "Term"].includes(entity)) {
    if (!body.Name) throw fault("Required param missing", "Name is required");
    const taken = await s.find({ realmId, entity }).toArray();
    if (taken.some((t) => String(t.data.Name).toLowerCase() === String(body.Name).toLowerCase()))
      throw fault("Duplicate Name Exists Error", `The name supplied already exists. : ${body.Name}`);
    body = { ...body, FullyQualifiedName: body.FullyQualifiedName || body.Name };
  }
  for (const k of ["AccountRef", "VendorRef", "CustomerRef", "DepositToAccountRef", "FromAccountRef", "ToAccountRef", "APAccountRef"])
    if (!(await refExists(realmId, body[k]))) throw fault("Invalid Reference Id", `${k} ${body[k].value} not found`);
  for (const l of body.Line || []) {
    const d = l.AccountBasedExpenseLineDetail || l.DepositLineDetail || l.JournalEntryLineDetail;
    if (d && !(await refExists(realmId, d.AccountRef))) throw fault("Invalid Reference Id", `Account ${d.AccountRef?.value} not found`);
    const it = l.SalesItemLineDetail?.ItemRef || l.ItemBasedExpenseLineDetail?.ItemRef;
    if (it && !(await refExists(realmId, it))) throw fault("Invalid Reference Id", `Item ${it.value} not found`);
  }
  if (entity === "JournalEntry") {
    const lines: any[] = body.Line || [];
    const dr = lines.filter((l) => l.JournalEntryLineDetail?.PostingType === "Debit").reduce((x, l) => x + l.Amount, 0);
    const cr = lines.filter((l) => l.JournalEntryLineDetail?.PostingType === "Credit").reduce((x, l) => x + l.Amount, 0);
    if (Math.abs(dr - cr) > 0.005) throw fault("Transaction must balance", `Debits ${dr.toFixed(2)} ≠ credits ${cr.toFixed(2)}`);
  }
  const Id = nextId();
  const data = {
    ...body, Id, SyncToken: "0",
    MetaData: { CreateTime: nowIso(), LastUpdatedTime: nowIso() },
    ...(LISTS.has(entity) ? { Active: body.Active ?? true } : { TotalAmt: Math.round(total(entity, body) * 100) / 100, TxnDate: body.TxnDate || nowIso().slice(0, 10) }),
  };
  await s.insertOne({ realmId, entity, Id, data });
  if (entity === "BillPayment") await applyToBills(realmId, body, -1);
  return data;
}

/** A bill payment lowers the unpaid balance of the bills it pays (and raises it back when deleted). */
async function applyToBills(realmId: string, pay: any, sign: 1 | -1) {
  const s = await store();
  for (const l of pay.Line || []) for (const t of l.LinkedTxn || []) {
    if (t.TxnType !== "Bill") continue;
    const b = await s.findOne({ realmId, entity: "Bill", Id: String(t.TxnId) });
    if (!b) throw fault("Invalid Reference Id", `Bill ${t.TxnId} not found`);
    const bal = Math.round((Number(b.data.Balance || 0) + sign * Number(l.Amount || 0)) * 100) / 100;
    if (bal < -0.004) throw fault("Business Validation Error", "The payment is more than the unpaid amount of the bill");
    await s.updateOne({ _id: b._id }, { $set: { "data.Balance": bal } });
  }
}

async function update(realmId: string, entity: string, body: any) {
  const s = await store();
  const cur = await s.findOne({ realmId, entity, Id: String(body.Id) });
  if (!cur) throw fault("Object Not Found", `${entity} ${body.Id} not found`);
  if (String(body.SyncToken) !== String(cur.data.SyncToken)) throw fault("Stale Object Error", "You and another user were working on the same thing.");
  const data = { ...(body.sparse ? cur.data : {}), ...body, SyncToken: String(Number(cur.data.SyncToken) + 1), MetaData: { ...cur.data.MetaData, LastUpdatedTime: nowIso() } };
  delete data.sparse;
  await s.updateOne({ realmId, entity, Id: String(body.Id) }, { $set: { data } });
  return data;
}

async function remove(realmId: string, entity: string, body: any) {
  const s = await store();
  const cur = await s.findOne({ realmId, entity, Id: String(body.Id) });
  if (!cur) throw fault("Object Not Found", `${entity} ${body.Id} not found`);
  await s.deleteOne({ realmId, entity, Id: String(body.Id) });
  if (entity === "BillPayment") await applyToBills(realmId, cur.data, 1);
  return { Id: body.Id, status: "Deleted" };
}

async function op(realmId: string, operation: string, entity: string, body: any) {
  if (operation === "delete") return remove(realmId, entity, body);
  if (operation === "update" || body.Id) return update(realmId, entity, body);
  return create(realmId, entity, body);
}

export async function mockApi(realmId: string, path: string, body?: any): Promise<any> {
  await seed(realmId);
  await new Promise((r) => setTimeout(r, 40)); // a little latency, so progress bars are visible
  const [p, qs = ""] = path.split("?");
  const params = new URLSearchParams(qs);
  if (p === "query") return runQuery(realmId, params.get("query") || "");
  if (p.startsWith("companyinfo")) {
    const ci = await (await store()).findOne({ realmId, entity: "CompanyInfo" });
    return { CompanyInfo: ci?.data };
  }
  if (p === "batch") {
    const out: any[] = [];
    for (const item of body.BatchItemRequest || []) {
      const entity = Object.keys(item).find((k) => byLower.has(k.toLowerCase()))!;
      try {
        if (item.operation === "query") { out.push({ bId: item.bId, QueryResponse: (await runQuery(realmId, item.Query)).QueryResponse }); continue; }
        const r = await op(realmId, item.operation || "create", entity, item[entity]);
        out.push({ bId: item.bId, [entity]: r });
      } catch (e: any) {
        out.push({ bId: item.bId, Fault: e.qbo?.Fault || { Error: [{ Message: String(e.message) }] } });
      }
    }
    return { BatchItemResponse: out };
  }
  const [ent, id] = p.split("/");
  const entity = byLower.get(ent.toLowerCase());
  if (!entity) throw new Error("Mock QuickBooks: unknown path " + path);
  try {
    if (!body && id) {
      const r = await (await store()).findOne({ realmId, entity, Id: id });
      if (!r) throw fault("Object Not Found", `${entity} ${id}`);
      return { [entity]: r.data };
    }
    return { [entity]: await op(realmId, params.get("operation") || "create", entity, body) };
  } catch (e: any) {
    throw new Error(e.message);
  }
}
