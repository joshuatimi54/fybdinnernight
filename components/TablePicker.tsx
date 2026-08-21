"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { claimTable } from "@/app/actions/pair";

export type TableSlot = {
  id: string;
  label: string;
  capacity: number;
  zone: string | null;
  is_open: boolean;
  seats_taken: number;
  is_mine: boolean;
};

export default function TablePicker({ tables }: { tables: TableSlot[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function claim(table: TableSlot) {
    startTransition(async () => {
      const res = await claimTable(table.id);
      if (!res.ok) {
        toast.error(res.error);
        // Someone took the last two seats first — show the corrected map.
        router.refresh();
        return;
      }
      toast.success(`You're at ${table.label}.`);
      router.refresh();
    });
  }

  if (tables.length === 0) {
    return (
      <div className="card p-10 text-center flex flex-col gap-3 items-center">
        <h3 className="text-2xl">Tables aren&apos;t set up yet</h3>
        <p className="text-ink-soft max-w-[38ch]">
          The committee is still laying out the room. You&apos;ll be able to
          pick a seat here shortly.
        </p>
      </div>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tables.map((t) => {
        const left = Math.max(0, t.capacity - t.seats_taken);
        const full = left < 2;
        const filling = left <= 2 && left > 0;

        return (
          <li
            key={t.id}
            className="border p-5 flex flex-col gap-4"
            style={{
              borderColor: t.is_mine
                ? "var(--gold)"
                : full
                  ? "var(--rule)"
                  : "var(--rule-strong)",
              background: t.is_mine ? "var(--gold-wash)" : "var(--paper)",
              opacity: full && !t.is_mine ? 0.55 : 1,
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <h3 className="font-display text-3xl leading-none">{t.label}</h3>
                {t.zone ? (
                  <span className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">
                    {t.zone}
                  </span>
                ) : null}
              </div>
              {t.is_mine ? <span className="pill pill-olive">Yours</span> : null}
            </div>

            {/* Seats as dots: fullness reads instantly, without a number. */}
            <div className="flex flex-wrap gap-1.5" aria-hidden="true">
              {Array.from({ length: t.capacity }).map((_, i) => (
                <span
                  key={i}
                  className="w-2.5 h-2.5 rounded-full"
                  style={{
                    background:
                      i < t.seats_taken ? "var(--olive)" : "var(--mist)",
                    border: `1px solid ${i < t.seats_taken ? "var(--olive)" : "var(--rule-strong)"}`,
                  }}
                />
              ))}
            </div>

            <p
              className="text-[13px] numeric"
              style={{ color: filling ? "var(--gold)" : "var(--ink-soft)" }}
            >
              {full
                ? "Full"
                : `${left} of ${t.capacity} seats left${filling ? " — almost gone" : ""}`}
            </p>

            {!t.is_mine ? (
              <button
                type="button"
                className="btn btn-ghost mt-auto"
                disabled={pending || full || !t.is_open}
                onClick={() => claim(t)}
              >
                {!t.is_open ? "Closed" : full ? "Full" : "Take these two seats"}
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
