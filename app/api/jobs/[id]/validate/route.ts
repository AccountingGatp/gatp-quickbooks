import { requireSession, route } from "@/lib/http";
import { getJob } from "@/lib/jobs";
import { validateJob } from "@/lib/import/validate";
import { clearLists } from "@/lib/qbo/lists";
import { lockJob, unlockJob } from "@/lib/import/post";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
type P = { params: Promise<{ id: string }> };

/** Check again (optionally after re-reading QuickBooks lists, e.g. after adding an account in QuickBooks). */
export const POST = route(async (req: Request, { params }: P) => {
  const session = await requireSession();
  const found = await getJob((await params).id);
  const job = await lockJob(found._id, session.name);
  try {
  if (job.status === "posting") throw new Error("Resume posting from History before checking this import again.");
  const { fresh } = await req.json().catch(() => ({ fresh: false }));
  if (fresh) await clearLists(job.realmId);
  return await validateJob(String(job._id), undefined, true);
  } finally { await unlockJob(job._id, job.lockToken); }
});

