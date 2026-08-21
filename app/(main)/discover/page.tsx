import Link from "next/link";
import { redirect } from "next/navigation";
import { requireApproved } from "@/lib/gate";
import { createClient } from "@/lib/supabase/server";
import type { DiscoveryCard, Invitation } from "@/lib/types";
import { timeLeft } from "@/lib/utils";
import DiscoverGrid from "@/components/DiscoverGrid";
import SeekingHelpToggle from "@/components/SeekingHelpToggle";

export const metadata = { title: "Discover" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; dept?: string; level?: string; page?: string }>;
}) {
  const { profile, config } = await requireApproved();
  if (profile.pairing_status === "paired") redirect("/pair");

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const supabase = await createClient();

  const [{ data: cardsData, error }, { data: outstandingData }] = await Promise.all([
    supabase.rpc("browse_profiles", {
      p_search: sp.q ?? null,
      p_department: sp.dept ?? null,
      p_level: sp.level ?? null,
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    }),
    supabase
      .from("invitations")
      .select("*")
      .eq("sender_id", profile.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const cards = (cardsData ?? []) as DiscoveryCard[];
  const outstanding = ((outstandingData ?? []) as Invitation[])[0] ?? null;

  const invitesLeft = Math.max(
    0,
    config.max_lifetime_invites - profile.invites_sent_count,
  );

  const closed = !config.discovery_open || Boolean(error);

  return (
    <main className="max-w-[1100px] mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="flex flex-col gap-9">
        <header className="flex flex-col gap-5">
          <div className="flex flex-col gap-3">
            <span className="eyebrow">Find your date</span>
            <h1 className="text-[clamp(2.2rem,7vw,3.4rem)] leading-[0.95]">
              Who&apos;s
              <br />
              <em style={{ color: "var(--gold)" }}>still looking.</em>
            </h1>
          </div>

          <div className="grid gap-px bg-rule border border-rule sm:grid-cols-3">
            <div className="bg-ivory px-4 py-4 flex flex-col gap-1">
              <span className="numeric text-2xl leading-none">{invitesLeft}</span>
              <span className="text-[10.5px] uppercase tracking-[0.14em] text-ink-faint">
                invitations left
              </span>
            </div>
            <div className="bg-ivory px-4 py-4 flex flex-col gap-1">
              <span className="numeric text-2xl leading-none">
                {outstanding ? 1 : 0}/{config.max_outstanding_invites}
              </span>
              <span className="text-[10.5px] uppercase tracking-[0.14em] text-ink-faint">
                waiting on an answer
              </span>
            </div>
            <div className="bg-ivory px-4 py-4 flex flex-col gap-1">
              <span className="numeric text-2xl leading-none">
                {config.invite_expiry_hours}h
              </span>
              <span className="text-[10.5px] uppercase tracking-[0.14em] text-ink-faint">
                before one expires
              </span>
            </div>
          </div>

          {outstanding ? (
            <div
              className="p-4 border flex flex-wrap items-center justify-between gap-3"
              style={{ borderColor: "var(--gold)", background: "var(--gold-wash)" }}
            >
              <p className="text-[14px]">
                You have an invitation waiting for an answer —{" "}
                <span className="numeric">{timeLeft(outstanding.expires_at)}</span>.
              </p>
              <Link href="/invitations" className="btn btn-ghost text-[13px]">
                See it
              </Link>
            </div>
          ) : null}

          {invitesLeft === 0 && !outstanding ? (
            <div
              className="p-4 border flex flex-col gap-2"
              style={{ borderColor: "var(--olive)", background: "var(--gold-wash)" }}
            >
              <p className="text-[15px]">You&apos;ve used all your invitations.</p>
              <p className="text-[13px] text-ink-soft">
                Turn on the toggle below and the committee will find you a date
                themselves. That&apos;s what it&apos;s there for.
              </p>
            </div>
          ) : null}
        </header>

        {/* ------------------------------------------------------ filters */}
        <form className="flex flex-wrap gap-3 items-end" action="/discover">
          <div className="flex-1 min-w-[180px]">
            <label className="label" htmlFor="q">Search by name</label>
            <input id="q" name="q" className="field" defaultValue={sp.q ?? ""} placeholder="Someone in mind?" />
          </div>
          <div className="w-[150px]">
            <label className="label" htmlFor="dept">Department</label>
            <input id="dept" name="dept" className="field" defaultValue={sp.dept ?? ""} placeholder="Any" />
          </div>
          <div className="w-[110px]">
            <label className="label" htmlFor="level">Level</label>
            <input id="level" name="level" className="field" defaultValue={sp.level ?? ""} placeholder="Any" />
          </div>
          <button type="submit" className="btn btn-ghost">Filter</button>
          {sp.q || sp.dept || sp.level ? (
            <Link href="/discover" className="btn btn-quiet">Clear</Link>
          ) : null}
        </form>

        {closed ? (
          <div className="card p-10 text-center flex flex-col gap-3 items-center">
            <h3 className="text-2xl">Finding dates is closed</h3>
            <p className="text-ink-soft max-w-[40ch]">
              The committee has paused this. If you still need a date, turn on
              the toggle below and we&apos;ll sort it out with you directly.
            </p>
          </div>
        ) : (
          <DiscoverGrid
            cards={cards}
            invitesLeft={invitesLeft}
            hasOutstanding={
              (outstanding ? 1 : 0) >= config.max_outstanding_invites
            }
            minNoteLength={config.min_love_note_length ?? 40}
            maxNoteLength={config.max_love_note_length ?? 500}
          />
        )}

        {/* --------------------------------------------------- pagination */}
        {!closed && (page > 1 || cards.length === PAGE_SIZE) ? (
          <nav className="flex gap-3 justify-center" aria-label="Pagination">
            {page > 1 ? (
              <Link
                href={{ pathname: "/discover", query: { ...sp, page: page - 1 } }}
                className="btn btn-ghost"
              >
                Previous
              </Link>
            ) : null}
            {cards.length === PAGE_SIZE ? (
              <Link
                href={{ pathname: "/discover", query: { ...sp, page: page + 1 } }}
                className="btn btn-ghost"
              >
                Next
              </Link>
            ) : null}
          </nav>
        ) : null}

        <SeekingHelpToggle initial={profile.seeking_help} />
      </div>
    </main>
  );
}
