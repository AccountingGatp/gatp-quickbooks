// SaasAnt Transactions Online's public import guides and supported-entity list.
// Stable internal keys keep saved files, mappings and old jobs compatible.
export const ENTITY_LABELS: Record<string, string> = {
  "bank-statement": "Bank Statements", "card-statement": "Credit Card Statements",
  expenses: "Expense", checks: "Checks", "card-credits": "Credit Card Credits",
  deposits: "Bank Deposits", transfers: "Transfers", "card-payments": "Pay Down Credit Card",
  bills: "Bills", "bill-payments": "Bill Payments", "vendor-credits": "Vendor Credits", "purchase-orders": "Purchase Orders",
  invoices: "Invoices", estimates: "Estimates", "sales-receipts": "Sales Receipts", "credit-memos": "Credit Memos", "refund-receipts": "Refund Receipts",
  "receive-payments": "Received Payments", "journal-entries": "Journal Entries", "trial-balance": "Trial Balance", "time-activities": "Time Activities",
  customers: "Customer", vendors: "Vendor", employees: "Employee", items: "Product/Services", accounts: "Chart of Accounts", classes: "Classes", locations: "Locations/Department",
};
export const IMPORT_STEPS = ["Upload", "Map Fields", "Review", "File Processing"];
export const SETTING_LABELS = {
  dateFormat: "Date Format",
  autoCreate: "Auto Create List Entities in QuickBooks",
  useFileRefNo: "Assign Transaction Reference Numbers from the file",
  processEachLine: "Process each line as an individual Transaction",
  skipZero: "Skip Transactions with Zero Amount",
  negativeToPositive: "Convert Negative amounts to Positive",
  truncateText: "Truncate text to QuickBooks limits",
};
