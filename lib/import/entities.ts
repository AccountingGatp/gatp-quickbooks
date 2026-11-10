// Everything that can be imported: the columns each type understands, and how rows become a
// QuickBooks transaction or list record. Column names follow the SaasAnt US templates, so existing
// files map automatically; aliases cover common bank / report column names.
import type { EntityGroup, FieldDef, ImportSettings, Issue, RefKind } from "../types";
import type { Resolver, Ref } from "./resolver";

export type Vals = Record<string, string>;
export type Built = { entity: string; body: any; label: string };

export type BuildCtx = {
  r: Resolver;
  settings: ImportSettings;
  flip: boolean;
  docs: Map<string, { id: string; party?: string }[]>; // "Bill|NUMBER" -> existing bills
  openBills?: Map<string, OpenBill[]>; // vendor id -> unpaid bills (for bank lines that pay a bill)
  usedBills?: Set<string>; // bills already paid by an earlier line of the same file
};
export type OpenBill = { id: string; balance: number; date: string; docNumber?: string };

export type EntityDef = {
  key: string;
  label: string;
  group: EntityGroup;
  description: string;
  sheetNames: string[];
  fields: FieldDef[];
  groupBy?: string;
  sign?: { pos: string; neg: string; defaultFlip?: boolean };
  list?: { kind: string; nameField: string };
  docLookups?: { type: "Bill" | "Invoice"; field: string; party: string }[];
  build(rows: Vals[], c: BuildCtx): Built;
  /** extra checks for one transaction; `row` = index inside the group */
  check?(rows: Vals[], c: BuildCtx): (Issue & { row?: number })[];
};

// ---------------------------------------------------------------- field helpers
const T = (key: string, label: string, aliases: string[] = [], o: Partial<FieldDef> = {}): FieldDef => ({ key, label, type: "text", aliases, ...o });
const N = (key: string, label: string, aliases: string[] = [], o: Partial<FieldDef> = {}): FieldDef => ({ key, label, type: "number", aliases, ...o });
const D = (key: string, label: string, aliases: string[] = [], o: Partial<FieldDef> = {}): FieldDef => ({ key, label, type: "date", aliases, ...o });
const B = (key: string, label: string, aliases: string[] = [], o: Partial<FieldDef> = {}): FieldDef => ({ key, label, type: "bool", aliases, ...o });
const R = (key: string, label: string, ref: RefKind, aliases: string[] = [], o: Partial<FieldDef> = {}): FieldDef => ({ key, label, type: "ref", ref, aliases, ...o });
const L = (f: FieldDef): FieldDef => ({ ...f, line: true });

const num = (s?: string) => (s == null || s === "" ? null : Number(s));
const r2 = (n: number) => Math.round(n * 100) / 100;
const yes = (s?: string) => s === "true";

function ref(c: BuildCtx, kind: RefKind, value: string | undefined, prefer?: "Vendor" | "Customer" | "Employee"): Ref | undefined {
  if (!value) return undefined;
  const hit = c.r.find(kind, value, prefer);
  if (!hit) throw new Error(`${value} was not found in QuickBooks`);
  return hit;
}
const R_ = (x?: Ref) => (x ? { value: x.value, name: x.name } : undefined);
const clean = <T extends Record<string, any>>(o: T): T => {
  for (const k of Object.keys(o)) if (o[k] === undefined || o[k] === "" || (typeof o[k] === "object" && o[k] && !Array.isArray(o[k]) && !Object.keys(o[k]).length)) delete o[k];
  return o;
};

function common(v: Vals, c: BuildCtx, o: { doc?: string; date?: string; memo?: "PrivateNote" | "Memo" } = {}) {
  return clean({
    TxnDate: v[o.date || "date"] || undefined,
    DocNumber: c.settings.useFileRefNo && v[o.doc || "docNumber"] ? String(v[o.doc || "docNumber"]).slice(0, 21) : undefined,
    PrivateNote: v.memo ? v.memo.slice(0, 4000) : undefined,
    DepartmentRef: R_(ref(c, "Department", v.location)),
    CurrencyRef: v.currency ? { value: v.currency.toUpperCase() } : undefined,
    ExchangeRate: num(v.exchangeRate) ?? undefined,
  });
}

function addr(v: Vals, p: string) {
  const a = clean({
    Line1: v[`${p}1`], Line2: v[`${p}2`], Line3: v[`${p}3`], City: v[`${p}City`],
    CountrySubDivisionCode: v[`${p}State`], PostalCode: v[`${p}Postal`], Country: v[`${p}Country`],
  });
  return Object.keys(a).length ? a : undefined;
}

function lineAmount(v: Vals) {
  const a = num(v.amount), q = num(v.qty), rate = num(v.rate);
  if (a != null) return r2(a);
  if (q != null && rate != null) return r2(q * rate);
  return 0;
}

function expenseLine(v: Vals, c: BuildCtx, amount = lineAmount(v)) {
  const item = ref(c, "Item", v.item);
  if (item) {
    const q = num(v.qty);
    return {
      DetailType: "ItemBasedExpenseLineDetail", Amount: amount, Description: v.description || undefined,
      ItemBasedExpenseLineDetail: clean({ ItemRef: R_(item), Qty: q ?? undefined, UnitPrice: num(v.rate) ?? (q ? r2(amount / q) : undefined), ClassRef: R_(ref(c, "Class", v.className)), CustomerRef: R_(ref(c, "Customer", v.billableCustomer)) }),
    };
  }
  return clean({
    DetailType: "AccountBasedExpenseLineDetail", Amount: amount, Description: v.description || undefined,
    AccountBasedExpenseLineDetail: clean({ AccountRef: R_(ref(c, "Account", v.category)), ClassRef: R_(ref(c, "Class", v.className)), CustomerRef: R_(ref(c, "Customer", v.billableCustomer)) }),
  });
}

function salesLine(v: Vals, c: BuildCtx) {
  const amount = lineAmount(v);
  const q = num(v.qty);
  return clean({
    DetailType: "SalesItemLineDetail", Amount: amount, Description: v.description || undefined,
    SalesItemLineDetail: clean({
      ItemRef: R_(ref(c, "Item", v.item)), Qty: q ?? undefined, UnitPrice: num(v.rate) ?? (q ? r2(amount / q) : undefined),
      TaxCodeRef: v.taxable ? { value: yes(v.taxable) ? "TAX" : "NON" } : undefined,
      ClassRef: R_(ref(c, "Class", v.className)), ServiceDate: v.serviceDate || undefined,
    }),
  });
}

const sum = (rows: Vals[], f = lineAmount) => r2(rows.reduce((s, v) => s + f(v), 0));
const linesNeed = (rows: Vals[], what: "account" | "item" | "either"): (Issue & { row?: number })[] => {
  const out: (Issue & { row?: number })[] = [];
  rows.forEach((v, row) => {
    if (what === "item" && !v.item) out.push({ row, field: "item", level: "error", msg: "Product/Service is required on every line" });
    if (what === "account" && !v.category) out.push({ row, field: "category", level: "error", msg: "Expense account is required on every line" });
    if (what === "either" && !v.item && !v.category) out.push({ row, field: "category", level: "error", msg: "Each line needs an expense account or a product/service" });
    if (v.amount == null && v.qty == null) out.push({ row, field: "amount", level: "error", msg: "Line amount is missing" });
  });
  return out;
};
function partyRef(c: BuildCtx, v: Vals, prefer: "Vendor" | "Customer" | "Employee" = "Vendor") {
  const p = ref(c, "Name", v.payee, prefer);
  return p ? { value: p.value, name: p.name, type: p.kind } : undefined;
}

