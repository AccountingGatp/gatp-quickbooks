"use client";
import { useEffect, useState } from "react";
import { Eye, EyeOff, ShieldCheck, Building2, Undo2, CheckCircle2 } from "lucide-react";
import { BrandMark } from "@/components/Brand";
import { Button, Label } from "@/components/ui";

// A small, static preview of the review grid: what the product actually does.
const PREVIEW = [
  { d: "11/02", t: "UBER *TRIP HELP.UBER.COM", a: "Travel", amt: "−$23.45", s: "Posted" },
  { d: "11/03", t: "DEPOSIT GREENFIELD MARKET", a: "Sales", amt: "$1,840.00", s: "Posted" },
  { d: "11/05", t: "ADOBE *CREATIVE CLD", a: "Software", amt: "−$59.99", s: "Ready" },
  { d: "11/06", t: "PAYMENT TO VISA CARD", a: "Visa Credit Card", amt: "−$1,500.00", s: "Ready" },
];

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setName(localStorage.getItem("gl_name") || ""); setEmail(localStorage.getItem("gl_email") || ""); }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, name }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not log in.");
      try { localStorage.setItem("gl_name", name.trim()); localStorage.setItem("gl_email", email.trim()); } catch {}
      const next = new URLSearchParams(location.search).get("next");
      location.href = next && next.startsWith("/") ? next : "/";
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }
  return (
    <main className="grid min-h-screen bg-ledger lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* brand side */}
      <section className="relative hidden overflow-hidden bg-forest text-white lg:flex lg:flex-col"
        style={{ backgroundImage: "radial-gradient(90% 60% at 100% 100%, rgba(95,211,168,.22), transparent 60%), radial-gradient(70% 50% at 0% 0%, rgba(13,122,91,.45), transparent 70%)" }}>
        <div className="flex items-center gap-3 px-14 pt-12">
          <BrandMark size={36} />
          <div className="leading-none"><div className="text-[18px] font-bold">GATP Ledger</div><div className="mt-1 text-[12px] text-white/55">by GATP Solutions</div></div>
        </div>

        <div className="flex flex-1 flex-col justify-center px-14 py-10">
          <h1 className="max-w-[30rem] text-[42px] font-semibold leading-[1.08] tracking-[-0.025em]">Every client’s books, one import screen.</h1>
          <p className="mt-4 max-w-[30rem] text-[15.5px] leading-relaxed text-white/70">Bank statements, bills, invoices and journals from any spreadsheet, checked line by line and posted straight to QuickBooks Online.</p>

          {/* product preview */}
          <div className="mt-10 max-w-[33rem] rounded-[16px] border border-white/10 bg-white/[.06] p-1.5 shadow-[0_30px_60px_-20px_rgba(0,0,0,.5)] backdrop-blur">
            <div className="overflow-hidden rounded-[11px] bg-white text-ink">
              <div className="flex items-center justify-between border-b border-rule-2 px-4 py-2.5">
                <span className="text-[12.5px] font-semibold">LXP Enterprises, bank statement</span>
                <span className="rounded-full bg-green-soft px-2 py-[1px] text-[11px] font-semibold text-green">14 rows checked</span>
              </div>
              {PREVIEW.map((r, i) => (
                <div key={i} className={`grid grid-cols-[42px_1fr_96px_84px_58px] items-center gap-2 px-4 py-2 text-[11.5px] ${i % 2 ? "bg-band" : ""}`}>
                  <span className="num text-ink-3">{r.d}</span>
                  <span className="truncate font-medium">{r.t}</span>
                  <span className="truncate text-ink-2">{r.a}</span>
                  <span className={`num text-right ${r.amt.startsWith("−") ? "text-ink" : "text-green"}`}>{r.amt}</span>
                  <span className={`justify-self-end rounded-full px-1.5 text-[10.5px] font-semibold ${r.s === "Posted" ? "bg-green text-white" : "bg-green-soft text-green"}`}>{r.s}</span>
                </div>
              ))}
            </div>
          </div>

          <ul className="mt-9 grid max-w-[33rem] grid-cols-3 gap-4 text-[12.5px] text-white/70">
            <li className="flex items-start gap-2"><Building2 className="mt-px size-4 shrink-0 text-mint" />All client companies in one place</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-px size-4 shrink-0 text-mint" />Every row checked before posting</li>
            <li className="flex items-start gap-2"><Undo2 className="mt-px size-4 shrink-0 text-mint" />Undo a whole import in one click</li>
          </ul>
        </div>
      </section>

      {/* form side */}
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden"><BrandMark /><span className="text-[17px] font-bold">GATP Ledger</span></div>
          <form onSubmit={submit} className="panel px-8 py-9">
            <h2 className="text-[24px] font-semibold tracking-[-0.02em]">Welcome back</h2>
            <p className="mt-1 text-[13.5px] text-ink-3">Sign in with the GATP team login. Your name goes on the activity log.</p>
            <div className="mt-7 space-y-4">
              <div><Label htmlFor="name">Your name</Label><input id="name" className="field h-11 text-[14px]" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="e.g. Rutik" required /></div>
              <div><Label htmlFor="email">Email</Label><input id="email" type="email" className="field h-11 text-[14px]" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="accounting@gatpsolutions.com" required /></div>
              <div>
                <Label htmlFor="pw">Password</Label>
                <div className="relative">
                  <input id="pw" type={show ? "text" : "password"} className="field h-11 pr-10 text-[14px]" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
                  <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-ink-3 hover:text-ink" aria-label={show ? "Hide password" : "Show password"}>
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
            </div>
            {err && <p className="mt-4 rounded-[var(--radius-sm)] border border-red-line bg-red-soft px-3 py-2 text-[13px] text-red">{err}</p>}
            <Button variant="primary" size="lg" className="mt-7 h-11 w-full text-[15px]" loading={busy} type="submit">Sign in</Button>
          </form>
          <p className="mt-5 flex items-center justify-center gap-1.5 text-[12px] text-ink-3"><ShieldCheck className="size-3.5 text-green" />QuickBooks connections are encrypted. Internal use only.</p>
        </div>
      </section>
    </main>
  );
}
