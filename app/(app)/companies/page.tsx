"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, RefreshCw, Unplug, Building2, Check, AlertCircle } from "lucide-react";
import { Badge, Button, Empty, Modal, PageHeader, Panel, Spinner, useToast } from "@/components/ui";
import { initials } from "@/components/Shell";
import { api, when } from "@/lib/client";

export default function CompaniesPage() {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<{ active: string | null; mock: boolean; companies: any[] } | null>(null);
  const [q, setQ] = useState("");
  const [bye, setBye] = useState<any>(null);
  const load = () => api("/api/companies").then(setData);
  useEffect(() => {
    load();
    const p = new URLSearchParams(location.search);
    if (p.get("error")) toast("error", p.get("error")!);
    if (p.get("connected")) toast("ok", p.get("connected") === "demo" ? "Demo companies added." : `${p.get("connected")} is connected.`);
    if (p.get("error") || p.get("connected")) history.replaceState(null, "", "/companies");
  }, [toast]);
  const list = useMemo(() => (data?.companies || []).filter((c) => c.name.toLowerCase().includes(q.toLowerCase())), [data, q]);

  async function act(action: string, c: any) {
    try {
      await api("/api/companies", { json: { action, realmId: c.realmId } });
      if (action === "select") { toast("ok", `Now working in ${c.name}`); router.refresh(); }
      if (action === "refresh-lists") toast("ok", `Accounts, names and items for ${c.name} will be read fresh from QuickBooks.`);
      if (action === "disconnect") { toast("ok", `${c.name} disconnected.`); setBye(null); router.refresh(); }
      load();
    } catch (e) { toast("error", (e as Error).message); }
  }

  return (
    <>
      <PageHeader title="Companies" sub="Client companies connected to GATP Ledger. Each person picks the company they are working in at the top of the page; that choice is theirs alone."
        actions={<a href="/api/qbo/connect"><Button variant="primary" icon={<Plus className="size-4" />}>{data?.mock ? "Add demo companies" : "Connect a company"}</Button></a>} />
      <Panel className="mb-5">
        <div className="flex gap-3 text-[13.5px] text-ink-2">
          <Building2 className="mt-0.5 size-5 shrink-0 text-green" />
          <div>
            <b className="font-semibold text-ink">How to connect a client:</b> click Connect a company and sign in to Intuit with GATP’s accountant login (accounting@gatpsolutions.com). Intuit lists every client company GATP can access. Pick one and click Connect. Repeat for each client; there is no limit.
            <div className="mt-1 text-[12.5px] text-ink-3">Intuit keeps a connection for up to 100 days of no use. If a company shows “Reconnect”, click Connect a company and pick it again; its history and rules stay.</div>
          </div>
        </div>
      </Panel>
      <Panel pad={false} title={data ? `${data.companies.length} connected` : "Connected"} actions={
        <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-4" /><input className="field h-8 w-[240px] pl-8" placeholder="Search companies" value={q} onChange={(e) => setQ(e.target.value)} /></div>}>
        {!data ? <div className="py-14 text-center"><Spinner /></div> : !data.companies.length ? (
          <Empty icon={<Building2 className="size-8" />} title="No companies connected yet" action={<a href="/api/qbo/connect"><Button variant="primary" icon={<Plus className="size-4" />}>Connect a company</Button></a>}>Connect your first client company to start importing.</Empty>
        ) : (
          <table className="ledger-grid w-full">
            <thead><tr><th className="!p-0" /><th>Company</th><th>Connection</th><th>Connected</th><th>Last used</th><th /></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.realmId}>
                  <td className={`rail ${c.status === "connected" ? "bg-green" : "bg-red"}`} />
                  <td>
                    <div className="flex items-center gap-2.5">
                      <span className="grid size-7 shrink-0 place-items-center rounded-[6px] bg-ink text-[11px] font-bold text-white">{initials(c.name)}</span>
                      <div><div className="font-medium">{c.name}{c.realmId === data.active && <Badge tone="green" className="ml-2"><Check className="size-3" />You are here</Badge>}</div><div className="num text-[12px] text-ink-4">Company ID {c.realmId}</div></div>
                    </div>
                  </td>
                  <td>{c.status === "connected" ? <Badge tone="green">Connected</Badge> : <Badge tone="red"><AlertCircle className="size-3" />Reconnect</Badge>} {c.environment !== "production" && <Badge className="ml-1">{c.environment}</Badge>}</td>
                  <td className="text-ink-2">{when(c.connectedAt)}<div className="text-[12px] text-ink-3">by {c.connectedBy}</div></td>
                  <td className="text-ink-2">{c.lastUsedAt ? when(c.lastUsedAt) : "—"}</td>
                  <td className="whitespace-nowrap text-right">
                    {c.realmId !== data.active && <Button size="sm" variant="quiet" onClick={() => act("select", c)}>Work in this company</Button>}
                    {c.status !== "connected" && <a href="/api/qbo/connect"><Button size="sm" variant="primary">Reconnect</Button></a>}
                    <Button size="sm" variant="ghost" icon={<RefreshCw className="size-3.5" />} title="Read accounts, names and items again from QuickBooks" onClick={() => act("refresh-lists", c)}>Refresh names</Button>
                    <Button size="sm" variant="ghost" className="text-red" icon={<Unplug className="size-3.5" />} onClick={() => setBye(c)}>Disconnect</Button>
                  </td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan={6} className="py-8 text-center text-ink-3">No company matches “{q}”.</td></tr>}
            </tbody>
          </table>
        )}
      </Panel>
      <Modal open={!!bye} onClose={() => setBye(null)} title={`Disconnect ${bye?.name}?`} footer={<><Button onClick={() => setBye(null)}>Cancel</Button><Button variant="danger" onClick={() => act("disconnect", bye)}>Disconnect</Button></>}>
        GATP Ledger will no longer be able to read or post to this company. Its import history stays. You can connect it again at any time.
      </Modal>
    </>
  );
}