// common field sets
const ADDR = (p: string, label: string) => [
  T(`${p}1`, `${label} Line 1`, [`${label} Address Line 1`, `${label} Address`, `${label} Street`]),
  T(`${p}2`, `${label} Line 2`, [`${label} Address Line 2`]),
  T(`${p}3`, `${label} Line 3`, [`${label} Address Line 3`]),
  T(`${p}City`, `${label} City`, [`${label} Address City`]),
  T(`${p}State`, `${label} State`, [`${label} Address State`]),
  T(`${p}Postal`, `${label} Postal Code`, [`${label} Address Postal Code`, `${label} Zip`]),
  T(`${p}Country`, `${label} Country`, [`${label} Address Country`]),
];
const CLASS = R("className", "Class", "Class", ["Line Class", "Class Name"]);
const LOCATION = R("location", "Location", "Department", ["Department", "Store"]);
const MEMO = T("memo", "Memo", ["Notes", "Private Note", "Statement Memo"], { max: 4000 });
const CURRENCY = [T("currency", "Currency Code", ["Currency"]), N("exchangeRate", "Exchange Rate")];
const EXP_LINES = [
  L(R("category", "Expense Account", "Account", ["Category", "Account Name", "Expense Category", "Line Account", "GL Account"])),
  L(T("description", "Expense Description", ["Description", "Line Description", "Item Description", "Product/Service Description"], { max: 4000 })),
  L(N("amount", "Expense Line Amount", ["Line Amount", "Amount", "Product/Service Amount", "Total"])),
  L(R("item", "Product/Service", "Item", ["Item", "Product", "Service", "Item Name"])),
  L(N("qty", "Product/Service Quantity", ["Qty", "Quantity"])),
  L(N("rate", "Product/Service Rate", ["Rate", "Unit Price", "Price", "Cost"])),
  L(CLASS),
  L(R("billableCustomer", "Billable Customer", "Customer", ["Customer/Project", "Line Customer"])),
];
const SALES_LINES = [
  L(R("item", "Product/Service", "Item", ["Item", "Product", "Service", "Item Name", "SKU"])),
  L(T("description", "Product/Service Description", ["Description", "Line Description", "Item Description"], { max: 4000 })),
  L(N("qty", "Product/Service Quantity", ["Qty", "Quantity"])),
  L(N("rate", "Product/Service Rate", ["Rate", "Unit Price", "Price"])),
  L(N("amount", "Product/Service Amount", ["Amount", "Line Amount", "Total"])),
  L(B("taxable", "Product/Service Taxable", ["Taxable", "Tax"])),
  L(D("serviceDate", "Service Date")),
  L(CLASS),
];

// ---------------------------------------------------------------- statement logic (bank + credit card)
function signed(v: Vals, c: BuildCtx, cc: boolean) {
  let n = num(v.amount);
  if (n == null) {
    const dr = Math.abs(num(v.debit) ?? 0), cr = Math.abs(num(v.credit) ?? 0);
    n = cc ? dr - cr : cr - dr; // bank: credit = money in; card: debit = a charge
  }
  return c.flip ? -n : n;
}
const TYPE_ALIASES: Record<string, string> = {
  expense: "Expense", purchase: "Expense", debit: "Expense", withdrawal: "Expense", payment: "Expense", charge: "Expense",
  check: "Check", cheque: "Check", deposit: "Deposit", credit: "Deposit", income: "Deposit",
  transfer: "Transfer", creditcardcredit: "CreditCardCredit", refund: "CreditCardCredit", cardcredit: "CreditCardCredit",
  // QuickBooks register wording
  creditcardpmt: "Transfer", creditcardpayment: "Transfer", ccpayment: "Transfer", cardpayment: "Transfer",
  billpayment: "BillPayment", billpaymentcheck: "BillPayment", billpmtcheck: "BillPayment", billpmt: "BillPayment",
};
export const normType = (s?: string) => (s ? TYPE_ALIASES[s.toLowerCase().replace(/[^a-z]/g, "")] || s : "");
const money2 = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Unpaid bills of a vendor that this payment covers: one bill with the same amount, or the oldest bills adding up to it. */
function matchBills(c: BuildCtx, vendorId: string, vendorName: string, amt: number) {
  const all = (c.openBills?.get(vendorId) || []).filter((b) => !c.usedBills?.has(b.id)).sort((a, b) => a.date.localeCompare(b.date));
  const eq = (x: number) => Math.abs(x - amt) < 0.005;
  let pick = all.filter((b) => eq(b.balance)).slice(0, 1);
  if (!pick.length) {
    let sum = 0;
    for (let i = 0; i < all.length; i++) { sum = r2(sum + all[i].balance); if (eq(sum)) { pick = all.slice(0, i + 1); break; } if (sum > amt) break; }
  }
  if (!pick.length) {
    if (!all.length) throw new Error(`${vendorName} has no unpaid bill in QuickBooks for this payment. Enter the bill first, or change the type to Expense.`);
    throw new Error(`No unpaid bill of ${vendorName} matches ${money2(amt)}. Unpaid: ${all.slice(0, 4).map((b) => `${b.docNumber ? "no. " + b.docNumber + " " : ""}${money2(b.balance)}`).join(", ")}${all.length > 4 ? "…" : ""}.`);
  }
  pick.forEach((b) => c.usedBills?.add(b.id));
  return pick;
}

function bankStatement(rows: Vals[], c: BuildCtx): Built {
  const v = rows[0];
  const n = signed(v, c, false);
  const amt = r2(Math.abs(n));
  const bank = ref(c, "Account", v.bankAccount)!;
  const cat = ref(c, "Account", v.category);
  let type = normType(v.type);
  const catType = cat ? c.r.accountType(cat.value) : "";
  if (!type) type = catType === "Bank" || catType === "Credit Card" ? "Transfer" : n > 0 ? "Deposit" : v.checkNo ? "Check" : "Expense";
  // the money direction wins: money in is never an expense, money out is never a deposit
  if (type === "Expense" && n > 0) type = "Deposit";
  if (type === "Deposit" && n < 0) type = "Expense";
  const memo = [v.description, v.memo].filter(Boolean).join(" — ").slice(0, 4000) || undefined;
  const base = clean({ TxnDate: v.date, PrivateNote: memo, DepartmentRef: R_(ref(c, "Department", v.location)) });
  if (type === "Transfer") {
    const [from, to] = n < 0 ? [bank, cat] : [cat, bank];
    return { entity: "Transfer", label: "Transfer", body: { ...base, Amount: amt, FromAccountRef: R_(from), ToAccountRef: R_(to) } };
  }
  if (type === "BillPayment") {
    const vendor = ref(c, "Name", v.payee, "Vendor");
    if (!vendor || vendor.kind !== "Vendor") throw new Error("A bill payment needs the vendor in Payee.");
    const bills = matchBills(c, vendor.value, vendor.name, amt);
    const left = { v: amt };
    return {
      entity: "BillPayment", label: "Bill payment",
      body: clean({
        ...base, DepartmentRef: undefined, VendorRef: R_(vendor), PayType: "Check", TotalAmt: amt,
        DocNumber: c.settings.useFileRefNo && v.checkNo ? v.checkNo.slice(0, 21) : undefined,
        CheckPayment: { BankAccountRef: R_(bank), PrintStatus: "NotSet" },
        Line: bills.map((b) => { const a = r2(Math.min(b.balance, left.v)); left.v = r2(left.v - a); return { Amount: a, LinkedTxn: [{ TxnId: b.id, TxnType: "Bill" }] }; }),
      }),
    };
  }
  if (type === "Deposit") {
    return {
      entity: "Deposit", label: "Deposit",
      body: { ...base, DepositToAccountRef: R_(bank), Line: [clean({ Amount: amt, DetailType: "DepositLineDetail", Description: (v.description || v.memo || "").slice(0, 4000) || undefined, DepositLineDetail: clean({ AccountRef: R_(cat), Entity: partyRef(c, v, "Customer"), ClassRef: R_(ref(c, "Class", v.className)), CheckNum: v.checkNo || undefined }) })] },
    };
  }
  const isCheck = type === "Check";
  return {
    entity: "Purchase", label: isCheck ? "Check" : "Expense",
    body: clean({
      ...base, PaymentType: isCheck ? "Check" : "Cash", AccountRef: R_(bank), EntityRef: partyRef(c, v, "Vendor"),
      DocNumber: c.settings.useFileRefNo && v.checkNo ? v.checkNo.slice(0, 21) : undefined,
      Line: [expenseLine({ ...v, item: "", description: v.description || v.memo || "" }, c, amt)],
    }),
  };
}

