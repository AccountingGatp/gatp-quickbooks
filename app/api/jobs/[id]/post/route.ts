import { requireSession, route } from "@/lib/http";
import { getJob } from "@/lib/jobs";
import { postChunk } from "@/lib/import/post";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type P = { params: Promise<{ id: string }> };

/** Posts the next part of the import (about 40 seconds of work). Call again until done = true. */
export const POST = route(async (_req: Request, { params }: P) => {
  const s = await requireSession();
  const job = await getJob((await params).id);
  return postChunk(String(job._id), s.name);
});
