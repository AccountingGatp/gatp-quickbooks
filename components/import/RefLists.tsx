"use client";
// <datalist>s with the company's names, so cells and fixed values offer QuickBooks names as you type.
export type Lists = Record<string, { name: string; type?: string; number?: string }[]>;

export function RefLists({ lists }: { lists: Lists }) {
  const names = [...(lists.Vendor || []), ...(lists.Customer || []), ...(lists.Employee || [])];
  const kinds: [string, { name: string; type?: string }[]][] = [
    ["Account", lists.Account || []], ["Vendor", lists.Vendor || []], ["Customer", lists.Customer || []], ["Employee", lists.Employee || []],
    ["Name", names], ["Item", lists.Item || []], ["Class", lists.Class || []], ["Department", lists.Department || []],
    ["PaymentMethod", lists.PaymentMethod || []], ["Term", lists.Term || []],
    ["Account-Bank", (lists.Account || []).filter((a) => a.type === "Bank")],
    ["Account-CreditCard", (lists.Account || []).filter((a) => a.type === "Credit Card")],
    ["Account-BankCard", (lists.Account || []).filter((a) => a.type === "Bank" || a.type === "Credit Card")],
    ["Account-Deposit", (lists.Account || []).filter((a) => a.type === "Bank" || a.type === "Other Current Asset")],
  ];
  return (
    <>
      {kinds.map(([k, items]) => (
        <datalist key={k} id={`dl-${k}`}>
          {items.slice(0, 5000).map((i, n) => <option key={n} value={i.name}>{i.type || ""}</option>)}
        </datalist>
      ))}
    </>
  );
}

/** Which pick-list an Account field uses, so a bank account field only offers bank accounts. */
export function accountListId(types?: string[]) {
  if (!types?.length) return "dl-Account";
  const t = [...types].sort().join("|");
  if (t === "Bank") return "dl-Account-Bank";
  if (t === "Credit Card") return "dl-Account-CreditCard";
  if (t === "Bank|Credit Card") return "dl-Account-BankCard";
  if (t === "Bank|Other Current Asset") return "dl-Account-Deposit";
  return "dl-Account";
}