function cardStatement(rows: Vals[], c: BuildCtx): Built {
  const v = rows[0];
  const n = signed(v, c, true); // positive = a charge on the card
  const amt = r2(Math.abs(n));
  const card = ref(c, "Account", v.ccAccount)!;
  const cat = ref(c, "Account", v.category);
  let type = normType(v.type);
  const catType = cat ? c.r.accountType(cat.value) : "";
  if (!type) type = n < 0 && catType === "Bank" ? "Transfer" : n < 0 ? "CreditCardCredit" : "Expense";
  const memo = [v.description, v.memo].filter(Boolean).join(" — ").slice(0, 4000) || undefined;
  const base = clean({ TxnDate: v.date, PrivateNote: memo, DepartmentRef: R_(ref(c, "Department", v.location)) });
  if (type === "Transfer") {
    const bank = ref(c, "Account", v.bankAccount) || cat;
    return { entity: "Transfer", label: "Card payment", body: { ...base, Amount: amt, FromAccountRef: R_(bank), ToAccountRef: R_(card) } };
  }
  return {
    entity: "Purchase", label: type === "CreditCardCredit" ? "Card credit" : "Card expense",
    body: clean({ ...base, PaymentType: "CreditCard", Credit: type === "CreditCardCredit" ? true : undefined, AccountRef: R_(card), EntityRef: partyRef(c, v, "Vendor"), Line: [expenseLine({ ...v, item: "" }, c, amt)] }),
  };
}

function statementCheck(rows: Vals[], c: BuildCtx, cc: boolean): Issue[] {
  const v = rows[0];
  const out: Issue[] = [];
  if (v.amount == null && v.debit == null && v.credit == null) out.push({ field: "amount", level: "error", msg: "Amount is missing" });
  else if (signed(v, c, cc) === 0) out.push({ field: "amount", level: "error", msg: "Amount is 0" });
  const t = normType(v.type);
  if (t === "BillPayment" && !cc) {
    if (!v.payee) out.push({ field: "payee", level: "error", msg: "A bill payment needs the vendor in Payee" });
    return out;
  }
  if (!v.category && !(t === "Transfer" && v.bankAccount && cc)) out.push({ field: "category", level: "error", msg: "Choose an account (category) — or add a bank rule that sets it" });
  const ok = cc ? ["Expense", "Transfer", "CreditCardCredit"] : ["Expense", "Check", "Deposit", "Transfer", "BillPayment"];
  if (t && !ok.includes(t))
    out.push({ field: "type", level: "error", msg: `Transaction type “${v.type}” cannot come from a ${cc ? "card" : "bank"} line here. Use ${cc ? "Expense, CreditCardCredit or Transfer" : "Expense, Check, Deposit, Transfer or Bill Payment"}.` });
  return out;
}

