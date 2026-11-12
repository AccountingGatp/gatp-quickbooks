import type { BuildCtx, Vals } from "./entities";

export const paymentIds = (value?: string) => (value || "").split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);

export function linkedPaymentLines(v: Vals, ctx: BuildCtx, accountId: string, amount: number) {
  const ids = paymentIds(v.paymentIds);
  if (ids.some((id) => !/^\d+$/.test(id))) throw new Error("Payment IDs must be QuickBooks numeric IDs separated by commas.");
  if (!ids.length) throw new Error("An Undeposited Funds deposit needs Payment IDs. Export customer payments and supply their QuickBooks IDs; a register alone does not contain these links.");
  if (new Set(ids).size !== ids.length) throw new Error("A payment ID is repeated in this deposit.");
  const rows = ids.map((id) => {
    const p = ctx.depositPayments?.get(id);
    if (!p) throw new Error(`Customer payment ${id} was not found in this QuickBooks company.`);
    if (p.deposited || ctx.usedPayments?.has(id)) throw new Error(`Customer payment ${id} is already deposited or used by another row.`);
    if (p.account !== accountId || !Number.isFinite(p.amount) || p.amount <= 0) throw new Error(`Customer payment ${id} is not an available positive payment in Undeposited Funds.`);
    return { id, ...p };
  });
  if (Math.abs(rows.reduce((n, p) => n + p.amount, 0) - amount) > 0.004) throw new Error("The linked customer payments do not add up to this deposit. Supply the complete matching payment IDs.");
  ids.forEach((id) => ctx.usedPayments?.add(id));
  return rows.map((p) => ({ Amount: p.amount, LinkedTxn: [{ TxnId: p.id, TxnType: "Payment" }], DetailType: "DepositLineDetail", DepositLineDetail: { AccountRef: { value: accountId }, ...(v.className ? { ClassRef: { value: ctx.r.find("Class", v.className)!.value } } : {}) } }));
}
