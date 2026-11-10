import { requireSession, route } from "@/lib/http";
import { getJob } from "@/lib/jobs";
import { validateJob } from "@/lib/import/validate";
import { clearLists } from "@/lib/qbo/lists";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
type P = { params: Promise<{ id: string }> };

/** Check again (optionally after re-reading QuickBooks lists, e.g. after adding an account in QuickBooks). */
export const POST = route(async (req: Request, { params }: P) => {
  await requireSession();
  const job = await getJob((await params).id);
  const { fresh } = await req.json().catch(() => ({ fresh: false }));
  if (fresh) await clearLists(job.realmId);
  return validateJob(String(job._id));
});
