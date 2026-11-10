// Browser-side fetch helper: JSON in/out, readable errors, back to login when the session ends.
export async function api<T = any>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init || {};
  const r = await fetch(url, {
    ...rest,
    method: rest.method || (json !== undefined ? "POST" : "GET"),
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers || {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    cache: "no-store",
  });
  const j = await r.json().catch(() => ({ error: `Server error (${r.status})` }));
  if (r.status === 401 && typeof window !== "undefined") { window.location.href = "/login"; throw new Error("Log in again."); }
  if (!r.ok || j?.error) throw new Error(j?.error || `Error ${r.status}`);
  return j as T;
}

export const money = (n: number | null | undefined) =>
  n == null || Number.isNaN(n) ? "" : (n < 0 ? "−$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const usDate = (d?: string) => { if (!d || !/^\d{4}-\d{2}-\d{2}/.test(d)) return d || ""; const [y, m, dd] = d.slice(0, 10).split("-"); return `${m}/${dd}/${y}`; };
export const when = (d?: string | Date) => {
  if (!d) return "";
  const t = new Date(d), s = (Date.now() - t.getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return t.toLocaleDateString("en-US", { month: "short", day: "numeric", year: t.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
};
export const plural = (n: number, one: string, many = one + "s") => `${n.toLocaleString()} ${n === 1 ? one : many}`;
