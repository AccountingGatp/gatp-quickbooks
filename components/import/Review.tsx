"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, ExternalLink, EyeOff, Eye, PencilLine, ChevronLeft, ChevronRight, CornerDownRight } from "lucide-react";
import { Badge, Button, Spinner, Tabs, cx, useToast } from "@/components/ui";
import { api, money, usDate } from "@/lib/client";
import type { CatalogEntity } from "@/lib/import/entities";
import { accountListId } from "./RefLists";
import type { Counts, Issue } from "@/lib/types";

export type GridRow = {
  idx: number; sheetRow: number; values: Record<string, string>; group: string; status: string;
  issues: Issue[]; rule?: string; dup?: { label: string } | null; error?: string; qbo?: { type: string; id: string; docNumber?: string }; link?: string;
};

type Filter = "all" | "ready" | "warning" | "error" | "duplicate" | "skipped" | "posted" | "failed";
const MONEY = new Set(["amount", "debit", "credit", "rate", "price", "cost", "openingBalance", "exchangeRate"]);
const PAGE = 100;

export function Review({ jobId, def, counts, visible, editable, onChanged, refreshKey }: {
  jobId: string; def: CatalogEntity; counts: Counts; visible: string[]; editable: boolean;
  onChanged: (counts: Counts) => void; refreshKey: number;
}) {
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [qLive, setQLive] = useState("");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<GridRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [fillField, setFillField] = useState("");
  const [fillValue, setFillValue] = useState("");

  useEffect(() => { const t = setTimeout(() => setQ(qLive), 300); return () => clearTimeout(t); }, [qLive]);
  const load = useCallback(async () => {
    const r = await api<{ rows: GridRow[]; total: number }>(`/api/jobs/${jobId}/rows?filter=${filter}&offset=${page * PAGE}&limit=${PAGE}&q=${encodeURIComponent(q)}`);
    setRows(r.rows); setTotal(r.total);
    setSel((s) => new Set([...s].filter((i) => r.rows.some((x) => x.idx === i))));
  }, [jobId, filter, page, q]);
  useEffect(() => { load().catch((e) => toast("error", e.message)); }, [load, refreshKey, toast]);
  useEffect(() => { setPage(0); setSel(new Set()); }, [filter, q]);

  const fields = def.fields.filter((f) => visible.includes(f.key));
  const fieldMeta = useMemo(() => new Map(def.fields.map((f) => [f.key, f])), [def]);

  async function patch(body: unknown, msg?: string) {
    setSaving(true);
    try {
      const r = await api<{ counts: Counts }>(`/api/jobs/${jobId}/rows`, { method: "PATCH", json: body });
      onChanged(r.counts);
      await load();
      if (msg) toast("ok", msg);
    } catch (e) { toast("error", (e as Error).message); } finally { setSaving(false); }
  }

  const tabs: { value: Filter; label: string; count?: number }[] = [
    { value: "all", label: "All rows", count: counts.total },
    { value: "ready", label: "Ready", count: counts.ready },
    ...(counts.warning ? [{ value: "warning" as Filter, label: "Warnings", count: counts.warning }] : []),
    { value: "error", label: "Needs fixing", count: counts.error + counts.failed },
    { value: "duplicate", label: "Possible duplicates", count: counts.duplicate || 0 },
    ...(counts.skipped ? [{ value: "skipped" as Filter, label: "Left out", count: counts.skipped }] : []),
    ...(counts.posted ? [{ value: "posted" as Filter, label: "Posted", count: counts.posted }] : []),
    ...(counts.rolledBack ? [{ value: "all" as Filter, label: `Undone (${counts.rolledBack})` }] : []),
  ];
  const allSel = rows?.length && rows.every((r) => sel.has(r.idx));
  const selIdx = [...sel];
  const canEdit = (r: GridRow) => editable && ["pending", "ready", "error", "skipped", "failed"].includes(r.status);

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-3 pt-1">
        <div className="min-w-0 flex-1 overflow-x-auto"><Tabs value={filter} onChange={setFilter} items={tabs.filter((t, i, a) => a.findIndex((x) => x.label === t.label) === i)} /></div>
        <div className="flex items-center gap-2 pb-1.5">
          {saving && <Spinner />}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-4" />
            <input className="field h-8 w-[220px] pl-8" placeholder="Search rows" value={qLive} onChange={(e) => setQLive(e.target.value)} />
          </div>
        </div>
      </div>

      {editable && sel.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-y border-green-line bg-green-soft px-3 py-2 text-[13px]">
          <b className="num font-semibold text-green">{sel.size} selected</b>
          <span className="mx-1 h-4 w-px bg-green-line" />
          <PencilLine className="size-4 text-green" />
          <span>Set</span>
          <select className="field h-7 w-[180px] py-0" value={fillField} onChange={(e) => setFillField(e.target.value)}>
            <option value="">field…</option>
            {def.fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <span>to</span>
          <input className="field h-7 w-[220px] py-0" value={fillValue} onChange={(e) => setFillValue(e.target.value)}
            list={fillField && fieldMeta.get(fillField)?.type === "ref" ? (fieldMeta.get(fillField)!.ref === "Account" ? accountListId(fieldMeta.get(fillField)!.accountTypes) : `dl-${fieldMeta.get(fillField)!.ref}`) : undefined} placeholder="value" />
          <Button size="sm" variant="primary" disabled={!fillField || saving} onClick={() => patch({ fill: { idxs: selIdx, field: fillField, value: fillValue } }, `Updated ${sel.size} rows`).then(() => setSel(new Set()))}>Apply</Button>
          <span className="mx-1 h-4 w-px bg-green-line" />
          <Button size="sm" icon={<EyeOff className="size-3.5" />} onClick={() => patch({ skip: selIdx }, `${sel.size} rows left out`).then(() => setSel(new Set()))}>Leave out</Button>
          <Button size="sm" icon={<Eye className="size-3.5" />} onClick={() => patch({ unskip: selIdx }, `${sel.size} rows included again`).then(() => setSel(new Set()))}>Include</Button>
          <button className="ml-auto text-[12.5px] text-ink-3 hover:text-ink" onClick={() => setSel(new Set())}>Clear selection</button>
        </div>
      )}

      <div className="max-h-[calc(100vh-320px)] min-h-[260px] overflow-auto border-t border-rule">
        {!rows ? <div className="py-16 text-center"><Spinner /></div> : !rows.length ? (
          <p className="py-14 text-center text-[13.5px] text-ink-3">{q ? "No rows match your search." : filter === "error" ? "Nothing to fix." : filter === "duplicate" ? "No possible duplicates found." : "No rows here."}</p>
        ) : (
          <table className="ledger-grid w-full min-w-max">
            <thead>
              <tr>
                {editable && <th className="w-8 !px-2"><input type="checkbox" aria-label="Select all on this page" checked={!!allSel} onChange={() => setSel(allSel ? new Set() : new Set(rows.filter(canEdit).map((r) => r.idx)))} /></th>}
                <th className="!p-0" />
                <th className="w-12 text-right">Row</th>
                {fields.map((f) => <th key={f.key} className={cx(MONEY.has(f.key) && "text-right")}>{f.label}{f.required === true && <span className="text-red"> *</span>}</th>)}
                <th className="min-w-[300px]">Check</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const firstOfGroup = !def.groupBy || i === 0 || rows[i - 1].group !== r.group || r.group.startsWith("r:");
                const errs = r.issues.filter((x) => x.level === "error");
                const warns = r.issues.filter((x) => x.level === "warning");
                return (
                  <tr key={r.idx} className={cx(sel.has(r.idx) && "is-selected", r.status === "skipped" && "opacity-55")}>
                    {editable && <td className="!px-2"><input type="checkbox" aria-label={`Select row ${r.sheetRow}`} disabled={!canEdit(r)} checked={sel.has(r.idx)} onChange={() => { const s = new Set(sel); s.has(r.idx) ? s.delete(r.idx) : s.add(r.idx); setSel(s); }} /></td>}
                    <td className={cx("rail", rail(r))} />
                    <td className="num text-right text-[12px] text-ink-3">{!firstOfGroup ? <CornerDownRight className="ml-auto size-3.5 text-ink-4" /> : r.sheetRow}</td>
                    {fields.map((f) => (
                      <Cell key={f.key} value={r.values[f.key] || ""} field={f} editable={canEdit(r)}
                        err={errs.some((x) => x.field === f.key)} warn={warns.some((x) => x.field === f.key)}
                        onSave={(v) => patch({ edits: [{ idx: r.idx, field: f.key, value: v }] })} />
                    ))}
                    <td className="text-[12.5px] leading-snug">
                      <CheckCell r={r} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {total > PAGE && (
        <div className="flex items-center justify-between border-t border-rule px-3 py-2 text-[12.5px] text-ink-3">
          <span className="num">Rows {page * PAGE + 1}–{Math.min(total, (page + 1) * PAGE)} of {total.toLocaleString()}</span>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)} icon={<ChevronLeft className="size-4" />}>Previous</Button>
            <Button size="sm" variant="ghost" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)}>Next <ChevronRight className="size-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}

function rail(r: GridRow) {
  if (r.status === "posted") return "bg-green";
  if (r.status === "error" || r.status === "failed") return "bg-red";
  if (r.status === "skipped" || r.status === "rolled_back") return "bg-ink-4";
  if (r.issues.some((x) => x.level === "warning")) return "bg-amber";
  if (r.status === "ready") return "bg-green-line";
  return "bg-rule";
}

function CheckCell({ r }: { r: GridRow }) {
  if (r.status === "posted") return (
    <span className="flex items-center gap-2 text-green">
      <Badge tone="green">Posted</Badge>
      <span className="text-ink-3">{r.qbo?.type === "Purchase" ? "Expense" : r.qbo?.type} {r.qbo?.docNumber ? `no. ${r.qbo.docNumber}` : `#${r.qbo?.id}`}</span>
      {r.link && <a href={r.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-green hover:underline">Open <ExternalLink className="size-3" /></a>}
    </span>
  );
  if (r.status === "rolled_back") return <Badge>Undone</Badge>;
  if (r.status === "skipped") return <span className="text-ink-3">{r.dup ? <>Left out: looks like a duplicate of {r.dup.label}. Select it and click Include to post it anyway.</> : "Left out of this import"}</span>;
  if (r.status === "failed") return <span className="text-red"><b className="font-semibold">QuickBooks refused this:</b> {r.error}</span>;
  if (r.status === "posting") return <span className="text-blue">Posting…</span>;
  const list = r.issues;
  return (
    <div className="space-y-0.5">
      {r.rule && <div className="text-blue">Bank rule “{r.rule}” filled this row</div>}
      {list.length === 0 && !r.rule && <span className="text-green">Ready</span>}
      {list.slice(0, 3).map((x, i) => <div key={i} className={x.level === "error" ? "text-red" : "text-amber"}>{x.msg}</div>)}
      {list.length > 3 && <div className="text-ink-3">+{list.length - 3} more</div>}
    </div>
  );
}

function Cell({ value, field, editable, err, warn, onSave }: {
  value: string; field: CatalogEntity["fields"][number]; editable: boolean; err: boolean; warn: boolean; onSave: (v: string) => void;
}) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => setV(value), [value]);
  useEffect(() => { if (edit) ref.current?.select(); }, [edit]);
  const isMoney = MONEY.has(field.key);
  const shown = !value ? "" : field.type === "date" ? usDate(value) : isMoney && !Number.isNaN(Number(value)) ? money(Number(value)) : field.type === "bool" ? (value === "true" ? "Yes" : "No") : value;
  const neg = isMoney && Number(value) < 0;
  const commit = () => { setEdit(false); if (v !== value) onSave(v.trim()); };
  if (edit) return (
    <td className="!p-1">
      <input ref={ref} className="field h-7 min-w-[120px] py-0" value={v} onChange={(e) => setV(e.target.value)}
        list={field.type === "ref" ? (field.ref === "Account" ? accountListId(field.accountTypes) : `dl-${field.ref}`) : undefined}
        onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setV(value); setEdit(false); } }} />
    </td>
  );
  return (
    <td onClick={() => editable && setEdit(true)} title={editable ? "Click to edit" : undefined}
      className={cx(field.key === "description" ? "max-w-[240px]" : "max-w-[200px]", isMoney && "num text-right", editable && "cursor-text", err && "!bg-red-soft", warn && !err && "!bg-amber-soft/70")}>
      <span className={cx("block truncate", neg && "text-red", !value && "text-ink-4")}>{shown || (editable ? "—" : "")}</span>
    </td>
  );
}
