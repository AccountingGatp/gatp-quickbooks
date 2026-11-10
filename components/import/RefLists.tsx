"use client";
// <datalist>s with the company's names, so cells and fixed values offer QuickBooks names as you type.
export type Lists = Record<string, { name: string; type?: string; number?: string }[]>;

export function RefLists({ lists }: { lists: Lists }) {
  const names = [...(lists.Vendor || []), ...(lists.Customer || []), ...(lists.Employee || [])];
  const kinds: [string, { name: string; type?: string }[]][] = [
    ["Account", lists.Account || []], ["Vendor", lists.Vendor || []], ["Customer", lists.Customer || []], ["Employee", lists.Employee || []],
    ["Name", names], ["Item", lists.Item || []], ["Class", lists.Class || []], ["Department", lists.Department || []],
    ["PaymentMethod", lists.PaymentMethod || []], ["Term", lists.Term || []],
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
