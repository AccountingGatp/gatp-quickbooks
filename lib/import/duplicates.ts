const round2 = (n: number) => Math.round(n * 100) / 100;

export function txnTotal(entity: string, body: any): number {
  if (entity === "Transfer") return round2(Number(body.Amount || 0));
  if (["Payment", "BillPayment"].includes(entity) && body.TotalAmt != null) return round2(Number(body.TotalAmt));
  const lines: any[] = body.Line || [];
  if (entity === "JournalEntry") return round2(lines.filter((l) => l.JournalEntryLineDetail?.PostingType === "Debit").reduce((s, l) => s + Number(l.Amount || 0), 0));
  return round2(lines.reduce((s, l) => s + Number(l.Amount || 0), 0));
}

export function dupKey(entity: string, b: any): string | null {
  const total = txnTotal(entity, b).toFixed(2);
  if (entity === "Purchase") return `P|${b.AccountRef?.value}|${b.TxnDate}|${total}|${b.Credit ? 1 : 0}`;
  if (entity === "Deposit") return `D|${b.DepositToAccountRef?.value}|${b.TxnDate}|${total}`;
  if (entity === "Transfer") return `T|${b.FromAccountRef?.value}|${b.ToAccountRef?.value}|${b.TxnDate}|${total}`;
  if (entity === "BillPayment") return `B|${b.CheckPayment?.BankAccountRef?.value || b.CreditCardPayment?.CCAccountRef?.value}|${b.TxnDate}|${total}`;
  // The API supplies a default deposit account when omitted in an import.
  if (entity === "Payment") return `R|${b.CustomerRef?.value}|${b.TxnDate}|${total}`;
  if (entity === "TimeActivity") return JSON.stringify([entity, b.TxnDate, b.EmployeeRef?.value || b.VendorRef?.value, b.CustomerRef?.value, b.ItemRef?.value, b.Hours || 0, b.Minutes || 0, b.StartTime, b.EndTime, b.BillableStatus]);
  return null;
}

export const DOC_TYPES = new Set(["Bill", "Invoice", "Estimate", "SalesReceipt", "CreditMemo", "RefundReceipt", "PurchaseOrder", "VendorCredit", "JournalEntry", "BillPayment", "Payment"]);
