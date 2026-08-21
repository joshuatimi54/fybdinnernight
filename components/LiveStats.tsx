"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Counters = {
  approved_profiles: number;
  confirmed_pairs: number;
  seats_taken: number;
};

/**
 * Real numbers make hesitation expensive, so they move without a refresh.
 *
 * Listens to `public_counters`, which holds totals and nothing else —
 * publishing `pairs` would have streamed profile ids to every visitor.
 */
export default function LiveStats({
  initial,
  totalSeats,
}: {
  initial: Counters;
  totalSeats: number;
}) {
  const [counters, setCounters] = useState(initial);

  useEffect(() => {
    const supabase = createClient();

    const apply = (row: Partial<Counters> | null) => {
      if (!row) return;
      setCounters((prev) => ({ ...prev, ...row }));
    };

    const channel = supabase
      .channel("public-counters")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "public_counters" },
        (payload) => apply(payload.new as Partial<Counters>),
      )
      .subscribe();

    // Realtime can be disabled per project, so poll as a floor.
    const poll = setInterval(async () => {
      const { data } = await supabase
        .from("public_counters")
        .select("approved_profiles, confirmed_pairs, seats_taken")
        .maybeSingle();
      apply(data);
    }, 30_000);

    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, []);

  const seatsLeft = Math.max(0, totalSeats - counters.seats_taken);
  const scarce = seatsLeft <= Math.max(20, totalSeats * 0.15);

  const stats = [
    { value: counters.approved_profiles, label: "Guests Registered" },
    { value: counters.confirmed_pairs, label: "Pairs Confirmed" },
    { value: seatsLeft, label: "Seats Remaining", accent: scarce },
  ];

  return (
    <div className="flex flex-wrap justify-center gap-x-14 gap-y-10 sm:gap-x-20">
      {stats.map((s, i) => (
        <div key={s.label} className="flex items-center gap-14 sm:gap-20">
          <div className="flex flex-col items-center gap-2">
            <span
              className="font-display leading-none"
              style={{
                fontSize: "clamp(2.8rem, 7vw, 4.4rem)",
                color: s.accent ? "var(--gold)" : "var(--olive)",
              }}
            >
              {s.value}
            </span>
            <span
              className="text-[9.5px] tracking-[0.26em] uppercase text-center"
              style={{ color: "var(--ink-faint)" }}
            >
              {s.label}
            </span>
          </div>

          {i < stats.length - 1 ? (
            <span
              aria-hidden="true"
              className="hidden sm:block w-px h-14"
              style={{ background: "var(--rule-strong)" }}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}
