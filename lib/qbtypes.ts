// QuickBooks record types for Export and Delete (safe to use in the browser).
export const QB_TYPES: { key: string; label: string; list?: boolean; deletable: boolean; party?: string }[] = [
  { key: "Purchase", label: "Expenses, checks & card charges", deletable: true, party: "EntityRef" },
  { key: "Deposit", label: "Bank Deposits", deletable: true },
  { key: "Transfer", label: "Transfers", deletable: true },
  { key: "Bill", label: "Bills", deletable: true, party: "VendorRef" },
  { key: "BillPayment", label: "Bill Payments", deletable: true, party: "VendorRef" },
  { key: "VendorCredit", label: "Vendor Credits", deletable: true, party: "VendorRef" },
  { key: "PurchaseOrder", label: "Purchase Orders", deletable: true, party: "VendorRef" },
  { key: "Invoice", label: "Invoices", deletable: true, party: "CustomerRef" },
  { key: "Payment", label: "Received Payments", deletable: true, party: "CustomerRef" },
  { key: "SalesReceipt", label: "Sales Receipts", deletable: true, party: "CustomerRef" },
  { key: "CreditMemo", label: "Credit Memos", deletable: true, party: "CustomerRef" },
  { key: "RefundReceipt", label: "Refund Receipts", deletable: true, party: "CustomerRef" },
  { key: "Estimate", label: "Estimates", deletable: true, party: "CustomerRef" },
  { key: "JournalEntry", label: "Journal Entries", deletable: true },
  { key: "TimeActivity", label: "Time Activities", deletable: true },
  { key: "Customer", label: "Customer", list: true, deletable: false },
  { key: "Vendor", label: "Vendor", list: true, deletable: false },
  { key: "Employee", label: "Employee", list: true, deletable: false },
  { key: "Item", label: "Product/Services", list: true, deletable: false },
  { key: "Account", label: "Chart of Accounts", list: true, deletable: false },
  { key: "Class", label: "Classes", list: true, deletable: false },
  { key: "Department", label: "Locations/Department", list: true, deletable: false },
];
export const QB_TYPE = new Map(QB_TYPES.map((t) => [t.key, t]));

