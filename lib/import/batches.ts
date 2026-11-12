import type { BatchOp, BatchResult } from "../qbo/client";

/** Immutable request saved before QuickBooks is contacted. Results are saved before row updates. */
export type PostBatchDoc = {
  _id: string;
  jobId: string;
  realmId: string;
  ops: BatchOp[];
  groups: { bId: string; idxs: number[]; original?: Record<string, any> }[];
  results?: BatchResult[];
  completed: boolean;
  createdAt: Date;
};

export function assertCompleteResults(ops: BatchOp[], results: BatchResult[]) {
  if (ops.some((op) => {
    const res = results.find((r) => r.bId === op.bId);
    return !res || /No answer from QuickBooks/i.test(res.error || "") || (res.ok && !res.entity?.Id);
  })) throw new Error("QuickBooks did not confirm every result. Resume this import to recover the saved request safely; do not upload a second copy.");
}
