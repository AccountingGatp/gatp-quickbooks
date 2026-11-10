import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Shell } from "@/components/Shell";
import { SESSION_COOKIE, COMPANY_COOKIE, readSession } from "@/lib/session";
import { companies } from "@/lib/db";
import { MOCK } from "@/lib/qbo/client";
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const s = await readSession(jar.get(SESSION_COOKIE)?.value);
  if (!s) redirect("/login");
  let list: { realmId: string; name: string; environment: string; status: string }[] = [];
  let dbError = "";
  try {
    list = (await (await companies()).find({}, { projection: { name: 1, environment: 1, status: 1 } }).sort({ name: 1 }).toArray())
      .map((c) => ({ realmId: c._id, name: c.name, environment: c.environment, status: c.status }));
  } catch (e) { dbError = (e as Error).message; }
  const active = jar.get(COMPANY_COOKIE)?.value || null;
  return (
    <Shell user={s.name} companies={list} active={list.some((c) => c.realmId === active) ? active : null} mock={MOCK}>
      {dbError && <div className="mb-5 rounded-[var(--radius-md)] border border-red-line bg-red-soft px-4 py-3 text-[13.5px] text-red">{dbError}</div>}
      {children}
    </Shell>
  );
}
