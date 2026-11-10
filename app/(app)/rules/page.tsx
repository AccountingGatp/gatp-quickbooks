"use client";
import { useEffect, useState } from "react";
import { GraduationCap, Plus, Wand2, Pencil, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Badge, Button, Empty, Label, Modal, PageHeader, Panel, Spinner, Toggle, useToast } from "@/components/ui";
import { RefLists, type Lists } from "@/components/import/RefLists";
import { LearnRules } from "@/components/LearnRules";
import { api } from "@/lib/client";

type Rule = { _id?: string; realmId?: string; name: string; enabled: boolean; order?: number; hits?: number; match: { field: "description" | "payee"; op: "contains" | "starts" | "equals" | "number"; text: string; direction: "any" | "in" | "out" }; set: { account?: string; payee?: string; type?: string; className?: string; location?: string; memo?: string }; allCompanies?: boolean };
const blank: Rule = { name: "", enabled: true, match: { field: "description", op: "contains", text: "", direction: "any" }, set: {} };
const OPS = { contains: "contains", starts: "starts with", equals: "is exactly", number: "is only a number" };

export default function RulesPage() {
  const toast = useToast();
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [edit, setEdit] = useState<Rule | null>(null);
  const [lists, setLists] = useState<Lists>({});
  const [co, setCo] = useState("");
  const [learn, setLearn] = useState(false);
  const load = () => api("/api/rules").then((r) => setRules(r.rules));
  useEffect(() => {
    load();
    api("/api/companies").then((r) => setCo(r.companies.find((c: any) => c.realmId === r.active)?.name || ""));
    api("/api/lists?kinds=Account,Vendor,Customer,Employee,Class,Department").then(setLists).catch(() => {});
  }, []);

  async function save(r: Rule) {
    try { await api("/api/rules", { json: { ...r, id: r._id, allCompanies: r.allCompanies ?? r.realmId === "*" } }); setEdit(null); load(); toast("ok", "Rule saved."); }
    catch (e) { toast("error", (e as Error).message); }
  }
  async function remove(r: Rule) {
    try { await api("/api/rules", { json: { action: "delete", id: r._id, name: r.name } }); load(); toast("ok", "Rule deleted."); } catch (e) { toast("error", (e as Error).message); }
  }
  async function move(i: number, d: -1 | 1) {
    if (!rules) return;
    const next = [...rules]; const [x] = next.splice(i, 1); next.splice(i + d, 0, x); setRules(next);
    await api("/api/rules", { json: { action: "reorder", ids: next.map((r) => r._id) } });
  }

  return (
    <>
      <RefLists lists={lists} />
      <PageHeader icon={<Wand2 />} tone="violet" title="Bank rules" sub={<>Fill in the account, payee and type of bank and card statement lines automatically. Rules run top to bottom; the first match wins, and only empty cells are filled. Rules here apply to <b className="font-semibold text-ink">{co || "this company"}</b>, or to every company if you choose.</>}
        actions={<><Button icon={<GraduationCap className="size-4" />} onClick={() => setLearn(true)}>Learn from a register</Button><Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEdit({ ...blank })}>Add rule</Button></>} />
      <Panel pad={false}>
        {!rules ? <div className="py-14 text-center"><Spinner /></div> : !rules.length ? (
          <Empty icon={<Wand2 className="size-8" />} title="No rules yet" action={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEdit({ ...blank, name: "Uber rides", match: { ...blank.match, text: "UBER" }, set: { account: "Travel", payee: "Uber" } })}>Add your first rule</Button>}>
            For example: when the description contains “UBER”, use account Travel and payee Uber. Or let GATP Ledger learn them from a register report of work already done.
          </Empty>
        ) : (
          <table className="ledger-grid w-full">
            <thead><tr><th className="!p-0" /><th className="w-16">Order</th><th>When</th><th>Then fill in</th><th>Applies to</th><th className="text-right">Used</th><th /></tr></thead>
            <tbody>
              {rules.map((r, i) => (
                <tr key={r._id} className={r.enabled ? "" : "opacity-55"}>
                  <td className="rail bg-green-line" />
                  <td className="whitespace-nowrap">
                    <button className="rounded p-0.5 text-ink-3 hover:bg-ledger disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp className="size-3.5" /></button>
                    <button className="rounded p-0.5 text-ink-3 hover:bg-ledger disabled:opacity-30" disabled={i === rules.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown className="size-3.5" /></button>
                  </td>
                  <td><div className="font-medium">{r.name}</div><div className="text-[12.5px] text-ink-3">{r.match.field === "payee" ? "Payee" : "Description"} {OPS[r.match.op]}{r.match.op !== "number" && <> “{r.match.text}”</>}{r.match.direction !== "any" && (r.match.direction === "in" ? ", money in only" : ", money out only")}</div></td>
                  <td className="text-[12.5px]">{Object.entries(r.set).filter(([, v]) => v).map(([k, v]) => <div key={k}><span className="text-ink-3">{({ account: "Account", payee: "Payee", type: "Type", className: "Class", location: "Location", memo: "Memo" } as any)[k]}:</span> {v}</div>)}</td>
                  <td>{r.realmId === "*" ? <Badge tone="blue">All companies</Badge> : <Badge>This company</Badge>}{!r.enabled && <Badge className="ml-1">Off</Badge>}</td>
                  <td className="num text-right text-ink-3">{(r.hits || 0).toLocaleString()}</td>
                  <td className="whitespace-nowrap text-right">
                    <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEdit(r)}>Edit</Button>
                    <Button size="sm" variant="ghost" className="text-red" icon={<Trash2 className="size-3.5" />} onClick={() => remove(r)} aria-label="Delete rule" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      <LearnRules open={learn} onClose={() => setLearn(false)} onAdded={load} company={co} />
      {edit && <RuleForm rule={edit} onClose={() => setEdit(null)} onSave={save} />}
    </>
  );
}

function RuleForm({ rule, onClose, onSave }: { rule: Rule; onClose: () => void; onSave: (r: Rule) => void }) {
  const [r, setR] = useState<Rule>({ ...rule, allCompanies: rule.realmId === "*" });
  const setS = (k: keyof Rule["set"], v: string) => setR({ ...r, set: { ...r.set, [k]: v } });
  return (
    <Modal open onClose={onClose} wide title={rule._id ? "Edit rule" : "Add rule"} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => onSave(r)}>Save rule</Button></>}>
      <div className="grid gap-4">
        <div><Label>Rule name</Label><input className="field" value={r.name} placeholder="e.g. Uber rides" onChange={(e) => setR({ ...r, name: e.target.value })} /></div>
        <fieldset className="rounded-[var(--radius-md)] border border-rule p-3">
          <legend className="px-1 text-[12.5px] font-semibold text-ink-2">When</legend>
          <div className="grid gap-2 sm:grid-cols-[150px_140px_1fr]">
            <select className="field" value={r.match.field} onChange={(e) => setR({ ...r, match: { ...r.match, field: e.target.value as any } })}><option value="description">Description</option><option value="payee">Payee</option></select>
            <select className="field" value={r.match.op} onChange={(e) => setR({ ...r, match: { ...r.match, op: e.target.value as any } })}>{Object.entries(OPS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <input className="field" disabled={r.match.op === "number"} value={r.match.op === "number" ? "" : r.match.text} placeholder={r.match.op === "number" ? "for lines like 260929090020415" : "text, not case sensitive"} onChange={(e) => setR({ ...r, match: { ...r.match, text: e.target.value } })} />
          </div>
          <div className="mt-2 sm:w-[300px]">
            <select className="field" value={r.match.direction} onChange={(e) => setR({ ...r, match: { ...r.match, direction: e.target.value as any } })}><option value="any">Money in or out</option><option value="out">Money out only</option><option value="in">Money in only</option></select>
          </div>
        </fieldset>
        <fieldset className="rounded-[var(--radius-md)] border border-rule p-3">
          <legend className="px-1 text-[12.5px] font-semibold text-ink-2">Then fill in</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Account (category)</Label><input className="field" list="dl-Account" value={r.set.account || ""} onChange={(e) => setS("account", e.target.value)} /></div>
            <div><Label>Payee</Label><input className="field" list="dl-Name" value={r.set.payee || ""} onChange={(e) => setS("payee", e.target.value)} /></div>
            <div><Label>Transaction type</Label><select className="field" value={r.set.type || ""} onChange={(e) => setS("type", e.target.value)}><option value="">Decide from the amount</option><option>Expense</option><option>Check</option><option>Deposit</option><option>Transfer</option><option value="CreditCardCredit">Card credit</option></select></div>
            <div><Label>Class</Label><input className="field" list="dl-Class" value={r.set.className || ""} onChange={(e) => setS("className", e.target.value)} /></div>
            <div><Label>Location</Label><input className="field" list="dl-Department" value={r.set.location || ""} onChange={(e) => setS("location", e.target.value)} /></div>
            <div><Label>Memo</Label><input className="field" value={r.set.memo || ""} onChange={(e) => setS("memo", e.target.value)} /></div>
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-6">
          <Toggle checked={!!r.allCompanies} onChange={(v) => setR({ ...r, allCompanies: v })} label="Use for every company" help="Account and payee names must exist in each company." />
          <Toggle checked={r.enabled} onChange={(v) => setR({ ...r, enabled: v })} label="Rule is on" />
        </div>
      </div>
    </Modal>
  );
}
