// QuickBooks name lists (accounts, vendors, customers, items, …) cached in MongoDB for 15 minutes,
// so checking a 2,000-row file does not re-read the whole chart of accounts every time.
import { listCache } from "../db";
import { queryAll } from "./client";
import type { ListItem, ListKind } from "../types";

const TTL = 15 * 60_000;

const MAP: Record<ListKind, (r: any) => ListItem> = {
  Account: (r) => ({ id: r.Id, name: r.Name, full: r.FullyQualifiedName, type: r.AccountType, subType: r.AccountSubType, number: r.AcctNum, active: r.Active !== false }),
  Vendor: (r) => ({ id: r.Id, name: r.DisplayName, active: r.Active !== false, kind: "Vendor" }),
  Customer: (r) => ({ id: r.Id, name: r.DisplayName, full: r.FullyQualifiedName, active: r.Active !== false, kind: "Customer" }),
  Employee: (r) => ({ id: r.Id, name: r.DisplayName || [r.GivenName, r.FamilyName].filter(Boolean).join(" "), active: r.Active !== false, kind: "Employee" }),
  Item: (r) => ({ id: r.Id, name: r.Name, full: r.FullyQualifiedName, type: r.Type, sku: r.Sku, active: r.Active !== false }),
  Class: (r) => ({ id: r.Id, name: r.Name, full: r.FullyQualifiedName, active: r.Active !== false }),
  Department: (r) => ({ id: r.Id, name: r.Name, full: r.FullyQualifiedName, active: r.Active !== false }),
  PaymentMethod: (r) => ({ id: r.Id, name: r.Name, active: r.Active !== false }),
  Term: (r) => ({ id: r.Id, name: r.Name, active: r.Active !== false }),
};

export async function getList(realmId: string, kind: ListKind, fresh = false): Promise<ListItem[]> {
  const c = await listCache();
  if (!fresh) {
    const hit = await c.findOne({ realmId, kind });
    if (hit && Date.now() - new Date(hit.fetchedAt).getTime() < TTL) return hit.items;
  }
  let rows: any[] = [];
  try {
    rows = await queryAll(realmId, kind, "where Active IN (true, false)");
  } catch (e) {
    // Class / Location tracking switched off in this company -> empty list, not an error
    if (kind === "Class" || kind === "Department") rows = [];
    else throw e;
  }
  const items = rows.map(MAP[kind]);
  await c.updateOne({ realmId, kind }, { $set: { items, fetchedAt: new Date() } }, { upsert: true });
  return items;
}

/** Add a freshly created record to the cache so the next rows find it. */
export async function addToList(realmId: string, kind: ListKind, item: ListItem) {
  await (await listCache()).updateOne({ realmId, kind }, { $push: { items: item } });
}

export async function clearLists(realmId: string) {
  await (await listCache()).deleteMany({ realmId });
}
