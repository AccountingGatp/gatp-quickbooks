"use client";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/Brand";
import { Button, Label } from "@/components/ui";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
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
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden border-r border-rule bg-paper lg:block">
        {/* ledger paper */}
        <div className="absolute inset-0" style={{ backgroundImage: "repeating-linear-gradient(#fff 0 84px, #edf4ec 84px 168px)" }} />
        <div className="absolute inset-y-0 left-[88px] w-[2px] bg-red/50" />
        <div className="relative flex h-full flex-col justify-between px-[128px] py-14">
          <div className="flex items-center gap-3"><BrandMark size={34} /><span className="text-[18px] font-bold">GATP Ledger</span></div>
          <div className="max-w-[30rem]">
            <h1 className="text-[40px] font-semibold leading-[1.08] tracking-[-0.02em] text-ink">Every client’s books, one import screen.</h1>
            <p className="mt-4 text-[15.5px] leading-relaxed text-ink-2">Bring in bank statements, bills, invoices and journals from any spreadsheet, check every line, then post straight to QuickBooks Online.</p>
          </div>
          <p className="text-[12.5px] text-ink-3">GATP Solutions · internal tool</p>
        </div>
      </section>
      <section className="flex items-center justify-center px-6 py-12">
        <form onSubmit={submit} className="w-full max-w-[360px]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden"><BrandMark /><span className="text-[17px] font-bold">GATP Ledger</span></div>
          <h2 className="text-[22px] font-semibold">Log in</h2>
          <p className="mt-1 text-[13.5px] text-ink-3">Use the shared GATP login, and your own name for the activity log.</p>
          <div className="mt-6 space-y-4">
            <div><Label htmlFor="name">Your name</Label><input id="name" className="field h-10" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="e.g. Rutik" required /></div>
            <div><Label htmlFor="email">Email</Label><input id="email" type="email" className="field h-10" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="accounting@gatpsolutions.com" required /></div>
            <div><Label htmlFor="pw">Password</Label><input id="pw" type="password" className="field h-10" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></div>
          </div>
          {err && <p className="mt-4 rounded-[var(--radius-sm)] border border-red-line bg-red-soft px-3 py-2 text-[13px] text-red">{err}</p>}
          <Button variant="primary" size="lg" className="mt-6 w-full" loading={busy} type="submit">Log in</Button>
        </form>
      </section>
    </main>
  );
}
