import type { Built } from "./entities";
import type { RowDoc } from "../types";

export const UPDATE_TYPES: Record<string, string> = { invoices: "Invoice", "credit-memos": "CreditMemo" };
export const modificationSheet = (name: string) => /^\s*(modify|update|edit)\b/i.test(name);

/** Updates must have an unambiguous customer/document identity and preserve the reviewed version. */
export function prepareUpdate(built: Built, existing: any[], previous?: RowDoc["target"], expectedToken?: string) {
  const b = built.body;
  const matches = existing.filter((r) => String(r.CustomerRef?.value) === String(b.CustomerRef?.value));
  if (matches.length !== 1) throw new Error(matches.length ? "Several existing records match this customer and document. Use a unique QuickBooks ID." : "No existing record matches this customer and document. Update mode never creates a new transaction.");
  const before = matches[0];
  if (b.DocNumber && String(b.DocNumber) !== String(before.DocNumber)) throw new Error("Bulk update cannot renumber an existing record. Keep its current document number.");
  if (!before.Id || before.SyncToken == null) throw new Error("QuickBooks did not return the record version. Check again before updating.");
  if (previous && (previous.id !== String(before.Id) || previous.type !== built.entity || previous.syncToken !== String(before.SyncToken))) throw new Error("This record changed after review. Change columns and check the complete file again before approving the newer version.");
  if (expectedToken != null && expectedToken !== "" && expectedToken !== String(before.SyncToken)) throw new Error("The file's SyncToken is out of date. Export the current record and review the changes again.");
  const open = Number(built.entity === "Invoice" ? before.Balance : before.RemainingCredit), total = Number(before.TotalAmt);
  if (before.LinkedTxn?.length || !Number.isFinite(open) || !Number.isFinite(total) || Math.abs(open - total) > 0.004) throw new Error("This record has payments, applied credits or an unknown open balance. Bulk replacement is blocked to preserve those links.");
  if ((before.Line || []).some((l: any) => !["SalesItemLineDetail", "SubTotalLineDetail"].includes(l.DetailType)) || Number(before.TxnTaxDetail?.TotalTax || 0) || before.GlobalTaxCalculation === "TaxInclusive") throw new Error("This record has tax, discounts or grouped lines. Review its changes directly in QuickBooks.");
  if ((b.Line || []).some((l: any) => l.SalesItemLineDetail?.TaxCodeRef?.value === "TAX")) throw new Error("Taxable line replacement is not supported in bulk update mode yet.");
  const body = { ...before, ...b, Id: String(before.Id), SyncToken: String(before.SyncToken), sparse: false };
  for (const key of ["MetaData", "domain", "status", "TotalAmt", "HomeTotalAmt", "Balance", "RemainingCredit", "LinkedTxn", "PrintStatus", "EmailStatus", "DeliveryInfo"]) delete body[key];
  // A full update replaces the complete line collection; do not append new lines with a sparse update.
  body.Line = b.Line;
  return { body, before, target: { type: built.entity, id: String(before.Id), syncToken: String(before.SyncToken) } };
}

export function restoreUpdate(before: any, id: string, syncToken: string) {
  const body = { ...before, Id: id, SyncToken: syncToken, sparse: false };
  for (const key of ["MetaData", "domain", "status", "TotalAmt", "HomeTotalAmt", "Balance", "RemainingCredit", "LinkedTxn", "PrintStatus", "EmailStatus", "DeliveryInfo"]) delete body[key];
  return body;
}
