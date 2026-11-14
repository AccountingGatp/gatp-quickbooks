export const NAV_GROUPS = [
  { label: "Overview", items: [{ label: "Dashboard", href: "/", icon: "dashboard" }] },
  { label: "Batch Actions", items: [
    { label: "Bulk Upload", href: "/import", icon: "upload" },
    { label: "Download", href: "/export", icon: "download" },
    { label: "Delete", href: "/delete", icon: "delete" },
    { label: "Modify", href: "/import?operation=update", icon: "modify" },
    { label: "Receipts", icon: "file", unavailable: "Receipt image imports are not available yet." },
    { label: "Bank Statements", href: "/import?type=bank-statement", icon: "file" },
  ] },
  { label: "Automate", items: [{ label: "Automatic Imports", icon: "upload", unavailable: "Scheduled and email imports are not available yet." }] },
  { label: "Smart Entry", items: [{ label: "Batch Entry", icon: "modify", unavailable: "Direct batch entry is not available yet. Use Bulk Upload." }] },
  { label: "Reports", items: [{ label: "Import History", href: "/history", icon: "history" }] },
  { label: "Tools", items: [
    { label: "Bank Rules", href: "/rules", icon: "rules" },
    { label: "Companies", href: "/companies", icon: "companies" },
    { label: "Import Settings", href: "/settings", icon: "settings" },
  ] },
] satisfies { label: string; items: { label: string; href?: string; icon: string; unavailable?: string }[] }[];

export function activeNavigation(path: string, query: string) {
  if (path === "/import" || path.startsWith("/import/")) {
    const params = new URLSearchParams(query);
    if (params.get("operation") === "update") return "/import?operation=update";
    if (params.get("type") === "bank-statement") return "/import?type=bank-statement";
    return "/import";
  }
  return path;
}
