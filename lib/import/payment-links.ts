import { query, escapeQ } from "../qbo/client";
import type { BuildCtx, Vals } from "./entities";

import { paymentIds } from "./deposit-links";

/** Explicit IDs only: an equal amount is not proof that a receipt belongs to a deposit. */
export async function loadPaymentLinks(realmId: string, values: Vals[], ctx: BuildCtx) {
  const ids = [...new Set(values.flatMap((v) => paymentIds(v.paymentIds)))].filter((id) => /^\d+$/.test(id));
  if (!ids.length) return;
  ctx.depositPayments = new Map(); ctx.usedPayments = new Set();
  for (let i = 0; i < ids.length; i += 40) {
    const res = await query(realmId, `select * from Payment where Id IN (${ids.slice(i, i + 40).map((id) => `'${escapeQ(id)}'`).join(",")}) maxresults 1000`);
    for (const p of res.Payment || []) ctx.depositPayments.set(String(p.Id), { amount: Number(p.TotalAmt), account: String(p.DepositToAccountRef?.value || ""), customer: String(p.CustomerRef?.value || ""), deposited: false });
  }
  // Deposited payments cannot be re-used. Read all deposits; never infer availability from amount alone.
  for (let start = 1; ; start += 1000) {
    const rows = (await query(realmId, `select * from Deposit startposition ${start} maxresults 1000`)).Deposit || [];
    for (const d of rows) for (const l of d.Line || []) for (const link of l.LinkedTxn || []) {
      const p = link.TxnType === "Payment" ? ctx.depositPayments.get(String(link.TxnId)) : null;
      if (p) p.deposited = true;
    }
    if (rows.length < 1000) break;
    if (start >= 99_001) throw new Error("Too many deposits to verify payment availability. Narrow the company data before linking payments.");
  }
}

