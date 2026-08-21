import Link from "next/link";
import { redirect } from "next/navigation";
import { requireApproved } from "@/lib/gate";
import { createClient } from "@/lib/supabase/server";
import TablePicker, { type TableSlot } from "@/components/TablePicker";

export const metadata = { title: "Your table" };
export const dynamic = "force-dynamic";

export default async function SeatingPage() {
  const { profile, config } = await requireApproved();
  if (profile.pairing_status !== "paired") redirect("/discover");

  const supabase = await createClient();
  const { data } = await supabase.rpc("get_table_map");
  const tables = (data ?? []) as TableSlot[];

  const mine = tables.find((t) => t.is_mine) ?? null;
  const seatsLeft = tables
    .filter((t) => t.is_open)
    .reduce((sum, t) => sum + Math.max(0, t.capacity - t.seats_taken), 0);

  return (
    <main className="max-w-[1000px] mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="flex flex-col gap-9">
        <header className="flex flex-col gap-4">
          <span className="eyebrow">The room</span>
          <h1 className="text-[clamp(2.2rem,7vw,3.4rem)] leading-[0.95]">
            {mine ? (
              <>
                You&apos;re at
                <br />
                <em style={{ color: "var(--gold)" }}>{mine.label}.</em>
              </>
            ) : (
              <>
                Pick your
                <br />
                <em style={{ color: "var(--gold)" }}>table.</em>
              </>
            )}
          </h1>

          {config.seat_selection_enabled ? (
            <p className="text-ink-soft max-w-[52ch]">
              {mine
                ? "Changed your mind? Take two seats at any other table with room."
                : "Two seats, together — you and your date are never split up."}{" "}
              <span className="numeric" style={{ color: "var(--gold)" }}>
                {seatsLeft}
              </span>{" "}
              {seatsLeft === 1 ? "seat" : "seats"} left in the room.
            </p>
          ) : (
            <div
              className="p-5 border flex flex-col gap-2"
              style={{ borderColor: "var(--rule-strong)", background: "var(--paper)" }}
            >
              <p className="text-[15px]">
                {mine
                  ? `The committee has seated you at ${mine.label}.`
                  : "The committee is arranging the seating for this event."}
              </p>
              <p className="text-[13px] text-ink-soft">
                Your table appears on your pass as soon as it&apos;s set.
              </p>
            </div>
          )}
        </header>

        {config.seat_selection_enabled ? <TablePicker tables={tables} /> : null}

        <div className="flex flex-wrap gap-3 border-t border-rule pt-8">
          <Link href="/pass" className="btn btn-ghost">Your pass</Link>
          <Link href="/pair" className="btn btn-quiet">Back to your date</Link>
        </div>
      </div>
    </main>
  );
}
