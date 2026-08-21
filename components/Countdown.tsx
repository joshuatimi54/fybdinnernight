"use client";

import { useEffect, useState } from "react";

function parts(target: number) {
  const ms = Math.max(0, target - Date.now());
  return {
    days: Math.floor(ms / 86_400_000),
    hours: Math.floor((ms / 3_600_000) % 24),
    minutes: Math.floor((ms / 60_000) % 60),
    seconds: Math.floor((ms / 1000) % 60),
  };
}

export default function Countdown({ to, label }: { to: string; label?: string }) {
  const target = new Date(to).getTime();
  // Null on the server so the first paint matches the markup exactly.
  const [t, setT] = useState<ReturnType<typeof parts> | null>(null);

  useEffect(() => {
    setT(parts(target));
    const id = setInterval(() => setT(parts(target)), 1000);
    return () => clearInterval(id);
  }, [target]);

  if (Number.isNaN(target)) return null;

  const cells = [
    { v: t?.days, l: "Days" },
    { v: t?.hours, l: "Hours" },
    { v: t?.minutes, l: "Minutes" },
    { v: t?.seconds, l: "Seconds" },
  ];

  return (
    <div className="flex flex-col items-center gap-6">
      {label ? <span className="eyebrow">{label}</span> : null}

      <div className="flex items-start gap-5 sm:gap-9" suppressHydrationWarning>
        {cells.map((c, i) => (
          <div key={c.l} className="flex items-start gap-5 sm:gap-9">
            <div className="flex flex-col items-center gap-2 min-w-[58px] sm:min-w-[72px]">
              <span
                className="font-display leading-none"
                style={{ fontSize: "clamp(2.2rem, 6vw, 3.6rem)", color: "var(--olive)" }}
              >
                {t ? String(c.v).padStart(2, "0") : "––"}
              </span>
              <span
                className="text-[9px] tracking-[0.24em] uppercase"
                style={{ color: "var(--ink-faint)" }}
              >
                {c.l}
              </span>
            </div>

            {i < cells.length - 1 ? (
              <span
                aria-hidden="true"
                className="font-display leading-none pt-1"
                style={{ fontSize: "clamp(1.6rem, 4vw, 2.6rem)", color: "var(--gold-light)" }}
              >
                :
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
