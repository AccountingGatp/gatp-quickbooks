"use client";
import { useState } from "react";
import { Search } from "lucide-react";
import { Button, Label } from "./ui";
import { QB_TYPES } from "@/lib/qbtypes";

export type SearchValues = { type: string; dateField: "TxnDate" | "MetaData.CreateTime" | "MetaData.LastUpdatedTime"; from: string; to: string; refs: string };

const firstOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; };
const today = () => new Date().toISOString().slice(0, 10);

export function SearchForm({ deletable, busy, onSearch, submitLabel }: { deletable?: boolean; busy: boolean; onSearch: (v: SearchValues) => void; submitLabel: string }) {
  const types = QB_TYPES.filter((t) => !deletable || t.deletable);
  const [v, setV] = useState<SearchValues>({ type: types[0].key, dateField: "TxnDate", from: firstOfMonth(), to: today(), refs: "" });
  const isList = QB_TYPES.find((t) => t.key === v.type)?.list;
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSearch(v); }} className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_1fr_auto] xl:items-end">
      <div>
        <Label>What</Label>
        <select className="field" value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}>
          <optgroup label="Transactions">{types.filter((t) => !t.list).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</optgroup>
          {!deletable && <optgroup label="Lists">{types.filter((t) => t.list).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</optgroup>}
        </select>
      </div>
      <div>
        <Label>Search by</Label>
        <select className="field" value={isList ? "MetaData.CreateTime" : v.dateField} disabled={isList} onChange={(e) => setV({ ...v, dateField: e.target.value as SearchValues["dateField"] })}>
          {!isList && <option value="TxnDate">Transaction date</option>}
          <option value="MetaData.CreateTime">Date added to QuickBooks</option>
          <option value="MetaData.LastUpdatedTime">Date last changed</option>
        </select>
      </div>
      <div><Label>From</Label><input type="date" className="field" value={v.from} onChange={(e) => setV({ ...v, from: e.target.value })} /></div>
      <div><Label>To</Label><input type="date" className="field" value={v.to} onChange={(e) => setV({ ...v, to: e.target.value })} /></div>
      <Button variant="primary" type="submit" loading={busy} icon={<Search className="size-4" />}>{submitLabel}</Button>
      <div className="md:col-span-2 xl:col-span-5">
        <Label hint="optional, one per line or comma separated">Only these {isList ? "names" : "reference numbers"}</Label>
        <textarea className="field min-h-[38px]" rows={1} value={v.refs} onChange={(e) => setV({ ...v, refs: e.target.value })} placeholder={isList ? "e.g. Staples, Adobe" : "e.g. INV-1001, INV-1002"} />
      </div>
    </form>
  );
}

export const refsList = (s: string) => s.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
