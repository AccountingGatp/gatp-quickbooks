import { jobs, jobRows } from "@/lib/db";
import { requireSession, route } from "@/lib/http";
import { getJob, publicJob } from "@/lib/jobs";
import { logActivity } from "@/lib/audit";
export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, { params }: P) => {
  await requireSession();
  const job = await getJob((await params).id);
  return { job: publicJob(job) };
});

/** Discard an import that has not been posted. */
export const DELETE = route(async (_req: Request, { params }: P) => {
  const s = await requireSession();
  const job = await getJob((await params).id);
  if (job.counts.posted > 0) throw new Error("Part of this import is already in QuickBooks. Use Undo import instead.");
  await (await jobRows()).deleteMany({ jobId: String(job._id) });
  await (await jobs()).updateOne({ _id: job._id }, { $set: { status: "discarded", updatedAt: new Date() } });
  await logActivity({ user: s.name, realmId: job.realmId, companyName: job.companyName, action: "Discarded import", detail: `${job.entityLabel}, ${job.fileName}`, jobId: String(job._id) });
  return { ok: true };
});
