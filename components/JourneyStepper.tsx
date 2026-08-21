import Link from "next/link";

export type Step = {
  label: string;
  detail: string;
  state: "done" | "current" | "todo";
  href?: string;
  cta?: string;
};

/**
 * Where you stand, at a glance.
 *
 * "No date, no dinner" is a sequence, and the point of showing it as one is
 * that a person can always see the single next thing they have to do — and
 * that the step they are stuck on is a step, not a failure.
 */
export default function JourneyStepper({ steps }: { steps: Step[] }) {
  return (
    <ol className="flex flex-col">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        const done = s.state === "done";
        const current = s.state === "current";

        return (
          <li key={s.label} className="flex gap-5">
            {/* ------------------------------------------------ rail */}
            <div className="flex flex-col items-center shrink-0">
              <span
                className="w-9 h-9 grid place-items-center rounded-full text-[12px] shrink-0"
                style={{
                  border: `1px solid ${done || current ? "var(--gold)" : "var(--rule-strong)"}`,
                  background: done
                    ? "var(--gold)"
                    : current
                      ? "var(--gold-wash)"
                      : "transparent",
                  color: done
                    ? "#FFFDF6"
                    : current
                      ? "var(--gold)"
                      : "var(--ink-faint)",
                  fontFamily: "var(--f-body)",
                }}
                aria-hidden="true"
              >
                {done ? "✓" : String(i + 1).padStart(2, "0")}
              </span>

              {!last ? (
                <span
                  className="w-px flex-1 my-1"
                  style={{
                    background: done ? "var(--gold-light)" : "var(--rule)",
                    minHeight: 34,
                  }}
                  aria-hidden="true"
                />
              ) : null}
            </div>

            {/* ------------------------------------------------ body */}
            <div className={`flex flex-col gap-1.5 ${last ? "pb-0" : "pb-8"} min-w-0`}>
              <div className="flex flex-wrap items-center gap-3">
                <h3
                  className="text-[21px] leading-tight"
                  style={{ color: done || current ? "var(--olive)" : "var(--ink-faint)" }}
                >
                  {s.label}
                </h3>
                {current ? <span className="pill pill-gold">You are here</span> : null}
              </div>

              <p
                className="text-[14px] leading-[1.8]"
                style={{ color: current ? "var(--ink-soft)" : "var(--ink-faint)" }}
              >
                {s.detail}
              </p>

              {current && s.href && s.cta ? (
                <Link href={s.href} className="btn btn-primary self-start mt-2">
                  {s.cta}
                </Link>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
