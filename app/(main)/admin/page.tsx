import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/gate";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

async function counts() {
  const supabase = await createClient();

  const q = (table: string) =>
    supabase.from(table).select("id", { count: "exact", head: true });

  const [
    approved,
    pending,
    rejected,
    pairs,
    unpaired,
    seeking,
    reports,
    seatedPairs,
    tables,
    checkedIn,
  ] = await Promise.all([
    q("profiles").eq("review_status", "approved"),
    q("profiles").eq("review_status", "pending"),
    q("profiles").eq("review_status", "rejected"),
    q("pairs").eq("status", "confirmed"),
    q("profiles").eq("review_status", "approved").eq("pairing_status", "unpaired"),
    q("profiles").eq("seeking_help", true).eq("pairing_status", "unpaired"),
    q("reports").eq("status", "open"),
    q("pairs").eq("status", "confirmed").not("table_id", "is", null),
    q("tables"),
    q("passes").not("checked_in_a_at", "is", null),
  ]);

  return {
    approved: approved.count ?? 0,
    pending: pending.count ?? 0,
    rejected: rejected.count ?? 0,
    pairs: pairs.count ?? 0,
    unpaired: unpaired.count ?? 0,
    seeking: seeking.count ?? 0,
    reports: reports.count ?? 0,
    seatedPairs: seatedPairs.count ?? 0,
    tables: tables.count ?? 0,
    checkedIn: checkedIn.count ?? 0,
  };
}

export default async function AdminOverview() {
  const { config } = await requireAdmin();
  const c = await counts();

  const seatsTaken = c.pairs * 2;
  const unseated = c.pairs - c.seatedPairs;

  const tiles = [
    { label: "Approved guests", value: c.approved, href: "/admin/profiles" },
    { label: "Awaiting approval", value: c.pending, href: "/admin/profiles", urgent: c.pending > 0 },
    { label: "Pairs confirmed", value: c.pairs },
    { label: "Still looking", value: c.unpaired },
    { label: "Asked for help", value: c.seeking, href: "/admin/matchmaker", urgent: c.seeking > 0 },
    { label: "Open reports", value: c.reports, href: "/admin/moderation", urgent: c.reports > 0 },
    { label: "Pairs unseated", value: unseated, href: "/admin/tables", urgent: unseated > 0 },
    { label: "Seats taken", value: `${seatsTaken}/${config.total_seats}` },
  ];

  const flags = [
    { on: config.registration_open, label: "Registration" },
    { on: config.discovery_open, label: "Discovery" },
    { on: config.seat_selection_enabled, label: "Seat selection" },
    { on: config.require_photo, label: "Photo required" },
  ];

  return (
    <div className="flex flex-col gap-10">
      <section className="grid gap-px bg-rule border border-rule grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => {
          const inner = (
            <>
              <span
                className="numeric text-3xl leading-none"
                style={{ color: t.urgent ? "var(--gold)" : "var(--ink)" }}
              >
                {t.value}
              </span>
              <span className="text-[10.5px] uppercase tracking-[0.14em] text-ink-faint">
                {t.label}
              </span>
            </>
          );

          return t.href ? (
            <Link
              key={t.label}
              href={t.href}
              className="bg-ivory p-5 flex flex-col gap-1.5 hover:bg-paper transition-colors"
            >
              {inner}
            </Link>
          ) : (
            <div key={t.label} className="bg-ivory p-5 flex flex-col gap-1.5">
              {inner}
            </div>
          );
        })}
      </section>

      <section className="flex flex-col gap-4">
        <span className="eyebrow">Live switches</span>
        <div className="flex flex-wrap gap-2">
          {flags.map((f) => (
            <span key={f.label} className={`pill ${f.on ? "pill-good" : "pill-quiet"}`}>
              {f.label} {f.on ? "on" : "off"}
            </span>
          ))}
          <Link href="/admin/settings" className="btn btn-quiet text-[13px]">
            Change
          </Link>
        </div>
      </section>

      <section className="flex flex-col gap-4 border-t border-rule pt-8">
        <span className="eyebrow">Exports</span>
        <div className="flex flex-wrap gap-3">
          <a href="/admin/export?type=attendees" className="btn btn-ghost">
            Attendee list (CSV)
          </a>
          <a href="/admin/export?type=seating" className="btn btn-ghost">
            Seating chart (CSV)
          </a>
          <a href="/admin/export?type=tablecards" className="btn btn-ghost">
            Table cards (print)
          </a>
        </div>
        <p className="text-[13px] text-ink-faint max-w-[58ch]">
          {c.checkedIn > 0
            ? `${c.checkedIn} pairs have checked in at the door.`
            : "Nobody has checked in yet."}{" "}
          {unseated > 0
            ? `${unseated} confirmed ${unseated === 1 ? "pair still needs" : "pairs still need"} a table.`
            : "Every confirmed pair has a table."}
        </p>
      </section>
    </div>
  );
}
