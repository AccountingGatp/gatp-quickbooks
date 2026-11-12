"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Wand2, Info } from "lucide-react";
import { Badge, Button, Label, Panel, Toggle, cx, useToast } from "@/components/ui";
import { statementMappingIssue } from "@/lib/import/automap";
import { api } from "@/lib/client";
import { assignColumn, mappingForType } from "@/lib/import/mapping";
import type { CatalogEntity } from "@/lib/import/entities";
import type { ImportSettings } from "@/lib/types";
import { RefLists, accountListId, type Lists } from "./RefLists";

export type MappingState = { entity: string; mapping: Record<string, string | null>; fixed: Record<string, string>; flipSign: boolean; settings: ImportSettings };

export function Mapping({ cat, headers, samples, initial, saved, lists, busy, onSubmit, onCancel, notice }: {
  cat: CatalogEntity[]; headers: string[]; samples: Record<string, unknown>[]; initial: MappingState; notice?: React.ReactNode;
  saved: { updatedBy: string; updatedAt: string } | null; lists: Lists; busy: boolean;
  onSubmit: (m: MappingState) => void; onCancel?: () => void;
}) {
  const toast = useToast();
  const [m, setM] = useState<MappingState>(() => ({ ...initial, mapping: mappingForType(cat.find((e) => e.key === initial.entity)!, headers, initial.mapping) }));
  const [matching, setMatching] = useState(false);
  const [matchingSaved, setMatchingSaved] = useState(saved);
  const edited = useRef(false);
  const request = useRef(0);
  const [more, setMore] = useState(false);
  const def = cat.find((e) => e.key === m.entity)!;
  const initKey = JSON.stringify(initial);
  useEffect(() => {
    if (!edited.current) {
      setM({ ...initial, mapping: mappingForType(cat.find((e) => e.key === initial.entity)!, headers, initial.mapping) });
      setMatchingSaved(saved);
    }
  }, [initKey, saved]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { request.current++; }, []);

  const changeEntity = async (key: string) => {
    edited.current = true;
    const d = cat.find((e) => e.key === key)!;
    const token = ++request.current;
    setMore(false); setMatching(true); setMatchingSaved(null);
    setM((prev) => ({ ...prev, entity: key, mapping: mappingForType(d, headers), fixed: {}, flipSign: !!d.sign?.defaultFlip }));
    try {
      const result = await api("/api/mappings", { json: { headers, entity: key } });
      if (request.current !== token) return;
      const hit = result.mapping?.entity === key ? result.mapping : null;
      if (hit) {
        const fixed = Object.fromEntries(d.fields.filter((f) => hit.fixed?.[f.key]).map((f) => [f.key, hit.fixed[f.key]]));
        setM((prev) => ({ ...prev, mapping: mappingForType(d, headers, hit.mapping), fixed, flipSign: !!hit.flipSign }));
        setMatchingSaved(hit);
      }
    } catch { if (request.current === token) toast("info", "Saved matching could not be loaded. Columns were matched for this type by their titles."); }
    finally { if (request.current === token) setMatching(false); }
  };
  const used = new Set(Object.values(m.mapping).filter(Boolean) as string[]);
  const sample = (h: string) => samples.map((s) => s[h]).filter((v) => v != null && String(v).trim() !== "").slice(0, 3).map(String);
  const unmappedFields = def.fields.filter((f) => !m.mapping[f.key]);
  const isMain = (f: CatalogEntity["fields"][number]) => !!f.required || !!m.fixed[f.key] || ["bankAccount", "ccAccount", "payee", "category", "memo", "docNumber", "paymentIds", "billNo"].includes(f.key);
  const main = unmappedFields.filter(isMain);
  const rest = unmappedFields.filter((f) => !isMain(f));
  const missing = def.fields.filter((f) => f.required === true && !m.mapping[f.key] && !m.fixed[f.key]);
  const oneOf = def.fields.filter((f) => f.required === "one-of");
  const oneOfMissing = oneOf.length > 0 && !oneOf.some((f) => m.mapping[f.key] || m.fixed[f.key]);
  const amountMappingIssue = statementMappingIssue(m.entity, headers, m.mapping);
  const disabled = busy || matching;

  // a bank / card account field matched to a column of categories (e.g. a register's "Account" column)
  const wrongType = (f: CatalogEntity["fields"][number], samples: string[]) => {
    if (f.ref !== "Account" || !f.accountTypes?.length || !samples.length || !lists.Account?.length) return "";
    const low = (x: string) => x.toLowerCase().replace(/\s+/g, " ").trim();
    const strip = (x: string) => low(x).split(":").map((p) => p.replace(/^\d[\d.-]*\s+/, "")).join(":");
    const bad = samples.map((v) => lists.Account.find((a) => low(a.name) === strip(v) || low(a.name.split(":").pop()!) === strip(v).split(":").pop()))
      .filter((a): a is NonNullable<typeof a> => !!a && !!a.type && !f.accountTypes!.includes(a.type));
    return bad.length ? `This column holds ${bad[0].type} accounts like “${bad[0].name}”, not ${f.accountTypes.join(" / ")} accounts. Map it to the line account instead, then set ${f.label} under “Values not supplied by file columns”.` : "";
  };
  const fixedRow = (f: CatalogEntity["fields"][number]) => {
    const dlId = f.type === "ref" ? (f.ref === "Account" ? accountListId(f.accountTypes) : `dl-${f.ref}`) : f.options ? `dl-opt-${f.key}` : undefined;
    return <div key={f.key} className="grid gap-2 border-b border-rule-2 px-4 py-3 last:border-0 sm:grid-cols-[1fr_1fr]">
      <label htmlFor={`fixed-${f.key}`} className="text-[13px] font-medium">{f.label}{f.required === true && <span className="ml-1 text-red">*</span>}
        {f.help && <span className="mt-1 block text-[12px] font-normal text-ink-3">{f.help}</span>}
        {f.required === "one-of" && <span className="mt-1 block text-[12px] font-normal text-ink-3">Use this amount or map another amount field.</span>}
      </label>
      <input id={`fixed-${f.key}`} className="field" list={dlId} disabled={disabled} placeholder={`Same ${f.label.toLowerCase()} for every row`} value={m.fixed[f.key] || ""}
        onChange={(e) => { edited.current = true; setM({ ...m, fixed: { ...m.fixed, [f.key]: e.target.value } }); }} />
      {f.options && <datalist id={`dl-opt-${f.key}`}>{f.options.map((o) => <option key={o} value={o} />)}</datalist>}
    </div>;
  };
  const columnRow = (header: string) => {
    const field = def.fields.find((f) => m.mapping[f.key] === header);
    const values = sample(header);
    const warning = field ? wrongType(field, values) : "";
    return <tr key={header} className="border-b border-rule-2 align-top last:border-0">
      <th scope="row" className="px-4 py-3 text-left">
        <div className="break-words text-[13.5px] font-semibold">{header}</div>
        {values.length > 0 && <div className="mt-1 break-words text-[12px] font-normal text-ink-3">{values.join(" · ")}</div>}
      </th>
      <td className="px-4 py-3">
        <select aria-label={`Map ${header}`} className={cx("field", field ? "border-green-line" : "")} disabled={disabled} value={field?.key || ""}
          onChange={(e) => { edited.current = true; const key = e.target.value; setM((prev) => ({ ...prev, mapping: assignColumn(def, prev.mapping, header, key), fixed: { ...prev.fixed, ...(key ? { [key]: "" } : {}) } })); }}>
          <option value="">— Ignore this column —</option>
          {fieldGroups.map(({ label, fields }) => fields.length > 0 &&
            <optgroup key={label} label={label}>{fields.map((f) => <option key={f.key} value={f.key}>{f.label}{f.required === true ? " *" : ""}{m.mapping[f.key] && m.mapping[f.key] !== header ? ` (moves from ${m.mapping[f.key]})` : ""}</option>)}</optgroup>)}
        </select>
        {field?.help && <p className="mt-1 text-[12px] text-ink-3">{field.help}</p>}
        {field && <input aria-label={`Default ${field.label} when ${header} is blank`} className="field mt-2" disabled={disabled}
          list={field.ref ? (field.ref === "Account" ? accountListId(field.accountTypes) : `dl-${field.ref}`) : undefined}
          placeholder="Default when this column is blank (optional)" value={m.fixed[field.key] || ""}
          onChange={(e) => { edited.current = true; setM({ ...m, fixed: { ...m.fixed, [field.key]: e.target.value } }); }} />}
        <p className={cx("mt-1 text-[12px]", field ? "text-green" : "text-ink-3")}>{field ? `${def.label} · ${field.line ? "Line item" : "Transaction"}` : "Not imported"}</p>
        {warning && <p className="mt-1 text-[12px] text-red" role="alert">{warning}</p>}
      </td>
    </tr>;
  };
  const fieldGroups = [
    { label: "Required fields", fields: def.fields.filter((f) => f.required === true) },
    { label: "Transaction fields", fields: def.fields.filter((f) => f.required !== true && !f.line) },
    { label: "Line item fields", fields: def.fields.filter((f) => f.required !== true && f.line) },
  ];
  const set = (k: keyof ImportSettings, v: ImportSettings[keyof ImportSettings]) => { edited.current = true; setM({ ...m, settings: { ...m.settings, [k]: v } }); };

  return (
    <>
    <Panel title="What does this worksheet contain?">
      <label htmlFor="mapping-import-type" className="mb-2 block text-[13px] font-medium">Transaction / list type</label>
      <select id="mapping-import-type" className="field max-w-[360px]" disabled={busy} value={m.entity} onChange={(e) => changeEntity(e.target.value)}>
        {["Banking", "Purchases", "Sales", "Accounting", "Lists"].map((g) => <optgroup key={g} label={g}>{cat.filter((e) => e.group === g).map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}</optgroup>)}
      </select>
      <p className="mt-2 text-[13px] text-ink-3">{def.description}</p>
      <p className="mt-1 text-[12px] text-ink-3">Only {def.label.toLowerCase()} fields are available below. Changing the type rebuilds the mapping for this worksheet.</p>
    </Panel>
    {m.entity === initial.entity && notice}
    <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_320px]">
      <RefLists lists={lists} />
      <div className="space-y-5">
        <Panel pad={false} title={`Map columns for ${def.label}`} actions={matching ? <Badge tone="blue">Matching {def.label.toLowerCase()}…</Badge> : matchingSaved
          ? <Badge tone="green"><Wand2 className="size-3" /> Saved {def.label.toLowerCase()} matching (by {matchingSaved.updatedBy})</Badge>
          : <Badge tone="blue"><Wand2 className="size-3" /> Matched for {def.label.toLowerCase()}</Badge>}>
          <p className="border-b border-rule-2 px-4 py-3 text-[12.5px] text-ink-3">{headers.length} columns read from your worksheet · {used.size} mapped. Your column titles and sample values appear on the left; choose the matching QuickBooks field on the right.</p>
          <table className="w-full table-fixed" aria-label={`${def.label} column mapping`}>
            <colgroup><col className="w-[45%]" /><col className="w-[55%]" /></colgroup>
            <thead><tr className="border-b border-rule text-left text-[12px] text-ink-3"><th scope="col" className="px-4 py-2 font-medium">Your worksheet column · sample values</th><th scope="col" className="px-4 py-2 font-medium">QuickBooks {def.label.toLowerCase()} field</th></tr></thead>
            <tbody>{headers.map(columnRow)}</tbody>
          </table>
        </Panel>
        {unmappedFields.length > 0 && <Panel pad={false} title="Values not supplied by file columns">
          <p className="border-b border-rule-2 px-4 py-3 text-[12.5px] text-ink-3">Map another column above, or set a value here for every row. Only fields for {def.label.toLowerCase()} are shown.</p>
          {main.map(fixedRow)}
          {rest.length > 0 && <><button disabled={disabled} onClick={() => setMore(!more)} className="flex w-full items-center gap-1.5 border-t border-rule-2 px-4 py-2.5 text-left text-[13px] font-medium text-ink-2 hover:bg-ledger">
            {more ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />} {more ? "Hide" : "Show"} {rest.length} optional {def.label.toLowerCase()} fields
          </button>{more && rest.map(fixedRow)}</>}
        </Panel>}
      </div>
      <aside className="space-y-5">
        {def.groupBy && <Panel title="How lines are grouped"><p className="flex gap-1.5 text-[12.5px] text-ink-3"><Info className="mt-0.5 size-3.5 shrink-0" />Rows with the same {def.fields.find((f) => f.key === def.groupBy)?.label} become one transaction with several lines.</p></Panel>}

        {def.sign && (
          <Panel title="Amount signs">
            <Label>A positive amount means</Label>
            <div className="grid grid-cols-2 gap-1 rounded-[var(--radius-sm)] border border-rule p-0.5">
              {[false, true].map((flip) => (
                <button key={String(flip)} disabled={disabled} onClick={() => { edited.current = true; setM({ ...m, flipSign: flip }); }}
                  className={cx("rounded-[4px] px-2 py-1.5 text-[12.5px] font-medium", m.flipSign === flip ? "bg-green text-white" : "text-ink-2 hover:bg-ledger")}>
                  {flip ? def.sign!.neg : def.sign!.pos}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[12px] text-ink-3">Only used for the single Amount column. The labels explain the sign convention for this transaction type.</p>
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
          {amountMappingIssue && <p className="mb-3 text-[13px] text-red" role="alert">{amountMappingIssue}</p>}
          {missing.length || oneOfMissing ? (
            <p className="mb-3 text-[13px] text-amber">
              Still needed: {[...missing.map((f) => f.label), ...(oneOfMissing ? [oneOf.map((f) => f.label).join(" or ")] : [])].join(", ")}. Match a column or type a value for every row.
            </p>
          ) : !amountMappingIssue && <p className="mb-3 text-[13px] text-ink-3">All required {def.label.toLowerCase()} fields are covered. Next, every row is checked against QuickBooks. Nothing is posted yet.</p>}
          <Button variant="primary" size="lg" className="w-full" loading={busy} disabled={disabled || !!missing.length || oneOfMissing || !!amountMappingIssue} onClick={() => onSubmit(m)}>Check rows</Button>
          {onCancel && <Button variant="ghost" className="mt-2 w-full" onClick={onCancel}>Back to review</Button>}
        </div>
      </aside>
    </div>
    </>
  );
}


