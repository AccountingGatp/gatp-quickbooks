// Searching QuickBooks for export / delete, and flattening records into spreadsheet rows.
import { query, escapeQ } from "./qbo/client";

import { QB_TYPES, QB_TYPE } from "./qbtypes";
export { QB_TYPES, QB_TYPE };


export type SearchFilter = { type: string; dateField?: "TxnDate" | "MetaData.CreateTime" | "MetaData.LastUpdatedTime"; from?: string; to?: string; refs?: string[] };

export async function search(realmId: string, f: SearchFilter, start = 1, max = 500) {
  const t = QB_TYPE.get(f.type);
  if (!t) throw new Error("Choose what to search for.");
  const where: string[] = [];
  const field = t.list && f.dateField === "TxnDate" ? "MetaData.CreateTime" : f.dateField || "TxnDate";
  const iso = (d: string, end: boolean) => (field === "TxnDate" ? d : `${d}T${end ? "23:59:59" : "00:00:00"}-00:00`);
  if (f.from) where.push(`${field} >= '${iso(f.from, false)}'`);
  if (f.to) where.push(`${field} <= '${iso(f.to, true)}'`);
  if (f.refs?.length) where.push(`${t.list ? (["Customer", "Vendor", "Employee"].includes(f.type) ? "DisplayName" : "Name") : "DocNumber"} IN (${f.refs.slice(0, 100).map((r) => `'${escapeQ(r)}'`).join(",")})`);
  if (t.list) where.push("Active IN (true, false)");
  const q = `select * from ${f.type}${where.length ? " where " + where.join(" and ") : ""} startposition ${start} maxresults ${max}`;
  const res = await query(realmId, q);
  return (res[f.type] || []) as any[];
}

const ref = (r: any) => r?.name ?? r?.value ?? "";
const addr = (a: any) => (a ? [a.Line1, a.Line2, a.City, a.CountrySubDivisionCode, a.PostalCode].filter(Boolean).join(", ") : "");

/** One summary line per record (for the delete screen and previews). */
export function summary(type: string, r: any) {
  const t = QB_TYPE.get(type);
  const name = t?.party ? ref(r[t.party]) : type === "Transfer" ? `${ref(r.FromAccountRef)} → ${ref(r.ToAccountRef)}` : type === "Deposit" ? ref(r.DepositToAccountRef) : type === "TimeActivity" ? ref(r.EmployeeRef || r.VendorRef) : "";
  const kind = type === "Purchase" ? (r.PaymentType === "Check" ? "Check" : r.Credit ? "Card credit" : r.PaymentType === "CreditCard" ? "Card expense" : "Expense") : t?.label.replace(/s$/, "") || type;
  return {
    id: String(r.Id), syncToken: String(r.SyncToken ?? "0"), type, kind,
    date: r.TxnDate || String(r.MetaData?.CreateTime || "").slice(0, 10),
    number: r.DocNumber || "",
    name: name || r.DisplayName || r.Name || "",
    account: type === "Purchase" ? ref(r.AccountRef) : "",
    total: Number(r.TotalAmt ?? r.Amount ?? r.Balance ?? 0),
    memo: r.PrivateNote || "",
  };
}

/** Spreadsheet rows: transactions get one row per line, with the header columns repeated. */
export function flatten(type: string, records: any[]): Record<string, unknown>[] {
  const t = QB_TYPE.get(type);
  if (t?.list) {
    return records.map((r) => ({
      Id: r.Id, Name: r.DisplayName || r.FullyQualifiedName || r.Name, Active: r.Active !== false ? "Yes" : "No",
      ...(type === "Account" ? { "Account Type": r.AccountType, "Account Subtype": r.AccountSubType, "Account Number": r.AcctNum, Balance: r.CurrentBalance } : {}),
      ...(type === "Item" ? { Type: r.Type, SKU: r.Sku, "Price/Rate": r.UnitPrice, Cost: r.PurchaseCost, "Income Account": ref(r.IncomeAccountRef), "Expense Account": ref(r.ExpenseAccountRef), "Qty On Hand": r.QtyOnHand } : {}),
      ...(["Customer", "Vendor", "Employee"].includes(type) ? { Company: r.CompanyName, "First Name": r.GivenName, "Last Name": r.FamilyName, Email: r.PrimaryEmailAddr?.Address, Phone: r.PrimaryPhone?.FreeFormNumber, Address: addr(r.BillAddr || r.PrimaryAddr), Balance: r.Balance } : {}),
      ...(["Class", "Department"].includes(type) ? { "Full Name": r.FullyQualifiedName, Parent: ref(r.ParentRef) } : {}),
      Created: r.MetaData?.CreateTime, "Last Updated": r.MetaData?.LastUpdatedTime,
    }));
  }
  const out: Record<string, unknown>[] = [];
  for (const r of records) {
    const s = summary(type, r);
    const head = {
      Type: s.kind, Id: s.id, Date: s.date, Number: s.number, Name: s.name,
      ...(type === "Purchase" ? { "Payment Account": ref(r.AccountRef), "Payment Type": r.PaymentType } : {}),
      ...(type === "Deposit" ? { "Deposit To": ref(r.DepositToAccountRef) } : {}),
      ...(type === "Transfer" ? { From: ref(r.FromAccountRef), To: ref(r.ToAccountRef) } : {}),
      ...(r.DueDate ? { "Due Date": r.DueDate } : {}),
      Total: s.total, ...(r.Balance != null ? { "Open Balance": r.Balance } : {}),
      Memo: r.PrivateNote || "", Location: ref(r.DepartmentRef), Currency: ref(r.CurrencyRef),
      Created: r.MetaData?.CreateTime, "Last Updated": r.MetaData?.LastUpdatedTime,
    };
    const lines: any[] = (r.Line || []).filter((l: any) => !["SubTotalLineDetail", "DiscountLineDetail"].includes(l.DetailType) || l.Amount);
    if (!lines.length) { out.push(head); continue; }
    for (const l of lines) {
      const d = l.AccountBasedExpenseLineDetail || l.ItemBasedExpenseLineDetail || l.SalesItemLineDetail || l.DepositLineDetail || l.JournalEntryLineDetail || {};
      out.push({
        ...head,
        "Line Account": ref(d.AccountRef), "Line Product/Service": ref(d.ItemRef), "Line Description": l.Description || "",
        "Line Qty": d.Qty ?? "", "Line Rate": d.UnitPrice ?? "",
        ...(type === "JournalEntry" ? { Debit: d.PostingType === "Debit" ? l.Amount : "", Credit: d.PostingType === "Credit" ? l.Amount : "", "Line Name": ref(d.Entity?.EntityRef) } : { "Line Amount": l.Amount }),
        "Line Class": ref(d.ClassRef), "Line Customer": ref(d.CustomerRef || d.Entity),
        ...(l.LinkedTxn?.length ? { "Applied To": l.LinkedTxn.map((x: any) => `${x.TxnType} ${x.TxnId}`).join(", ") } : {}),
      });
    }
  }
  return out;
}
