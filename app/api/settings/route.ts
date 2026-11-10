// Import options for the active company (each import can still change them).
import { companies } from "@/lib/db";
import { requireCompany, route } from "@/lib/http";
import { DEFAULT_SETTINGS, type ImportSettings } from "@/lib/types";
import { logActivity } from "@/lib/audit";
export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const { company } = await requireCompany();
  return { settings: { ...DEFAULT_SETTINGS, ...(company.settings || {}) }, company: company.name };
});

export const PUT = route(async (req: Request) => {
  const { session, company } = await requireCompany();
  const b = (await req.json()) as Partial<ImportSettings>;
  const s: ImportSettings = {
    dateFormat: ["auto", "MDY", "DMY", "YMD"].includes(String(b.dateFormat)) ? (b.dateFormat as ImportSettings["dateFormat"]) : "auto",
    autoCreate: !!b.autoCreate, useFileRefNo: !!b.useFileRefNo, duplicateCheck: !!b.duplicateCheck, applyRules: !!b.applyRules, matchAccountByNumber: !!b.matchAccountByNumber,
  };
  await (await companies()).updateOne({ _id: company._id }, { $set: { settings: s } });
  await logActivity({ user: session.name, realmId: company._id, companyName: company.name, action: "Changed import settings" });
  return { settings: s };
});