// ---------------------------------------------------------------- catalog
export const ENTITIES: EntityDef[] = [
  // ======================= Banking
  {
    key: "bank-statement", label: "Bank statement", group: "Banking", sheetNames: ["Bank Statement", "Bank Transactions"],
    description: "Bank lines become expenses, checks, deposits or transfers, posted to the bank account you choose.",
    sign: { pos: "Money in (deposit)", neg: "Money out (expense)" },
    fields: [
      D("date", "Date", ["Transaction Date", "Posting Date", "Posted Date", "Value Date", "Txn Date", "Trans Date"], { required: true }),
      T("description", "Description", ["Details", "Narration", "Transaction Details", "Particulars", "Transaction Description", "Bank Description", "Memo", "Memo/Description", "Bank Memo"], { max: 4000 }),
      R("payee", "Payee", "Name", ["Name", "Merchant", "Vendor", "Customer", "Received From", "Paid To", "Payee Name"]),
      R("category", "Account", "Account", ["Category", "Category Account", "Expense Account", "Income Account", "GL Account", "Split", "Account Name"]),
      N("amount", "Amount", ["Transaction Amount", "Net Amount", "Amt"], { required: "one-of" }),
      N("debit", "Debit Amount", ["Debit", "Payment", "Payments", "Withdrawal", "Withdrawals", "Withdrawal Amount", "Money Out", "Paid Out", "Debits", "Spent"], { required: "one-of" }),
      N("credit", "Credit Amount", ["Credit", "Deposit", "Deposits", "Deposit Amount", "Money In", "Paid In", "Receipts", "Credits", "Received"], { required: "one-of" }),
      T("checkNo", "Check No", ["Check Number", "Cheque No", "Check #", "Check or Slip #", "Check or Slip", "Check/Serial #", "Serial #", "Check Serial", "Ref No", "Reference", "Reference No", "Cheque Number"], { max: 21 }),
      T("type", "Transaction Type", ["Type"], { options: ["Expense", "Check", "Deposit", "Transfer", "Bill Payment"] }),
      R("bankAccount", "Bank Account", "Account", ["Bank", "Bank Account Name"], { required: true, help: "Usually the same for the whole file: pick it once on the mapping screen." }),
      CLASS, LOCATION, T("memo", "Notes", ["Private Note", "Internal Note", "Note"], { max: 4000 }),
    ],
    build: bankStatement,
    check: (rows, c) => statementCheck(rows, c, false),
  },
  {
    key: "card-statement", label: "Credit card statement", group: "Banking", sheetNames: ["CreditCardStatement", "Credit Card Statement"],
    description: "Card charges become expenses, refunds become card credits, payments become transfers from the bank.",
    sign: { pos: "A charge (money spent)", neg: "A payment or refund" },
    fields: [
      D("date", "Date", ["Transaction Date", "Posting Date", "Posted Date", "Trans Date"], { required: true }),
      T("description", "Description", ["Details", "Merchant Description", "Transaction Details", "Memo", "Memo/Description"], { max: 4000 }),
      R("payee", "Payee", "Name", ["Name", "Merchant", "Vendor"]),
      N("amount", "Amount", ["Transaction Amount"], { required: "one-of" }),
      N("debit", "Charge Amount", ["Debit", "Debit Amount", "Charges", "Purchases"], { required: "one-of" }),
      N("credit", "Payment / Credit Amount", ["Credit", "Credit Amount", "Payments", "Credits"], { required: "one-of" }),
      R("category", "Category Account", "Account", ["Account", "Category", "Expense Account", "GL Account"]),
      T("type", "Transaction Type", ["Type"], { options: ["Expense", "CreditCardCredit", "Transfer"] }),
      R("bankAccount", "Bank Account", "Account", ["Paid From Bank"], { help: "Bank account used for card payments (transfers)." }),
      R("ccAccount", "Credit Card Account", "Account", ["Card Account", "Credit Card"], { required: true, help: "Usually the same for the whole file." }),
      CLASS, LOCATION, T("memo", "Notes", ["Private Note", "Internal Note", "Note"], { max: 4000 }),
    ],
    build: cardStatement,
    check: (rows, c) => statementCheck(rows, c, true),
  },
  {
    key: "expenses", label: "Expenses", group: "Banking", sheetNames: ["Expenses", "Expense"], groupBy: "docNumber",
    description: "Expenses paid from a bank or credit card account. Rows with the same Ref No become one expense.",
    fields: [
      T("docNumber", "Ref No", ["Reference No", "Expense No", "Ref #"], { max: 21 }),
      R("account", "Account", "Account", ["Payment Account", "Bank/Credit Account", "Paid From", "Bank Account"], { required: true }),
      R("payee", "Payee", "Name", ["Vendor", "Name"]),
      MEMO, D("date", "Payment Date", ["Date", "Expense Date", "Txn Date"], { required: true }),
      R("paymentMethod", "Payment Method", "PaymentMethod"),
      LOCATION, ...CURRENCY, ...EXP_LINES,
    ],
    check: (rows) => linesNeed(rows, "either"),
    build: (rows, c) => {
      const v = rows[0];
      const acct = ref(c, "Account", v.account)!;
      return {
        entity: "Purchase", label: "Expense",
        body: clean({ ...common(v, c), PaymentType: c.r.accountType(acct.value) === "Credit Card" ? "CreditCard" : "Cash", AccountRef: R_(acct), EntityRef: partyRef(c, v), PaymentMethodRef: R_(ref(c, "PaymentMethod", v.paymentMethod)), Line: rows.map((x) => expenseLine(x, c)) }),
      };
    },
  },
  {
    key: "checks", label: "Checks", group: "Banking", sheetNames: ["Checks", "Check"], groupBy: "docNumber",
    description: "Checks written from a bank account. Rows with the same check number become one check.",
    fields: [
      T("docNumber", "Check no", ["Check Number", "Check #", "Cheque No"], { max: 21 }),
      R("account", "Bank Account", "Account", ["Account", "Bank"], { required: true }),
      R("payee", "Payee", "Name", ["Vendor", "Name", "Pay to the order of"]),
      D("date", "Payment Date", ["Date", "Check Date"], { required: true }),
      T("address1", "Mailing Address Line 1", ["Mailing Address"]), MEMO, LOCATION, ...EXP_LINES,
    ],
    check: (rows) => linesNeed(rows, "either"),
    build: (rows, c) => {
      const v = rows[0];
      return { entity: "Purchase", label: "Check", body: clean({ ...common(v, c), PaymentType: "Check", AccountRef: R_(ref(c, "Account", v.account)), EntityRef: partyRef(c, v), Line: rows.map((x) => expenseLine(x, c)) }) };
    },
  },
  {
    key: "card-credits", label: "Credit card credits", group: "Banking", sheetNames: ["Credit Card Credits", "Credit Card Credit"], groupBy: "docNumber",
    description: "Refunds and credits received on a credit card.",
    fields: [
      T("docNumber", "Ref No", ["Reference No"], { max: 21 }),
      R("account", "Account", "Account", ["Credit Card Account", "Card Account"], { required: true }),
      R("payee", "Payee", "Name", ["Vendor", "Name"]), MEMO,
      D("date", "Payment Date", ["Date"], { required: true }), LOCATION, ...EXP_LINES,
    ],
    check: (rows) => linesNeed(rows, "either"),
    build: (rows, c) => {
      const v = rows[0];
      return { entity: "Purchase", label: "Card credit", body: clean({ ...common(v, c), PaymentType: "CreditCard", Credit: true, AccountRef: R_(ref(c, "Account", v.account)), EntityRef: partyRef(c, v), Line: rows.map((x) => expenseLine(x, c)) }) };
    },
  },
  {
    key: "deposits", label: "Deposits", group: "Banking", sheetNames: ["Deposits", "Deposit"], groupBy: "docNumber",
    description: "Bank deposits. Rows with the same Deposit No become one deposit with several lines.",
    fields: [
      T("docNumber", "Deposit No", ["Deposit Number", "Ref No"]),
      D("date", "Date", ["Deposit Date"], { required: true }),
      R("account", "Deposit To Account", "Account", ["Deposit To", "Bank Account", "Account"], { required: true }),
      L(R("payee", "Received From", "Name", ["Customer", "Payer", "Name"], { prefer: "Customer" })),
      L(R("category", "Line Account", "Account", ["From Account", "Income Account", "Category"], { required: true })),
      L(T("description", "Line Description", ["Description"])),
      L(R("paymentMethod", "Line Payment Method", "PaymentMethod", ["Payment Method"])),
      L(T("checkNo", "Line Ref No", ["Check No", "Ref No (Line)"], { max: 20 })),
      L(N("amount", "Line Amount", ["Amount"], { required: true })),
      L(R("className", "Line Class", "Class", ["Class"])),
      MEMO, LOCATION,
    ],
    build: (rows, c) => {
      const v = rows[0];
      return {
        entity: "Deposit", label: "Deposit",
        body: clean({
          ...common(v, c), DocNumber: undefined, DepositToAccountRef: R_(ref(c, "Account", v.account)),
          Line: rows.map((x) => clean({ Amount: r2(num(x.amount) || 0), DetailType: "DepositLineDetail", Description: x.description || undefined, DepositLineDetail: clean({ AccountRef: R_(ref(c, "Account", x.category)), Entity: partyRef(c, x, "Customer"), PaymentMethodRef: R_(ref(c, "PaymentMethod", x.paymentMethod)), CheckNum: x.checkNo || undefined, ClassRef: R_(ref(c, "Class", x.className)) }) })),
        }),
      };
    },
  },
  {
    key: "transfers", label: "Transfers", group: "Banking", sheetNames: ["Transfers", "Transfer"],
    description: "Money moved between two of the company's accounts.",
    fields: [
      R("from", "Transfer Funds From", "Account", ["From Account", "From"], { required: true }),
      R("to", "Transfer Funds To", "Account", ["To Account", "To"], { required: true }),
      N("amount", "Transfer Amount", ["Amount"], { required: true }),
      MEMO, ...CURRENCY, D("date", "Date", ["Transfer Date"], { required: true }),
    ],
    build: (rows, c) => {
      const v = rows[0];
      return { entity: "Transfer", label: "Transfer", body: clean({ TxnDate: v.date, PrivateNote: v.memo || undefined, Amount: r2(Math.abs(num(v.amount) || 0)), FromAccountRef: R_(ref(c, "Account", v.from)), ToAccountRef: R_(ref(c, "Account", v.to)), CurrencyRef: v.currency ? { value: v.currency } : undefined, ExchangeRate: num(v.exchangeRate) ?? undefined }) };
    },
  },
  {
    key: "card-payments", label: "Credit card payments", group: "Banking", sheetNames: ["Pay down Credit card", "Pay down Credit Card", "Credit Card Payments"],
    description: "Payments from a bank account to a credit card (recorded as a transfer).",
    fields: [
      R("ccAccount", "Credit Card Account", "Account", ["Card Account"], { required: true }),
      R("payee", "Payee", "Name", ["Vendor"]),
      N("amount", "Amount", ["Payment Amount"], { required: true }),
      D("date", "Date", ["Payment Date"], { required: true }),
      R("bankAccount", "Bank Account", "Account", ["Paid From", "Bank"], { required: true }),
      MEMO,
    ],
    build: (rows, c) => {
      const v = rows[0];
      return { entity: "Transfer", label: "Card payment", body: clean({ TxnDate: v.date, PrivateNote: [v.memo, v.payee].filter(Boolean).join(" — ") || undefined, Amount: r2(Math.abs(num(v.amount) || 0)), FromAccountRef: R_(ref(c, "Account", v.bankAccount)), ToAccountRef: R_(ref(c, "Account", v.ccAccount)) }) };
    },
  },

  // ======================= Purchases
  {
    key: "bills", label: "Bills", group: "Purchases", sheetNames: ["Bills", "Bill"], groupBy: "docNumber",
    description: "Vendor bills, with expense-account lines or product/service lines. Rows with the same Bill No become one bill.",
    fields: [
      T("docNumber", "Bill No", ["Bill Number", "Invoice No", "Ref No", "Vendor Invoice"], { max: 21 }),
      R("vendor", "Vendor", "Vendor", ["Supplier", "Vendor Name", "Payee"], { required: true }),
      D("date", "Bill Date", ["Date", "Invoice Date"], { required: true }),
      D("dueDate", "Due Date"), R("terms", "Terms", "Term"),
      T("address1", "Mailing Address Line 1", ["Mailing Address"]), MEMO,
      R("apAccount", "A/P Account", "Account", ["AP Account", "Accounts Payable"]),
      LOCATION, ...CURRENCY, ...EXP_LINES,
    ],
    check: (rows) => linesNeed(rows, "either"),
    build: (rows, c) => {
      const v = rows[0];
      return { entity: "Bill", label: "Bill", body: clean({ ...common(v, c), VendorRef: R_(ref(c, "Vendor", v.vendor)), DueDate: v.dueDate || undefined, SalesTermRef: R_(ref(c, "Term", v.terms)), APAccountRef: R_(ref(c, "Account", v.apAccount)), Line: rows.map((x) => expenseLine(x, c)) }) };
    },
  },
  {
    key: "bill-payments", label: "Bill payments", group: "Purchases", sheetNames: ["Bill Payments", "Bill Payment"], groupBy: "docNumber",
    description: "Payments of open bills. Each row names the bill being paid; rows with the same Ref No become one payment.",
    docLookups: [{ type: "Bill", field: "billNo", party: "vendor" }],
    fields: [
      T("docNumber", "Ref No", ["Payment No", "Check No"], { max: 21 }),
      R("vendor", "Vendor", "Vendor", ["Payee"], { required: true }),
      D("date", "Payment Date", ["Date"], { required: true }),
      R("account", "Bank or CC Account", "Account", ["Payment Account", "Bank Account", "Account"], { required: true }),
      MEMO, L(T("billNo", "Bill No", ["Bill Number", "Bill Ref"])),
      L(N("amount", "Amount", ["Payment Amount", "Amount Paid"], { required: true })),
      ...CURRENCY, T("printStatus", "Print Status"),
    ],
    build: (rows, c) => {
      const v = rows[0];
      const acct = ref(c, "Account", v.account)!;
      const vendor = ref(c, "Vendor", v.vendor)!;
      const cc = c.r.accountType(acct.value) === "Credit Card";
      const lines = rows.map((x) => {
        const bill = x.billNo ? (c.docs.get(`Bill|${x.billNo.toLowerCase()}`) || []).find((b) => !b.party || b.party === vendor.value) : undefined;
        if (x.billNo && !bill) throw new Error(`Bill ${x.billNo} for ${vendor.name} was not found in QuickBooks`);
        return clean({ Amount: r2(num(x.amount) || 0), LinkedTxn: bill ? [{ TxnId: bill.id, TxnType: "Bill" }] : undefined });
      });
      return {
        entity: "BillPayment", label: "Bill payment",
        body: clean({ ...common(v, c), VendorRef: R_(vendor), PayType: cc ? "CreditCard" : "Check", TotalAmt: sum(rows, (x) => num(x.amount) || 0), ...(cc ? { CreditCardPayment: { CCAccountRef: R_(acct) } } : { CheckPayment: { BankAccountRef: R_(acct), PrintStatus: v.printStatus === "1" || /need/i.test(v.printStatus || "") ? "NeedToPrint" : "NotSet" } }), Line: lines }),
      };
    },
  },
  {
    key: "vendor-credits", label: "Vendor credits", group: "Purchases", sheetNames: ["Vendor Credits", "Vendor Credit"], groupBy: "docNumber",
    description: "Credits received from vendors.",
    fields: [
      T("docNumber", "Ref No", ["Credit No"], { max: 21 }),
      R("vendor", "Vendor", "Vendor", [], { required: true }),
      T("address1", "Mailing Address Line 1"), D("date", "Payment Date", ["Date", "Credit Date"], { required: true }),
      MEMO, LOCATION, ...EXP_LINES,
    ],
    check: (rows) => linesNeed(rows, "either"),
    build: (rows, c) => {
      const v = rows[0];
      return { entity: "VendorCredit", label: "Vendor credit", body: clean({ ...common(v, c), VendorRef: R_(ref(c, "Vendor", v.vendor)), Line: rows.map((x) => expenseLine(x, c)) }) };
    },
  },
  {
    key: "purchase-orders", label: "Purchase orders", group: "Purchases", sheetNames: ["Purchase Orders", "Purchase Order"], groupBy: "docNumber",
    description: "Purchase orders to vendors. Rows with the same PO No become one purchase order.",
    fields: [
      T("docNumber", "PO No", ["PO Number", "Purchase Order No"], { max: 21 }),
      R("vendor", "Vendor", "Vendor", [], { required: true }),
      D("date", "Purchase Order Date", ["Date", "PO Date"], { required: true }),
      T("address1", "Mailing Address Line 1"), T("ship1", "Shipping Address Line 1"), MEMO, LOCATION, ...EXP_LINES,
    ],
    check: (rows) => linesNeed(rows, "either"),
    build: (rows, c) => {
      const v = rows[0];
      return { entity: "PurchaseOrder", label: "Purchase order", body: clean({ ...common(v, c), VendorRef: R_(ref(c, "Vendor", v.vendor)), ShipAddr: v.ship1 ? { Line1: v.ship1 } : undefined, Line: rows.map((x) => expenseLine(x, c)) }) };
    },
  },

  // ======================= Sales
  ...salesDocs(),
  {
    key: "receive-payments", label: "Receive payments", group: "Sales", sheetNames: ["Receive Payment", "Receive Payments", "Payments"], groupBy: "docNumber",
    description: "Customer payments, applied to the invoice named on each row. Rows with the same Ref No become one payment.",
    docLookups: [{ type: "Invoice", field: "invoiceNo", party: "customer" }],
    fields: [
      T("docNumber", "Ref No", ["Payment No"], { max: 21 }),
      D("date", "Payment Date", ["Date"], { required: true }),
      R("customer", "Customer", "Customer", [], { required: true }),
      R("paymentMethod", "Payment method", "PaymentMethod", ["Payment Method"]),
      R("account", "Deposit To Account Name", "Account", ["Deposit To", "Deposit To Account"]),
      L(T("invoiceNo", "Invoice No", ["Invoice Number"])),
      L(N("amount", "Amount", ["Payment Amount"], { required: true })),
      T("refNo", "Reference No", ["Check No", "Payment Reference"], { max: 21 }), MEMO,
    ],
    build: (rows, c) => {
      const v = rows[0];
      const cust = ref(c, "Customer", v.customer)!;
      const lines = rows.filter((x) => x.invoiceNo).map((x) => {
        const inv = (c.docs.get(`Invoice|${x.invoiceNo.toLowerCase()}`) || []).find((b) => !b.party || b.party === cust.value);
        if (!inv) throw new Error(`Invoice ${x.invoiceNo} for ${cust.name} was not found in QuickBooks`);
        return { Amount: r2(num(x.amount) || 0), LinkedTxn: [{ TxnId: inv.id, TxnType: "Invoice" }] };
      });
      return { entity: "Payment", label: "Payment", body: clean({ TxnDate: v.date, PrivateNote: v.memo || undefined, CustomerRef: R_(cust), TotalAmt: sum(rows, (x) => num(x.amount) || 0), PaymentMethodRef: R_(ref(c, "PaymentMethod", v.paymentMethod)), DepositToAccountRef: R_(ref(c, "Account", v.account)), PaymentRefNum: v.refNo || (c.settings.useFileRefNo ? v.docNumber : undefined), Line: lines.length ? lines : undefined }) };
    },
  },

  // ======================= Accounting
  journal("journal-entries", "Journal entries", ["Journal Entries", "Journal Entry", "Journals"], false),
  journal("trial-balance", "Trial balance", ["Trial Balance"], true),
  {
    key: "time-activities", label: "Time activities", group: "Accounting", sheetNames: ["Time Activities", "Time Activity", "Timesheets"],
    description: "Hours worked by employees or vendors, optionally billable to a customer.",
    fields: [
      R("payee", "Name", "Name", ["Employee", "Worker"], { required: true, prefer: "Employee" }),
      D("date", "Date", [], { required: true }),
      N("hours", "Hours"), N("minutes", "Minutes"), T("description", "Description", [], { max: 4000 }),
      R("item", "Service", "Item", ["Product/Service"]), N("rate", "Hourly Rate", ["Rate"]),
      B("taxable", "Taxable"), R("customer", "Customer", "Customer", ["Customer/Project"]), CLASS, LOCATION,
    ],
    check: (rows) => (rows[0].hours || rows[0].minutes ? [] : [{ field: "hours", level: "error", msg: "Hours or minutes are required" }]),
    build: (rows, c) => {
      const v = rows[0];
      const who = ref(c, "Name", v.payee, "Employee")!;
      const cust = ref(c, "Customer", v.customer);
      return {
        entity: "TimeActivity", label: "Time activity",
        body: clean({ TxnDate: v.date, NameOf: who.kind === "Vendor" ? "Vendor" : "Employee", [who.kind === "Vendor" ? "VendorRef" : "EmployeeRef"]: R_(who), Hours: Math.trunc(num(v.hours) || 0), Minutes: Math.trunc(num(v.minutes) || 0), Description: v.description || undefined, ItemRef: R_(ref(c, "Item", v.item)), HourlyRate: num(v.rate) ?? undefined, Taxable: v.taxable ? yes(v.taxable) : undefined, CustomerRef: R_(cust), BillableStatus: cust ? (v.rate ? "Billable" : "NotBillable") : undefined, ClassRef: R_(ref(c, "Class", v.className)), DepartmentRef: R_(ref(c, "Department", v.location)) }),
      };
    },
  },

  // ======================= Lists
  {
    key: "customers", label: "Customers", group: "Lists", sheetNames: ["Customers", "Customer"], list: { kind: "Customer", nameField: "displayName" },
    description: "New customers, with contact details and addresses.",
    fields: [
      T("displayName", "Display Name As", ["Display Name", "Customer", "Customer Name", "Name"], { required: true, max: 500 }),
      T("title", "Title"), T("company", "Company", ["Company Name"]), T("first", "First Name"), T("middle", "Middle Name"), T("last", "Last Name"), T("suffix", "Suffix"),
      T("printOnCheck", "Print On Check As"), ...ADDR("bill", "Billing"), ...ADDR("ship", "Shipping"),
      T("phone", "Phone"), T("mobile", "Mobile"), T("fax", "Fax"), T("other", "Other"), T("website", "Website"), T("email", "Email"),
      R("terms", "Terms", "Term"), R("paymentMethod", "Preferred Payment Method", "PaymentMethod"), T("resaleNo", "Tax Resale No"),
      B("billWithParent", "Bill With Parent"), R("parent", "Parent Customer", "Customer"),
      N("openingBalance", "Opening Balance"), D("openingDate", "Open Balance Date", ["Opening Balance Date"]),
      T("notes", "Notes"), B("taxable", "Customer Taxable", ["Taxable"]), T("currency", "Currency Code"),
    ],
    build: (rows, c) => {
      const v = rows[0];
      const parent = ref(c, "Customer", v.parent);
      return {
        entity: "Customer", label: "Customer",
        body: clean({
          DisplayName: v.displayName, Title: v.title, CompanyName: v.company, GivenName: v.first, MiddleName: v.middle, FamilyName: v.last, Suffix: v.suffix, PrintOnCheckName: v.printOnCheck,
          BillAddr: addr(v, "bill"), ShipAddr: addr(v, "ship"), PrimaryPhone: v.phone ? { FreeFormNumber: v.phone } : undefined, Mobile: v.mobile ? { FreeFormNumber: v.mobile } : undefined,
          Fax: v.fax ? { FreeFormNumber: v.fax } : undefined, AlternatePhone: v.other ? { FreeFormNumber: v.other } : undefined, WebAddr: v.website ? { URI: v.website } : undefined,
          PrimaryEmailAddr: v.email ? { Address: v.email } : undefined, SalesTermRef: R_(ref(c, "Term", v.terms)), PaymentMethodRef: R_(ref(c, "PaymentMethod", v.paymentMethod)),
          ResaleNum: v.resaleNo, ParentRef: R_(parent), Job: parent ? true : undefined, BillWithParent: parent ? yes(v.billWithParent) : undefined,
          Balance: num(v.openingBalance) || undefined, OpenBalanceDate: num(v.openingBalance) ? v.openingDate || undefined : undefined,
          Notes: v.notes, Taxable: v.taxable ? yes(v.taxable) : undefined, CurrencyRef: v.currency ? { value: v.currency } : undefined,
        }),
      };
    },
  },
  {
    key: "vendors", label: "Vendors", group: "Lists", sheetNames: ["Vendors", "Vendor", "Suppliers"], list: { kind: "Vendor", nameField: "displayName" },
    description: "New vendors, with contact details, tax ID and 1099 tracking.",
    fields: [
      T("displayName", "Display Name As", ["Display Name", "Vendor", "Vendor Name", "Name"], { required: true, max: 500 }),
      T("title", "Title"), T("first", "First Name"), T("middle", "Middle Name"), T("last", "Last Name"), T("suffix", "Suffix"), T("company", "Company", ["Company Name"]),
      T("printOnCheck", "Print On Check As"), ...ADDR("bill", "Billing"), T("notes", "Notes"), T("email", "Email"), T("phone", "Phone"), T("mobile", "Mobile"),
      T("fax", "Fax"), T("other", "Other"), T("website", "Website"), R("terms", "Terms", "Term"), N("openingBalance", "Opening Balance"),
      T("accountNo", "Account no", ["Account Number"]), T("taxId", "Tax ID", ["EIN", "SSN/EIN"]), B("is1099", "Track payments for 1099", ["1099"]), T("currency", "Currency Code"),
    ],
    build: (rows, c) => {
      const v = rows[0];
      return {
        entity: "Vendor", label: "Vendor",
        body: clean({
          DisplayName: v.displayName, Title: v.title, GivenName: v.first, MiddleName: v.middle, FamilyName: v.last, Suffix: v.suffix, CompanyName: v.company, PrintOnCheckName: v.printOnCheck,
          BillAddr: addr(v, "bill"), PrimaryEmailAddr: v.email ? { Address: v.email } : undefined, PrimaryPhone: v.phone ? { FreeFormNumber: v.phone } : undefined,
          Mobile: v.mobile ? { FreeFormNumber: v.mobile } : undefined, Fax: v.fax ? { FreeFormNumber: v.fax } : undefined, AlternatePhone: v.other ? { FreeFormNumber: v.other } : undefined,
          WebAddr: v.website ? { URI: v.website } : undefined, TermRef: R_(ref(c, "Term", v.terms)), AcctNum: v.accountNo, TaxIdentifier: v.taxId,
          Vendor1099: v.is1099 ? yes(v.is1099) : undefined, CurrencyRef: v.currency ? { value: v.currency } : undefined,
          Balance: num(v.openingBalance) || undefined,
        }),
      };
    },
  },
  {
    key: "employees", label: "Employees", group: "Lists", sheetNames: ["Employee", "Employees"], list: { kind: "Employee", nameField: "displayName" },
    description: "Employees (for time tracking and expenses; payroll setup stays in QuickBooks Payroll).",
    fields: [
      T("title", "Title"), T("first", "First Name", [], { required: true }), T("middle", "Middle Name"), T("last", "Last Name", [], { required: true }), T("suffix", "Suffix"),
      T("displayName", "Display Name As", ["Display Name", "Name"]), T("printOnCheck", "Print On Check As"),
      T("addr1", "Address Line 1"), T("addr2", "Address Line 2"), T("addrCity", "Address City"), T("addrPostal", "Address Postal Code"), T("addrCountry", "Address Country"), T("addrState", "Address State"),
      T("ssn", "SSN"), T("employeeNo", "Employee No", ["Employee Number"]), T("email", "Email"), T("phone", "Phone"), T("mobile", "Mobile"),
      B("billable", "Billable Time"), N("billRate", "Billing Rate"), T("gender", "Gender"), D("hired", "Hired Date", ["Hire Date"]), D("released", "Released Date"), D("birth", "Birth Date", ["Date of Birth"]),
    ],
    build: (rows) => {
      const v = rows[0];
      return {
        entity: "Employee", label: "Employee",
        body: clean({
          Title: v.title, GivenName: v.first, MiddleName: v.middle, FamilyName: v.last, Suffix: v.suffix, DisplayName: v.displayName || [v.first, v.last].filter(Boolean).join(" "),
          PrintOnCheckName: v.printOnCheck, PrimaryAddr: addr(v, "addr"), SSN: v.ssn, EmployeeNumber: v.employeeNo, PrimaryEmailAddr: v.email ? { Address: v.email } : undefined,
          PrimaryPhone: v.phone ? { FreeFormNumber: v.phone } : undefined, Mobile: v.mobile ? { FreeFormNumber: v.mobile } : undefined, BillableTime: v.billable ? yes(v.billable) : undefined,
          BillRate: num(v.billRate) ?? undefined, Gender: v.gender, HiredDate: v.hired, ReleasedDate: v.released, BirthDate: v.birth,
        }),
      };
    },
  },
  {
    key: "items", label: "Products & services", group: "Lists", sheetNames: ["Items", "Products", "Products and Services"], list: { kind: "Item", nameField: "name" },
    description: "Inventory, non-inventory and service items with their accounts.",
    fields: [
      T("name", "Name", ["Item Name", "Product/Service", "Product Name"], { required: true, max: 100 }),
      T("type", "Type", ["Item Type"], { required: true, options: ["Inventory", "NonInventory", "Service"] }),
      T("sku", "SKU"), N("price", "Price/Rate", ["Sales Price", "Price", "Rate"]), T("salesDesc", "Sales Description", ["Description"]), B("taxable", "Taxable"),
      T("purchaseDesc", "Purchase Description"), N("cost", "Cost", ["Purchase Cost"]),
      R("incomeAccount", "Income Account", "Account"), R("expenseAccount", "Expense Account", "Account", ["COGS Account"]),
      R("assetAccount", "Inventory Asset Account", "Account", ["Asset Account"]),
      N("qtyOnHand", "Initial Quantity On Hand", ["Quantity On Hand", "Qty On Hand"]), D("asOf", "As Of Date", ["Inventory Start Date"]),
      B("salesTaxIncluded", "Sales Tax Included"), B("purchaseTaxIncluded", "Purchase Tax Included"),
    ],
    check: (rows) => {
      const v = rows[0], out: Issue[] = [];
      const t = itemType(v.type);
      if (v.type && !t) out.push({ field: "type", level: "error", msg: "Type must be Inventory, NonInventory or Service" });
      if (t === "Inventory") {
        if (!v.incomeAccount) out.push({ field: "incomeAccount", level: "error", msg: "Inventory items need an income account" });
        if (!v.expenseAccount) out.push({ field: "expenseAccount", level: "error", msg: "Inventory items need a cost of goods sold (expense) account" });
        if (!v.assetAccount) out.push({ field: "assetAccount", level: "error", msg: "Inventory items need an inventory asset account" });
        if (!v.asOf) out.push({ field: "asOf", level: "error", msg: "Inventory items need an As Of Date" });
      } else if (t && !v.incomeAccount && !v.expenseAccount) out.push({ field: "incomeAccount", level: "error", msg: "Add an income account (or an expense account for purchase-only items)" });
      return out;
    },
    build: (rows, c) => {
      const v = rows[0];
      const t = itemType(v.type)!;
      return {
        entity: "Item", label: "Product/service",
        body: clean({
          Name: v.name.replace(/:/g, "-").slice(0, 100), Type: t, Sku: v.sku, UnitPrice: num(v.price) ?? undefined, Description: v.salesDesc, Taxable: v.taxable ? yes(v.taxable) : undefined,
          PurchaseDesc: v.purchaseDesc, PurchaseCost: num(v.cost) ?? undefined, IncomeAccountRef: R_(ref(c, "Account", v.incomeAccount)), ExpenseAccountRef: R_(ref(c, "Account", v.expenseAccount)),
          ...(t === "Inventory" ? { TrackQtyOnHand: true, QtyOnHand: num(v.qtyOnHand) ?? 0, InvStartDate: v.asOf, AssetAccountRef: R_(ref(c, "Account", v.assetAccount)) } : {}),
          SalesTaxIncluded: v.salesTaxIncluded ? yes(v.salesTaxIncluded) : undefined, PurchaseTaxIncluded: v.purchaseTaxIncluded ? yes(v.purchaseTaxIncluded) : undefined,
        }),
      };
    },
  },
  {
    key: "accounts", label: "Chart of accounts", group: "Lists", sheetNames: ["Accounts", "Chart of Accounts", "Account"], list: { kind: "Account", nameField: "name" },
    description: "New accounts for the chart of accounts.",
    fields: [
      T("name", "Name", ["Account Name"], { required: true, max: 100 }), T("type", "Account Type", ["Type"], { required: true }), T("subType", "Account Subtype", ["Detail Type", "Subtype"]),
      T("number", "Account Number", ["Number", "Acct No"]), R("parent", "Parent Account", "Account"), T("description", "Description"),
      N("openingBalance", "Opening Balance"), D("openingDate", "Opening Balance Date"), T("currency", "Currency Code"),
    ],
    check: (rows) => {
      const v = rows[0];
      return v.type && !accountType(v.type) ? [{ field: "type", level: "error", msg: `Account type “${v.type}” is not a QuickBooks account type (for example Bank, Expense, Income, Credit Card, Other Current Asset)` }] : [];
    },
    build: (rows, c) => {
      const v = rows[0];
      return { entity: "Account", label: "Account", body: clean({ Name: v.name.replace(/:/g, "-"), AccountType: accountType(v.type), AccountSubType: v.subType ? v.subType.replace(/\s+/g, "") : undefined, AcctNum: v.number, ParentRef: R_(ref(c, "Account", v.parent)), SubAccount: v.parent ? true : undefined, Description: v.description, CurrencyRef: v.currency ? { value: v.currency } : undefined }) };
    },
  },
  {
    key: "classes", label: "Classes", group: "Lists", sheetNames: ["Class", "Classes"], list: { kind: "Class", nameField: "name" },
    description: "Classes, including sub-classes under a parent.",
    fields: [T("name", "Name", ["Class", "Class Name"], { required: true, max: 100 }), R("parent", "Parent Class", "Class")],
    build: (rows, c) => {
      const v = rows[0], p = ref(c, "Class", v.parent);
      return { entity: "Class", label: "Class", body: clean({ Name: v.name, ParentRef: R_(p), SubClass: p ? true : undefined }) };
    },
  },
  {
    key: "locations", label: "Locations", group: "Lists", sheetNames: ["Locations", "Location", "Departments"], list: { kind: "Department", nameField: "name" },
    description: "Locations (departments), including sub-locations.",
    fields: [T("name", "Name", ["Location", "Location Name"], { required: true, max: 100 }), R("parent", "Parent Location", "Department")],
    build: (rows, c) => {
      const v = rows[0], p = ref(c, "Department", v.parent);
      return { entity: "Department", label: "Location", body: clean({ Name: v.name, ParentRef: R_(p), SubDepartment: p ? true : undefined }) };
    },
  },
];

