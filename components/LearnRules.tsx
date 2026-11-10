"use client";
import { useMemo, useRef, useState } from "react";
import { FileSpreadsheet, GraduationCap } from "lucide-react";
import { Badge, Button, Modal, Toggle, cx, useToast } from "./ui";
import { api, plural } from "@/lib/client";
import { readWorkbook } from "@/lib/parse/file";
import { autoMap } from "@/lib/import/automap";
import { catalog } from "@/lib/import/entities";
import { learnRules, type Learned } from "@/lib/import/learn";
import { parseNumber } from "@/lib/parse/values";

const BANK = catalog().find((e) => e.key === "bank-statement")!;

/** Upload a register (or any categorised bank file) and turn its categorisation into bank rules. */
export function LearnRules({ open, onClose, onAdded, company }: { open: boolean; onClose: () => void; onAdded: () => void; company: string }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState("");
  const [found, setFound] = useState<Learned[] | null>(null);
  const [lines, setLines] = useState(0);
  const [pick, setPick] = useState<Set<number>>(new Set());
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);

  async function read(f?: File) {
    if (!f) return;
    try {
      const sheets = readWorkbook(await f.arrayBuffer(), f.name);
      const s = sheets[0];
      if (!s) throw new Error("No rows found in this file.");
      const m = autoMap(BANK.fields, s.headers);
      if (!m.description || !m.category) throw new Error("This file needs a bank text column (Memo or Description) and an Account column. Export a register report from QuickBooks: Chart of accounts → View register → Export.");
      const rows = s.rows.map((r) => {
        const g = (k: string) => (m[k] ? String(r.data[m[k]!] ?? "").trim() : "");
        const amt = parseNumber(g("amount"));
        const moneyIn = amt != null ? amt > 0 : (parseNumber(g("credit")) ?? 0) > 0;
        return { text: g("description"), payee: g("payee"), account: g("category"), className: g("className"), location: g("location"), type: g("type"), moneyIn };
      });
      const learned = learnRules(rows);
      setFile(f.name); setLines(rows.length); setFound(learned); setPick(new Set(learned.map((_, i) => i)));
    } catch (e) { toast("error", (e as Error).message); }
  }
  const covered = useMemo(() => {
    if (!found) return 0;
    return found.filter((_, i) => pick.has(i)).reduce((s, r) => s + r.count, 0);
  }, [found, pick]);

  async function add() {
    setBusy(true);
    try {
      const r = await api("/api/rules", { json: { action: "bulk", fileName: file, allCompanies: all, rules: found!.filter((_, i) => pick.has(i)) } });
      toast("ok", `${plural(r.added, "rule")} added${r.skipped ? `, ${r.skipped} skipped (already there)` : ""}.`);
      onAdded(); close();
    } catch (e) { toast("error", (e as Error).message); } finally { setBusy(false); }
  }
  function close() { setFound(null); setFile(""); if (input.current) input.current.value = ""; onClose(); }

  return (
    <Modal open={open} onClose={close} xl title="Learn bank rules from past work"
      footer={found ? <>
        <span className="mr-auto self-center text-[12.5px] text-ink-3">{plural(pick.size, "rule")} selected, matching about {plural(covered, "line")} of the {lines} in this file.</span>
        <Button onClick={close}>Cancel</Button>
        <Button variant="primary" loading={busy} disabled={!pick.size} onClick={add}>Add {plural(pick.size, "rule")}</Button>
      </> : undefined}>
      {!found ? (
        <div>
          <p className="mb-4 max-w-[70ch]">Upload a register report exported from QuickBooks (or any bank file that already has an Account column). GATP Ledger looks at how each kind of bank line was categorised, and suggests rules so next month’s statement for <b className="text-ink">{company || "this company"}</b> is filled in automatically.</p>
          <label className="flex cursor-pointer flex-col items-center rounded-[var(--radius-md)] border-2 border-dashed border-green-line/70 bg-[#f8fbf9] px-6 py-10 text-center hover:border-green hover:bg-green-soft/50">
            <input ref={input} type="file" hidden accept=".xlsx,.xls,.xlsm,.csv,.tsv,.txt,.ods" onChange={(e) => read(e.target.files?.[0])} />
            <span className="grid size-12 place-items-center rounded-full bg-gradient-to-br from-mint to-green text-white"><GraduationCap className="size-6" /></span>
            <span className="mt-3 text-[14.5px] font-semibold text-ink">Choose a register report</span>
            <span className="mt-1 text-[12.5px] text-ink-3">In QuickBooks: Chart of accounts → the bank account → View register → Export to Excel</span>
          </label>
        </div>
      ) : (
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1.5 text-[13px]"><FileSpreadsheet className="size-4 text-green" />{file}</span>
            <Badge tone="green">{plural(found.length, "rule")} suggested</Badge>
            <div className="ml-auto"><Toggle checked={all} onChange={setAll} label="Use for every company" /></div>
          </div>
          <div className="max-h-[52vh] overflow-auto rounded-[var(--radius-md)] border border-rule">
            <table className="ledger-grid w-full">
              <thead><tr>
                <th className="w-8 !px-2"><input type="checkbox" aria-label="Select all" checked={pick.size === found.length} onChange={() => setPick(pick.size === found.length ? new Set() : new Set(found.map((_, i) => i)))} /></th>
                <th>When the bank text contains</th><th>Money</th><th>Account</th><th>Class</th><th>Payee</th><th>Type</th><th className="text-right">Seen</th>
              </tr></thead>
              <tbody>
                {found.map((r, i) => (
                  <tr key={i} className={cx(pick.has(i) && "is-selected")}>
                    <td className="!px-2"><input type="checkbox" aria-label={`Use rule ${r.text}`} checked={pick.has(i)} onChange={() => { const s = new Set(pick); s.has(i) ? s.delete(i) : s.add(i); setPick(s); }} /></td>
                    <td><div className="font-semibold">{r.op === "number" ? "Only a reference number" : `“${r.text}”`}</div><div className="max-w-[300px] truncate text-[11.5px] text-ink-3" title={r.examples.join("\n")}>e.g. {r.examples[0]}</div></td>
                    <td>{r.direction === "in" ? <Badge tone="green">In</Badge> : <Badge>Out</Badge>}</td>
                    <td className="max-w-[260px] truncate" title={r.account}>{r.account}</td>
                    <td>{r.className || <span className="text-ink-4">—</span>}</td>
                    <td className="max-w-[180px] truncate">{r.payee || <span className="text-ink-4">—</span>}</td>
                    <td>{r.type || <span className="text-ink-4">from amount</span>}</td>
                    <td className="num text-right">{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[12.5px] text-ink-3">Lines that were categorised differently each time get no rule, so nothing is guessed. Bill payments are matched to unpaid bills instead of using rules.</p>
        </div>
      )}
    </Modal>
  );
}
