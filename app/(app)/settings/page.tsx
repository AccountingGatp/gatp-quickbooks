"use client";
import { useEffect, useState } from "react";
import { Copy, CheckCircle2, XCircle, Settings2 } from "lucide-react";
import { Button, Label, PageHeader, Panel, Spinner, Toggle, useToast } from "@/components/ui";
import { api } from "@/lib/client";
import type { ImportSettings } from "@/lib/types";

export default function SettingsPage() {
  const toast = useToast();
  const [s, setS] = useState<ImportSettings | null>(null);
  const [co, setCo] = useState("");
  const [sys, setSys] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api("/api/settings").then((r) => { setS(r.settings); setCo(r.company); }).catch(() => setS(null));
    api("/api/system").then(setSys);
  }, []);
  async function save() {
    setBusy(true);
    try { await api("/api/settings", { method: "PUT", json: s }); toast("ok", `Import options saved for ${co}.`); } catch (e) { toast("error", (e as Error).message); } finally { setBusy(false); }
  }
  const set = (k: keyof ImportSettings, v: any) => setS((x) => x && { ...x, [k]: v });
  const copy = (t: string) => { navigator.clipboard.writeText(t); toast("ok", "Copied."); };
  const ok = (b: boolean, label: string) => <span className="flex items-center gap-1.5">{b ? <CheckCircle2 className="size-4 text-green" /> : <XCircle className="size-4 text-red" />}{label}</span>;

  return (
    <>
      <PageHeader icon={<Settings2 />} tone="gray" title="Settings" />
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title={co ? `Import options for ${co}` : "Import options"}>
          {!s ? <p className="text-[13.5px] text-ink-3">Choose a company at the top to set its default import options.</p> : (
            <div className="space-y-4">
              <p className="text-[13px] text-ink-3">New imports for this company start with these options. Each import can still change them on the Match columns step.</p>
              <div className="max-w-[340px]"><Label>Dates in files are written</Label>
                <select className="field" value={s.dateFormat} onChange={(e) => set("dateFormat", e.target.value)}>
                  <option value="auto">Work it out (US month/day first)</option><option value="MDY">Month / day / year</option><option value="DMY">Day / month / year</option><option value="YMD">Year-month-day</option>
                </select></div>
              <Toggle checked={s.autoCreate} onChange={(v) => set("autoCreate", v)} label="Create missing names" help="Vendors, customers, classes, locations and payment methods." />
              <Toggle checked={s.duplicateCheck} onChange={(v) => set("duplicateCheck", v)} label="Look for duplicates before posting" />
              <Toggle checked={s.useFileRefNo} onChange={(v) => set("useFileRefNo", v)} label="Keep reference numbers from the file" />
              <Toggle checked={s.applyRules} onChange={(v) => set("applyRules", v)} label="Apply bank rules to statements" />
              <Toggle checked={s.matchAccountByNumber} onChange={(v) => set("matchAccountByNumber", v)} label="Accounts can be given by number" />
              <Button variant="primary" loading={busy} onClick={save}>Save options</Button>
            </div>
          )}
        </Panel>
        <Panel title="System">
          {!sys ? <Spinner /> : (
            <div className="space-y-4 text-[13.5px]">
              <div className="grid grid-cols-2 gap-2">
                {ok(sys.db.ok, `MongoDB (${sys.db.name})`)}
                {ok(sys.qbo.environment === "demo" || sys.qbo.clientId, `QuickBooks: ${sys.qbo.environment}`)}
                {ok(sys.secrets.session, "Login secret set")}
                {ok(sys.secrets.tokens, "Token encryption key set")}
              </div>
              {sys.db.error && <p className="text-[12.5px] text-red">{sys.db.error}</p>}
              <div>
                <div className="mb-1.5 font-semibold">Addresses for the Intuit app</div>
                <p className="mb-2 text-[12.5px] text-ink-3">developer.intuit.com → your app → Settings. Use these exact values for both Development and Production.</p>
                {[["Redirect URI", sys.urls.redirect], ["Host domain / Launch URL", sys.urls.launch], ["Disconnect URL", sys.urls.disconnect], ["Privacy policy", sys.urls.privacy], ["End-user license / Terms", sys.urls.terms]].map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2 border-b border-rule-2 py-1.5 last:border-0">
                    <span className="w-[190px] shrink-0 text-ink-3">{k}</span><code className="min-w-0 flex-1 truncate text-[12.5px]">{v}</code>
                    <button onClick={() => copy(v)} className="rounded p-1 text-ink-3 hover:bg-ledger" aria-label={`Copy ${k}`}><Copy className="size-3.5" /></button>
                  </div>
                ))}
                {sys.qbo.redirectUri && sys.qbo.redirectUri !== sys.urls.redirect && <p className="mt-2 text-[12.5px] text-amber">QB_REDIRECT_URI is set to {sys.qbo.redirectUri}. It must match the Redirect URI above when you use this address.</p>}
              </div>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