function itemType(s?: string) {
  const k = (s || "").toLowerCase().replace(/[\s-]+/g, "");
  return k === "inventory" ? "Inventory" : k === "noninventory" ? "NonInventory" : k === "service" ? "Service" : null;
}

const ACCOUNT_TYPES = ["Bank", "Other Current Asset", "Fixed Asset", "Other Asset", "Accounts Receivable", "Equity", "Expense", "Other Expense", "Cost of Goods Sold", "Accounts Payable", "Credit Card", "Long Term Liability", "Other Current Liability", "Income", "Other Income"];
function accountType(s?: string) {
  const k = (s || "").toLowerCase().replace(/[^a-z]/g, "");
  const syn: Record<string, string> = { expenses: "Expense", incomes: "Income", revenue: "Income", cogs: "Cost of Goods Sold", ar: "Accounts Receivable", ap: "Accounts Payable", creditcards: "Credit Card", fixedassets: "Fixed Asset" };
  return syn[k] || ACCOUNT_TYPES.find((t) => t.toLowerCase().replace(/[^a-z]/g, "") === k) || null;
}

function salesDocs(): EntityDef[] {
  const kinds: { key: string; label: string; entity: string; sheets: string[]; no: string; date: string; extra: FieldDef[]; desc: string; message?: string }[] = [
    { key: "invoices", label: "Invoices", entity: "Invoice", sheets: ["Invoices", "Invoice"], no: "Invoice No", date: "Invoice Date", desc: "Customer invoices with product/service lines. Rows with the same Invoice No become one invoice.", message: "Message displayed on invoice",
      extra: [D("dueDate", "Due Date"), R("terms", "Terms", "Term")] },
    { key: "estimates", label: "Estimates", entity: "Estimate", sheets: ["Estimates", "Estimate", "Quotes"], no: "Estimate No", date: "Estimate Date", desc: "Customer estimates (quotes).", message: "Message displayed on estimate",
      extra: [D("expiration", "Expiration Date")] },
    { key: "sales-receipts", label: "Sales receipts", entity: "SalesReceipt", sheets: ["Sales Receipts", "Sales Receipt"], no: "Sales Receipt No", date: "Sales Receipt Date", desc: "Sales paid on the spot, deposited to an account.", message: "Message displayed on sales receipt",
      extra: [R("account", "Deposit To", "Account", ["Deposit To Account"]), R("paymentMethod", "Payment Method", "PaymentMethod")] },
    { key: "credit-memos", label: "Credit memos", entity: "CreditMemo", sheets: ["Credit Memos", "Credit Memo"], no: "Credit Memo No", date: "Credit Memo Date", desc: "Credits given to customers.", message: "Message displayed on credit memo",
      extra: [] },
    { key: "refund-receipts", label: "Refund receipts", entity: "RefundReceipt", sheets: ["Refund Receipts", "Refund Receipt"], no: "Refund Receipt No", date: "Refund Receipt date", desc: "Money refunded to customers from a bank account.", message: "Message displayed on refund receipt",
      extra: [R("account", "Refunded From", "Account", ["Refund From", "Bank Account"], { required: true }), R("paymentMethod", "Payment method", "PaymentMethod", ["Payment Method"])] },
  ];
  return kinds.map((k) => ({
    key: k.key, label: k.label, group: "Sales" as const, sheetNames: k.sheets, groupBy: "docNumber", description: k.desc,
    fields: [
      T("docNumber", k.no, ["Number", "Doc Number", "Ref No", `${k.entity} Number`], { max: 21 }),
      R("customer", "Customer", "Customer", ["Customer Name", "Customer/Project", "Bill To"], { required: true }),
      D("date", k.date, ["Date", "Txn Date"], { required: true }),
      ...k.extra,
      T("bill1", "Billing Address Line 1", ["Billing Address"]), T("ship1", "Shipping Address Line 1", ["Shipping Address"]),
      MEMO, T("message", k.message || "Message", ["Customer Message", "Message"]), T("email", "Email", ["Bill Email", "Customer Email"]),
      LOCATION, ...CURRENCY, ...SALES_LINES,
    ],
    check: (rows) => linesNeed(rows, "item"),
    build: (rows, c) => {
      const v = rows[0];
      return {
        entity: k.entity, label: k.label.replace(/s$/, ""),
        body: clean({
          ...common(v, c), CustomerRef: R_(ref(c, "Customer", v.customer)), DueDate: v.dueDate || undefined, SalesTermRef: R_(ref(c, "Term", v.terms)), ExpirationDate: v.expiration || undefined,
          DepositToAccountRef: R_(ref(c, "Account", v.account)), PaymentMethodRef: R_(ref(c, "PaymentMethod", v.paymentMethod)),
          BillAddr: v.bill1 ? { Line1: v.bill1 } : undefined, ShipAddr: v.ship1 ? { Line1: v.ship1 } : undefined,
          CustomerMemo: v.message ? { value: v.message.slice(0, 1000) } : undefined, BillEmail: v.email ? { Address: v.email } : undefined,
          Line: rows.map((x) => salesLine(x, c)),
        }),
      };
    },
  }));
}

