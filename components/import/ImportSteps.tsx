import { Check } from "lucide-react";
import { IMPORT_STEPS } from "@/lib/terminology";
import { cx } from "@/components/ui";

export function ImportSteps({ step, done = false }: { step: number; done?: boolean }) {
  return <nav aria-label="Import progress" className="import-progress">
    <ol>{IMPORT_STEPS.map((label, i) => {
      const n = i + 1, complete = n < step || (done && n === 4), current = n === step && !done;
      return <li key={label} aria-current={current ? "step" : undefined} className={cx("import-step", complete && "is-complete", current && "is-current")}>
        <span className="step-number">{complete ? <Check className="size-3" aria-label="Complete" /> : n}</span>
        <span>{label}</span>
      </li>;
    })}</ol>
  </nav>;
}
