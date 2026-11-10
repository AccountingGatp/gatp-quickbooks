// Finds QuickBooks records by the names written in the file
// (accounts by name, full name "Parent:Child", or number; people by display name; items by name or SKU).
import { getList } from "../qbo/lists";
import type { ImportSettings, ListItem, ListKind, RefKind } from "../types";

export const norm = (s: unknown) => String(s ?? "").normalize("NFKC").toLowerCase().replace(/[\s ]+/g, " ").replace(/[’']/g, "'").trim();

export type Ref = { value: string; name: string; kind: ListKind; item?: ListItem; isNew?: boolean };

export const CREATABLE: ListKind[] = ["Vendor", "Customer", "Class", "Department", "PaymentMethod"];
export const KIND_LABEL: Record<string, string> = {
  Account: "account", Vendor: "vendor", Customer: "customer", Employee: "employee", Name: "payee",
  Item: "product/service", Class: "class", Department: "location", PaymentMethod: "payment method", Term: "terms",
};

export class Resolver {
  private idx = new Map<ListKind, Map<string, ListItem>>();
  private loaded = new Map<ListKind, ListItem[]>();
  /** names that do not exist yet and will be created when posting */
  pending = new Map<string, { kind: ListKind; name: string }>();

  constructor(public realmId: string, public settings: ImportSettings) {}

  async load(kinds: ListKind[], fresh = false) {
    await Promise.all(kinds.filter((k) => !this.loaded.has(k)).map(async (k) => {
      const items = await getList(this.realmId, k, fresh);
      this.loaded.set(k, items);
      const m = new Map<string, ListItem>();
      // active records win over inactive ones with the same name
      for (const it of [...items].sort((a, b) => Number(!!a.active) - Number(!!b.active))) {
        if (it.full) m.set(norm(it.full), it);
        if (it.name && (!m.has(norm(it.name)) || it.active)) m.set(norm(it.name), it);
        if (k === "Account" && it.number) m.set("#" + norm(it.number), it);
        if (k === "Item" && it.sku) m.set("sku:" + norm(it.sku), it);
      }
      this.idx.set(k, m);
    }));
  }

  list(kind: ListKind) { return this.loaded.get(kind) || []; }

  add(kind: ListKind, it: ListItem) {
    this.loaded.set(kind, [...this.list(kind), it]);
    const m = this.idx.get(kind) || new Map();
    m.set(norm(it.name), it);
    if (it.full) m.set(norm(it.full), it);
    this.idx.set(kind, m);
    this.pending.delete(`${kind}|${norm(it.name)}`);
  }

  byId(kind: ListKind, id: string) { return this.list(kind).find((x) => x.id === id); }

  private lookup(kind: ListKind, value: string): ListItem | undefined {
    const m = this.idx.get(kind);
    if (!m) return undefined;
    const v = norm(value);
    let hit = m.get(v);
    if (!hit && kind === "Account") {
      // QuickBooks reports write accounts as "70000 Operating Expenses:70019 IT Services / Software".
      // Numbers can repeat between accounts, so names are tried before numbers.
      const segs = v.split(":").map((x) => x.trim());
      const parsed = segs.map((x) => { const mm = x.match(/^(\d[\d.-]*)\s+[-–]?\s*(.+)$/); return mm ? { num: mm[1], name: mm[2].trim() } : { num: "", name: x }; });
      const fullNoNum = parsed.map((x) => x.name).join(":");
      const last = parsed[parsed.length - 1];
      if (last.num && this.settings.matchAccountByNumber) {
        const exact = this.list("Account").filter((a) => a.number === last.num && norm(a.name) === last.name);
        if (exact.length === 1) hit = exact[0];
      }
      if (!hit) hit = m.get(fullNoNum);
      if (!hit && segs.length === 1 && last.name !== v) hit = m.get(last.name);
      if (!hit && this.settings.matchAccountByNumber) {
        if (/^\d[\d.-]*$/.test(v)) hit = m.get("#" + v);
        if (!hit && last.num) {
          const byNum = this.list("Account").filter((a) => a.number === last.num);
          hit = byNum.length === 1 ? byNum[0] : byNum.find((a) => norm(a.name) === last.name);
        }
      }
      if (!hit && segs.length > 1) {
        const same = this.list("Account").filter((a) => norm(a.name) === last.name);
        if (same.length === 1) hit = same[0];
      }
    }
    if (!hit && kind === "Item") hit = m.get("sku:" + v) || (v.includes(":") ? m.get(v.split(":").pop()!.trim()) : undefined);
    if (!hit && (kind === "Customer" || kind === "Class" || kind === "Department") && v.includes(":")) hit = m.get(v.split(":").pop()!.trim());
    return hit;
  }

  /** Resolve a name. Returns null when not found (and not creatable). */
  find(kind: RefKind, value: string, prefer: "Vendor" | "Customer" | "Employee" = "Vendor"): Ref | null {
    const v = String(value ?? "").trim();
    if (!v) return null;
    const kinds: ListKind[] = kind === "Name"
      ? ([prefer, "Vendor", "Customer", "Employee"].filter((x, i, a) => a.indexOf(x) === i) as ListKind[])
      : [kind as ListKind];
    for (const k of kinds) {
      const hit = this.lookup(k, v);
      if (hit) return { value: hit.id, name: hit.full || hit.name, kind: k, item: hit };
    }
    const createKind = (kind === "Name" ? prefer : kind) as ListKind;
    const p = this.pending.get(`${createKind}|${norm(v)}`);
    if (p) return { value: `new:${createKind}:${norm(v)}`, name: p.name, kind: createKind, isNew: true };
    return null;
  }

  canCreate(kind: RefKind, prefer: "Vendor" | "Customer" | "Employee" = "Vendor") {
    const k = (kind === "Name" ? prefer : kind) as ListKind;
    return this.settings.autoCreate && CREATABLE.includes(k) ? k : null;
  }

  markNew(kind: ListKind, name: string): Ref {
    const key = `${kind}|${norm(name)}`;
    if (!this.pending.has(key)) this.pending.set(key, { kind, name: name.trim() });
    return { value: `new:${kind}:${norm(name)}`, name: name.trim(), kind, isNew: true };
  }

  accountType(id: string) {
    return this.byId("Account", id)?.type || "";
  }
}
