import { requireSession, route } from "@/lib/http";
import { getJob } from "@/lib/jobs";
import { rollbackChunk } from "@/lib/import/post";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type P = { params: Promise<{ id: string }> };

/** Removes what this import created in QuickBooks. Call again until done = true. */
export const POST = route(async (_req: Request, { params }: P) => {
  const s = await requireSession();
  const job = await getJob((await params).id);
  return rollbackChunk(String(job._id), s.name);
});