function journal(key: string, label: string, sheets: string[], tb: boolean): EntityDef {
  const amt = (v: Vals, c: BuildCtx) => {
    let n = num(v.amount);
    if (n == null) n = Math.abs(num(v.debit) ?? 0) - Math.abs(num(v.credit) ?? 0);
    return c.flip ? -n : n;
  };
  return {
    key, label, group: "Accounting", sheetNames: sheets, groupBy: "docNumber",
    description: tb ? "A trial balance, posted as one balanced journal entry per Trial Balance No." : "Journal entries. Rows with the same Journal No become one entry; debits and credits must balance.",
    sign: { pos: "Debit", neg: "Credit", defaultFlip: tb },
    fields: [
      T("docNumber", tb ? "Trial Balance No" : "Journal No", ["Journal Number", "Entry No", "JE No", "Ref No"], { max: 21 }),
      D("date", tb ? "Date" : "Journal Date", ["Date", "Entry Date"], { required: true }),
      MEMO,
      L(R("account", "Account", "Account", ["Account Name", "GL Account"], { required: true })),
      L(N("amount", tb ? "Amount(credit or debit)" : "Amount", ["Amount", "Net Amount"], { required: "one-of" })),
      L(N("debit", "Debit", ["Debit Amount", "Debits"], { required: "one-of" })),
      L(N("credit", "Credit", ["Credit Amount", "Credits"], { required: "one-of" })),
      L(T("description", "Description", ["Line Description", "Line Memo"], { max: 4000 })),
      L(R("payee", "Name", "Name", ["Customer/Vendor", "Entity"])),
      L(R("location", "Location", "Department")), L(CLASS),
      ...CURRENCY, B("adjustment", "Is Adjustment", ["Adjusting", "Adjusting Entry"]),
    ],
    check: (rows, c) => {
      const out: (Issue & { row?: number })[] = [];
      let total = 0;
      rows.forEach((v, row) => {
        if (v.amount == null && v.debit == null && v.credit == null) out.push({ row, field: "amount", level: "error", msg: "Amount is missing" });
        else total += amt(v, c);
      });
      if (Math.abs(total) > 0.005) out.push({ field: "amount", level: "error", msg: `This entry does not balance: debits and credits differ by ${Math.abs(r2(total)).toFixed(2)}` });
      return out;
    },
    build: (rows, c) => {
      const v = rows[0];
      return {
        entity: "JournalEntry", label: "Journal entry",
        body: clean({
          TxnDate: v.date, DocNumber: c.settings.useFileRefNo && v.docNumber ? v.docNumber.slice(0, 21) : undefined, PrivateNote: v.memo || undefined,
          Adjustment: v.adjustment ? yes(v.adjustment) : undefined, CurrencyRef: v.currency ? { value: v.currency } : undefined, ExchangeRate: num(v.exchangeRate) ?? undefined,
          Line: rows.filter((x) => amt(x, c) !== 0).map((x) => {
            const n = amt(x, c);
            const who = ref(c, "Name", x.payee);
            return clean({
              DetailType: "JournalEntryLineDetail", Amount: r2(Math.abs(n)), Description: x.description || undefined,
              JournalEntryLineDetail: clean({ PostingType: n > 0 ? "Debit" : "Credit", AccountRef: R_(ref(c, "Account", x.account)), Entity: who ? { Type: who.kind, EntityRef: R_(who) } : undefined, ClassRef: R_(ref(c, "Class", x.className)), DepartmentRef: R_(ref(c, "Department", x.location)) }),
            });
          }),
        }),
      };
    },
  };
}

export const ENTITY = new Map(ENTITIES.map((e) => [e.key, e]));
export function entityDef(key: string) {
  const e = ENTITY.get(key);
  if (!e) throw new Error(`Unknown import type “${key}”.`);
  return e;
}

/** Public, serialisable description of the catalog (for the browser). */
export function catalog() {
  return ENTITIES.map((e) => ({
    key: e.key, label: e.label, group: e.group, description: e.description, sheetNames: e.sheetNames,
    groupBy: e.groupBy, sign: e.sign, isList: !!e.list,
    fields: e.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, ref: f.ref, required: f.required, aliases: f.aliases, line: f.line, help: f.help, options: f.options })),
  }));
}
export type CatalogEntity = ReturnType<typeof catalog>[number];
