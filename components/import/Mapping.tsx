"use client";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Wand2, Info } from "lucide-react";
import { Badge, Button, Label, Panel, Toggle, cx } from "@/components/ui";
import { autoMap, hnorm } from "@/lib/import/automap";
import type { CatalogEntity } from "@/lib/import/entities";
import type { ImportSettings } from "@/lib/types";
import { RefLists, type Lists } from "./RefLists";

export type MappingState = { entity: string; mapping: Record<string, string | null>; fixed: Record<string, string>; flipSign: boolean; settings: ImportSettings };

export function Mapping({ cat, headers, samples, initial, saved, lists, busy, onSubmit, onCancel }: {
  cat: CatalogEntity[]; headers: string[]; samples: Record<string, unknown>[]; initial: MappingState;
  saved: { updatedBy: string; updatedAt: string } | null; lists: Lists; busy: boolean;
  onSubmit: (m: MappingState) => void; onCancel?: () => void;
}) {
  const [m, setM] = useState<MappingState>(initial);
  const [more, setMore] = useState(false);
  const def = cat.find((e) => e.key === m.entity)!;
  useEffect(() => setM(initial), [initial]);

  const changeEntity = (key: string) => {
    const d = cat.find((e) => e.key === key)!;
    setM({ ...m, entity: key, mapping: autoMap(d.fields, headers), fixed: {}, flipSign: !!d.sign?.defaultFlip });
  };
  const used = new Set(Object.values(m.mapping).filter(Boolean) as string[]);
  const unusedHeaders = headers.filter((h) => !used.has(h));
  const sample = (h: string | null) => (h ? samples.map((s) => s[h]).filter((v) => v != null && String(v).trim() !== "").slice(0, 3).map(String) : []);

  // which fields to show first: required, mapped, or commonly needed
  const isMain = (f: CatalogEntity["fields"][number]) => !!f.required || !!m.mapping[f.key] || !!m.fixed[f.key] || ["payee", "category", "description", "memo", "docNumber", "className", "location"].includes(f.key);
  const main = def.fields.filter(isMain);
  const rest = def.fields.filter((f) => !isMain(f));
  const missing = def.fields.filter((f) => f.required === true && !m.mapping[f.key] && !m.fixed[f.key]);
  const oneOf = def.fields.filter((f) => f.required === "one-of");
  const oneOfMissing = oneOf.length > 0 && !oneOf.some((f) => m.mapping[f.key] || m.fixed[f.key]);

  const row = (f: CatalogEntity["fields"][number]) => {
    const h = m.mapping[f.key];
    const s = sample(h);
    const dlId = f.type === "ref" ? `dl-${f.ref === "Name" ? "Name" : f.ref}` : f.options ? `dl-opt-${f.key}` : undefined;
    return (
      <tr key={f.key} className="border-b border-rule-2 last:border-0 align-top">
        <td className="px-4 py-2.5">
          <div className="text-[13.5px] font-medium text-ink">
            {f.label}
            {f.required === true && <span className="ml-1 text-red" title="Required">*</span>}
          </div>
          {f.required === "one-of" && <div className="mt-0.5 text-[12px] text-ink-3">Needed: this or another amount column</div>}
          {f.help && <div className="mt-0.5 text-[12px] text-ink-3">{f.help}</div>}
          {f.line && def.groupBy && <div className="mt-0.5 text-[11.5px] text-ink-4">Changes per line</div>}
        </td>
        <td className="px-4 py-2.5">
          <select className={cx("field", h ? "border-green-line" : "")} value={h || ""} onChange={(e) => setM({ ...m, mapping: { ...m.mapping, [f.key]: e.target.value || null } })}>
            <option value="">— Not in the file —</option>
            {headers.map((x) => <option key={x} value={x}>{x}{used.has(x) && x !== h ? "  (used)" : ""}</option>)}
          </select>
          {s.length > 0 && <div className="mt-1 truncate text-[12px] text-ink-3" title={s.join(", ")}>e.g. {s.join(", ")}</div>}
        </td>
        <td className="px-4 py-2.5">
          <input className="field" list={dlId} placeholder={h ? "Used when the cell is empty" : f.type === "ref" ? `Same ${f.label.toLowerCase()} for every row` : "Same value for every row"}
            value={m.fixed[f.key] || ""} onChange={(e) => setM({ ...m, fixed: { ...m.fixed, [f.key]: e.target.value } })} />
          {f.options && <datalist id={`dl-opt-${f.key}`}>{f.options.map((o) => <option key={o} value={o} />)}</datalist>}
        </td>
      </tr>
    );
  };

  const set = (k: keyof ImportSettings, v: ImportSettings[keyof ImportSettings]) => setM({ ...m, settings: { ...m.settings, [k]: v } });

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
      <RefLists lists={lists} />
      <Panel pad={false} title="Match your columns" actions={saved
        ? <Badge tone="green"><Wand2 className="size-3" /> Saved matching used (by {saved.updatedBy})</Badge>
        : <Badge tone="blue"><Wand2 className="size-3" /> Matched by column title</Badge>}>
        <table className="w-full table-fixed">
          <colgroup><col className="w-[30%]" /><col className="w-[36%]" /><col className="w-[34%]" /></colgroup>
          <thead>
            <tr className="border-b border-rule text-left text-[12px] text-ink-3">
              <th className="px-4 py-2 font-medium">QuickBooks field</th><th className="px-4 py-2 font-medium">Column in your file</th><th className="px-4 py-2 font-medium">Or the same value for every row</th>
            </tr>
          </thead>
          <tbody>{main.map(row)}</tbody>
        </table>
        {rest.length > 0 && (
          <>
            <button onClick={() => setMore(!more)} className="flex w-full items-center gap-1.5 border-t border-rule-2 px-4 py-2.5 text-left text-[13px] font-medium text-ink-2 hover:bg-ledger">
              {more ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />} {more ? "Hide" : "Show"} {rest.length} more fields
            </button>
            {more && <table className="w-full table-fixed border-t border-rule-2"><colgroup><col className="w-[30%]" /><col className="w-[36%]" /><col className="w-[34%]" /></colgroup><tbody>{rest.map(row)}</tbody></table>}
          </>
        )}
        {unusedHeaders.length > 0 && (
          <div className="border-t border-rule-2 px-4 py-3 text-[12.5px] text-ink-3">
            <b className="font-medium text-ink-2">Columns not used:</b> {unusedHeaders.join(", ")}
          </div>
        )}
      </Panel>

      <aside className="space-y-5">
        <Panel title="Import type">
          <select className="field" value={m.entity} onChange={(e) => changeEntity(e.target.value)}>
            {["Banking", "Purchases", "Sales", "Accounting", "Lists"].map((g) => <optgroup key={g} label={g}>{cat.filter((e) => e.group === g).map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}</optgroup>)}
          </select>
          <p className="mt-2 text-[12.5px] text-ink-3">{def.description}</p>
          {def.groupBy && <p className="mt-2 flex gap-1.5 text-[12.5px] text-ink-3"><Info className="mt-0.5 size-3.5 shrink-0" />Rows with the same {def.fields.find((f) => f.key === def.groupBy)?.label} become one transaction with several lines.</p>}
        </Panel>

        {def.sign && (
          <Panel title="Amount signs">
            <Label>A positive amount means</Label>
            <div className="grid grid-cols-2 gap-1 rounded-[var(--radius-sm)] border border-rule p-0.5">
              {[false, true].map((flip) => (
                <button key={String(flip)} onClick={() => setM({ ...m, flipSign: flip })}
                  className={cx("rounded-[4px] px-2 py-1.5 text-[12.5px] font-medium", m.flipSign === flip ? "bg-green text-white" : "text-ink-2 hover:bg-ledger")}>
                  {flip ? def.sign!.neg : def.sign!.pos}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[12px] text-ink-3">Only used for the single Amount column. Separate debit / credit columns are read as they are.</p>
          </Panel>
        )}

        <Panel title="Options">
          <div className="space-y-3.5">
            <div>
              <Label>Dates in the file are written</Label>
              <select className="field" value={m.settings.dateFormat} onChange={(e) => set("dateFormat", e.target.value as ImportSettings["dateFormat"])}>
                <option value="auto">Work it out (US month/day first)</option>
                <option value="MDY">Month / day / year (12/31/2025)</option>
                <option value="DMY">Day / month / year (31/12/2025)</option>
                <option value="YMD">Year-month-day (2025-12-31)</option>
              </select>
            </div>
            <Toggle checked={m.settings.autoCreate} onChange={(v) => set("autoCreate", v)} label="Create missing names" help="New vendors, customers, classes, locations and payment methods are added to QuickBooks. Accounts and products are never created by accident." />
            <Toggle checked={m.settings.duplicateCheck} onChange={(v) => set("duplicateCheck", v)} label="Look for duplicates" help="Flags rows that match a transaction already in QuickBooks (same account, date and amount, or same document number)." />
            <Toggle checked={m.settings.useFileRefNo} onChange={(v) => set("useFileRefNo", v)} label="Keep reference numbers from the file" />
            {(def.key === "bank-statement" || def.key === "card-statement") && <Toggle checked={m.settings.applyRules} onChange={(v) => set("applyRules", v)} label="Apply bank rules" help="Fills the account, payee and type from your rules when the file leaves them empty." />}
            <Toggle checked={m.settings.matchAccountByNumber} onChange={(v) => set("matchAccountByNumber", v)} label="Accounts can be given by number" />
          </div>
        </Panel>

        <div className="panel sticky top-[72px] p-4">
          {missing.length || oneOfMissing ? (
            <p className="mb-3 text-[13px] text-amber">
              Still needed: {[...missing.map((f) => f.label), ...(oneOfMissing ? [oneOf.map((f) => f.label).join(" or ")] : [])].join(", ")}. Match a column or type a value for every row.
            </p>
          ) : <p className="mb-3 text-[13px] text-ink-3">All required fields are covered. Next, every row is checked against QuickBooks. Nothing is posted yet.</p>}
          <Button variant="primary" size="lg" className="w-full" loading={busy} disabled={!!missing.length || oneOfMissing} onClick={() => onSubmit(m)}>Check rows</Button>
          {onCancel && <Button variant="ghost" className="mt-2 w-full" onClick={onCancel}>Back to review</Button>}
        </div>
      </aside>
    </div>
  );
}

