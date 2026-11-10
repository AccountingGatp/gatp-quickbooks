// Shared data shapes (MongoDB documents + import definitions).
import type { ObjectId } from "mongodb";

// ---------------------------------------------------------------- QuickBooks companies
export type CompanyDoc = {
  _id: string; // = realmId
  realmId: string;
  name: string;
  environment: "sandbox" | "production" | "demo";
  tokens: string; // encrypted JSON { access_token, refresh_token }
  accessExpiresAt: number;
  refreshExpiresAt: number;
  status: "connected" | "needs_reconnect";
  connectedAt: Date;
  connectedBy: string;
  lastUsedAt?: Date;
  refreshLockUntil?: number;
  settings?: Partial<ImportSettings>;
  homeCurrency?: string;
};

// ---------------------------------------------------------------- import definitions
export type FieldType = "text" | "number" | "date" | "bool" | "ref";
export type RefKind =
  | "Account" | "Vendor" | "Customer" | "Employee" | "Name"
  | "Item" | "Class" | "Department" | "PaymentMethod" | "Term";

export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  ref?: RefKind;
  /** for Name refs: which list to look in first */
  prefer?: "Vendor" | "Customer" | "Employee";
  required?: boolean | "one-of";
  aliases?: string[];
  line?: boolean; // true = changes per line of a multi-line transaction
  help?: string;
  max?: number;
  options?: string[]; // allowed values for text fields
  accountTypes?: string[]; // for Account fields: QuickBooks account types allowed here
};

export type EntityGroup = "Banking" | "Purchases" | "Sales" | "Accounting" | "Lists";

export type ImportSettings = {
  dateFormat: "auto" | "MDY" | "DMY" | "YMD";
  autoCreate: boolean; // create missing vendors, customers, classes, locations, payment methods
  useFileRefNo: boolean; // keep reference / document numbers from the file
  duplicateCheck: boolean; // warn when a matching transaction is already in QuickBooks
  applyRules: boolean; // apply bank rules to statement rows
  matchAccountByNumber: boolean; // allow "6100" to match account number 6100
};

export const DEFAULT_SETTINGS: ImportSettings = {
  dateFormat: "auto",
  autoCreate: true,
  useFileRefNo: true,
  duplicateCheck: true,
  applyRules: true,
  matchAccountByNumber: true,
};

// ---------------------------------------------------------------- jobs
export type JobKind = "import" | "export" | "delete";
export type JobStatus =
  | "mapping" | "review" | "posting" | "completed" | "partial" | "failed" | "rolled_back" | "discarded";

export type Counts = {
  total: number; ready: number; error: number; warning: number; skipped: number;
  posted: number; failed: number; rolledBack: number; transactions: number; duplicate?: number;
};

export type CreatedRef = { type: string; id: string; name: string };

export type JobDoc = {
  _id: ObjectId;
  kind: JobKind;
  entity: string;
  entityLabel: string;
  realmId: string;
  companyName: string;
  user: string;
  fileName?: string;
  sheetName?: string;
  headers?: string[];
  notes?: string[]; // report title lines found above the header row
  mapping?: Record<string, string | null>; // field key -> file header
  fixed?: Record<string, string>; // field key -> same value for every row
  flipSign?: boolean; // statements / journals: positive amounts mean the opposite of the default
  settings?: ImportSettings;
  status: JobStatus;
  counts: Counts;
  created?: CreatedRef[]; // names auto-created in QuickBooks by this import
  newNames?: { kind: string; name: string }[]; // names that will be created when posting
  fieldsUsed?: string[]; // fields that have a value (or a problem) in at least one row
  lockUntil?: number;
  validatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  finishedAt?: Date;
  note?: string;
  // export / delete
  filter?: { from?: string; to?: string; dateField?: string; ref?: string };
  resultCount?: number;
};

export type Issue = { field?: string; level: "error" | "warning"; msg: string };

export type RowStatus =
  | "pending" | "ready" | "error" | "skipped" | "posting" | "posted" | "failed" | "rolled_back";

export type QboRef = { type: string; id: string; docNumber?: string; syncToken?: string; total?: number; paymentType?: string; credit?: boolean };

export type RowDoc = {
  _id?: ObjectId;
  jobId: string;
  idx: number; // 0-based position in the file
  sheetRow: number; // row number shown in Excel
  raw: Record<string, unknown>;
  values: Record<string, string>; // mapped, editable values
  group: string; // rows with the same group become one transaction
  status: RowStatus;
  issues: Issue[];
  rule?: string; // bank rule that filled this row
  dup?: { type: string; id: string; label: string };
  forceInclude?: boolean; // the user chose to post this row even though it looks like a duplicate
  qbo?: QboRef;
  error?: string;
  requestId?: string;
  postedAt?: Date;
};

// ---------------------------------------------------------------- other collections
export type MappingDoc = {
  _id?: ObjectId;
  entity: string;
  signature: string; // sorted, normalised headers
  name: string;
  mapping: Record<string, string | null>;
  fixed?: Record<string, string>;
  flipSign?: boolean;
  realmId?: string;
  updatedAt: Date;
  updatedBy: string;
};

export type RuleDoc = {
  _id?: ObjectId;
  realmId: string; // "*" = all companies
  name: string;
  order: number;
  enabled: boolean;
  match: { field: "description" | "payee"; op: "contains" | "starts" | "equals" | "number"; text: string; direction?: "any" | "in" | "out" };
  set: { account?: string; payee?: string; type?: string; className?: string; location?: string; memo?: string };
  hits?: number;
  updatedAt: Date;
  updatedBy: string;
};

export type AuditDoc = {
  _id?: ObjectId;
  ts: Date;
  user: string;
  realmId?: string;
  companyName?: string;
  action: string;
  detail?: string;
  jobId?: string;
};

export type ListItem = {
  id: string; name: string; full?: string; type?: string; subType?: string;
  number?: string; sku?: string; active?: boolean; kind?: string; syncToken?: string;
};
export type ListKind = "Account" | "Vendor" | "Customer" | "Employee" | "Item" | "Class" | "Department" | "PaymentMethod" | "Term";
export type ListCacheDoc = { _id?: ObjectId; realmId: string; kind: ListKind; items: ListItem[]; fetchedAt: Date };
