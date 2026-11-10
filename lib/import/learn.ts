// Learning bank rules from lines that were already categorised (a QuickBooks register report,
// or any statement with an Account column). For each line we look for the shortest start of the
// bank text ("GLOBAL DEP", "HCCLAIMPMT", "TRANSFER ELDE") that is always categorised the same way.
export type LearnRow = { text: string; payee?: string; account: string; className?: string; location?: string; type?: string; moneyIn: boolean };
export type Learned = {
  op?: "number"; // the bank text is only a reference number
  text: string; direction: "in" | "out"; account: string; className?: string; location?: string; payee?: string; type?: string;
  count: number; examples: string[];
};

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const words = (s: string) => s.split(/[\s*#/\\|,;:()[\]-]+/).filter((w) => w && !/\d/.test(w) && (w.length > 1 || w === "&"));

const REGISTER_TYPE: Record<string, string | null> = {
  deposit: "", expense: "", check: "Check", transfer: "Transfer", creditcardpmt: "Transfer", creditcardpayment: "Transfer",
  billpayment: null, billpaymentcheck: null, journalentry: null, payment: null, salesreceipt: null, refund: null,
};

export function learnRules(input: LearnRow[]): Learned[] {
  const rows = input
    .map((r) => ({ ...r, t: squash(r.text || ""), typeKey: (r.type || "").toLowerCase().replace(/[^a-z]/g, "") }))
    .filter((r) => r.t && r.account && REGISTER_TYPE[r.typeKey] !== null);
  const outcome = (r: (typeof rows)[number]) => [r.moneyIn ? "in" : "out", squash(r.account), squash(r.className || ""), squash(r.location || ""), REGISTER_TYPE[r.typeKey] ?? ""].join("|");
  const found = new Map<string, Learned>();

  for (const r of rows) {
    // word positions in the original text, so a phrase is always a continuous piece of it
    const toks = [...r.text.matchAll(/[^\s*#/\\|,;:()[\]-]+/g)].map((m) => ({ w: m[0], end: (m.index || 0) + m[0].length, start: m.index || 0 }));
    const firstWord = toks.findIndex((t) => !/\d/.test(t.w) && (t.w.length > 1 || t.w === "&"));
    if (firstWord < 0) {
      // text that is only a number (deposit reference): one rule if all such lines were categorised alike
      if (!/^[\d\s*#-]+$/.test(r.t)) continue;
      const key = `${r.moneyIn ? "in" : "out"}|#number`;
      const same = rows.filter((x) => x.moneyIn === r.moneyIn && /^[\d\s*#-]+$/.test(x.t));
      if (!found.has(key) && same.every((x) => outcome(x) === outcome(r))) {
        const payees = [...new Set(same.map((x) => (x.payee || "").trim()))];
        found.set(key, { op: "number", text: "(number only)", direction: r.moneyIn ? "in" : "out", account: r.account.trim(), className: r.className?.trim() || undefined, location: r.location?.trim() || undefined, payee: payees.length === 1 && payees[0] ? payees[0] : undefined, type: REGISTER_TYPE[r.typeKey] || undefined, count: same.length, examples: same.map((x) => x.text.trim()).slice(0, 3) });
      }
      continue;
    }
    const w: string[] = [];
    const phrases: string[] = [];
    for (let i = firstWord; i < toks.length && phrases.length < 4; i++) {
      if (/\d/.test(toks[i].w)) break; // account / reference numbers change: stop before them
      w.push(toks[i].w);
      phrases.push(r.text.slice(toks[firstWord].start, toks[i].end));
    }
    for (let n = 1; n <= phrases.length; n++) {
      const phrase = squash(phrases[n - 1]);
      if (phrase.length < 3 || !r.t.includes(phrase)) continue;
      const same = rows.filter((x) => x.moneyIn === r.moneyIn && x.t.includes(phrase));
      if (!same.every((x) => outcome(x) === outcome(r))) continue; // categorised differently somewhere: be more specific
      if (same.length === 1 && n === 1 && phrase.length < 8) continue; // a lone short word is too broad
      const key = `${r.moneyIn ? "in" : "out"}|${phrase}`;
      if (!found.has(key)) {
        const payees = [...new Set(same.map((x) => (x.payee || "").trim()))];
        found.set(key, {
          text: phrases[n - 1].replace(/\s+/g, " ").trim(), direction: r.moneyIn ? "in" : "out", account: r.account.trim(),
          className: r.className?.trim() || undefined, location: r.location?.trim() || undefined,
          payee: payees.length === 1 && payees[0] ? payees[0] : undefined, type: REGISTER_TYPE[r.typeKey] || undefined,
          count: same.length, examples: [...new Set(same.map((x) => x.text.trim()))].slice(0, 3),
        });
      }
      break;
    }
  }
  // specific rules first (they are checked top to bottom), then the most used
  return [...found.values()].sort((a, b) => words(b.text).length - words(a.text).length || b.count - a.count);
}
