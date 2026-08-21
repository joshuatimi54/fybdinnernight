import Link from "next/link";
import { requireApproved } from "@/lib/gate";
import { createClient } from "@/lib/supabase/server";
import { avatarUrl, fullName, initials, timeLeft } from "@/lib/utils";
import type { DateMessage, DinnerTable, Pair, Profile } from "@/lib/types";
import JourneyStepper, { type Step } from "@/components/JourneyStepper";

export const metadata = { title: "Your dinner" };
export const dynamic = "force-dynamic";

type FeedRow = {
  id: string;
  direction: "received" | "sent";
  first_name: string;
  last_initial: string;
  status: string;
  expires_at: string;
};

function PersonCard({
  eyebrow,
  profile,
  meta,
  action,
}: {
  eyebrow: string;
  profile: Partial<Profile> & { first_name: string; last_name: string };
  meta?: { k: string; v: string }[];
  action?: { href: string; label: string };
}) {
  const photo = avatarUrl(profile.photo_url ?? null, 400);
  const prompts = Array.isArray(profile.prompts) ? profile.prompts.filter((p) => p.a) : [];

  return (
    <article
      className="flex flex-col gap-6 p-7 sm:p-8"
      style={{ background: "var(--paper)", border: "1px solid var(--rule)" }}
    >
      <span className="eyebrow">{eyebrow}</span>

      <div className="flex items-center gap-5">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt=""
            className="w-[86px] h-[86px] rounded-full object-cover shrink-0"
            style={{ border: "1px solid var(--gold-light)" }}
          />
        ) : (
          <span
            className="w-[86px] h-[86px] rounded-full grid place-items-center font-display text-3xl shrink-0"
            style={{
              border: "1px solid var(--gold-light)",
              background: "var(--ivory-warm)",
              color: "var(--olive-soft)",
            }}
          >
            {initials(profile.first_name, profile.last_name)}
          </span>
        )}

        <div className="flex flex-col gap-1 min-w-0">
          <h3 className="font-display text-[26px] leading-tight">
            {fullName(profile.first_name, profile.last_name)}
          </h3>
          {profile.department || profile.level ? (
            <p className="text-[12px] tracking-[0.14em] uppercase" style={{ color: "var(--ink-faint)" }}>
              {[profile.department, profile.level].filter(Boolean).join(" · ")}
            </p>
          ) : null}
          {profile.bio ? (
            <p className="text-[14px] mt-1" style={{ color: "var(--ink-soft)" }}>
              {profile.bio}
            </p>
          ) : null}
        </div>
      </div>

      {prompts.length > 0 ? (
        <div className="flex flex-col gap-4 pt-1">
          {prompts.slice(0, 2).map((p, i) => (
            <div key={i} className="flex flex-col gap-1">
              <span className="text-[10px] tracking-[0.2em] uppercase" style={{ color: "var(--gold)" }}>
                {p.q}
              </span>
              <p className="text-[15px]" style={{ color: "var(--olive)" }}>
                {p.a}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {meta && meta.length > 0 ? (
        <dl
          className="grid gap-px mt-auto"
          style={{ background: "var(--rule)", border: "1px solid var(--rule)" }}
        >
          {meta.map((m) => (
            <div key={m.k} className="p-4 flex justify-between gap-4" style={{ background: "var(--paper)" }}>
              <dt className="text-[10px] tracking-[0.2em] uppercase pt-1" style={{ color: "var(--ink-faint)" }}>
                {m.k}
              </dt>
              <dd className="text-[15px] text-right break-all" style={{ color: "var(--olive)" }}>
                {m.v}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {action ? (
        <Link href={action.href} className="btn btn-ghost self-start">
          {action.label}
        </Link>
      ) : null}
    </article>
  );
}

export default async function DashboardPage() {
  const { profile, config } = await requireApproved();
  const supabase = await createClient();

  const paired = profile.pairing_status === "paired" && Boolean(profile.active_pair_id);

  const [{ data: feedData }, { data: pairData }] = await Promise.all([
    supabase.rpc("get_my_invitations"),
    paired
      ? supabase.from("pairs").select("*").eq("id", profile.active_pair_id!).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const feed = (feedData ?? []) as FeedRow[];
  const pair = pairData as Pair | null;

  const waitingOnMe = feed.filter((f) => f.direction === "received" && f.status === "pending");
  const waitingOnThem = feed.filter((f) => f.direction === "sent" && f.status === "pending");

  let partner: Profile | null = null;
  let table: DinnerTable | null = null;
  let myMessage: DateMessage | null = null;
  let theirMessage: DateMessage | null = null;

  if (pair) {
    const partnerId = pair.user_a_id === profile.id ? pair.user_b_id : pair.user_a_id;

    const [{ data: p }, { data: t }, { data: msgs }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", partnerId).maybeSingle(),
      pair.table_id
        ? supabase.from("tables").select("*").eq("id", pair.table_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("date_messages").select("*").eq("pair_id", pair.id),
    ]);

    partner = p as Profile | null;
    table = t as DinnerTable | null;
    const all = (msgs ?? []) as DateMessage[];
    myMessage = all.find((m) => m.author_id === profile.id) ?? null;
    theirMessage = all.find((m) => m.author_id === partnerId) ?? null;
  }

  const invitesLeft = Math.max(0, config.max_lifetime_invites - profile.invites_sent_count);
  const hasAsked = profile.invites_sent_count > 0;

  // ------------------------------------------------------------- the steps --
  const steps: Step[] = [
    {
      label: "Your profile",
      detail: "Approved by the committee and visible to the people you can ask.",
      state: "done",
    },
    {
      label: hasAsked ? "You wrote a love note" : "Write your first love note",
      detail: hasAsked
        ? `You have asked ${profile.invites_sent_count} ${profile.invites_sent_count === 1 ? "person" : "people"} so far. ${invitesLeft} ${invitesLeft === 1 ? "invitation" : "invitations"} left.`
        : "Nobody gets invited to this dinner with a tap. Find someone, write them something real, and ask.",
      state: hasAsked || paired ? "done" : "current",
      href: "/discover",
      cta: "Find someone to ask",
    },
    {
      label: paired ? "Someone said yes" : "Wait for a yes",
      detail: paired
        ? `You are going with ${partner?.first_name ?? "your date"}.`
        : waitingOnThem.length > 0
          ? `${waitingOnThem[0].first_name} has your note — ${timeLeft(waitingOnThem[0].expires_at).toLowerCase()}.`
          : waitingOnMe.length > 0
            ? `${waitingOnMe.length} ${waitingOnMe.length === 1 ? "person is" : "people are"} waiting on your answer.`
            : "Your seat is not yours until two people have agreed to share a table.",
      state: paired ? "done" : hasAsked || waitingOnMe.length > 0 ? "current" : "todo",
      href: "/invitations",
      cta: waitingOnMe.length > 0 ? "Answer your invitations" : "See your invitations",
    },
    {
      label: myMessage ? "You wrote to your date" : "Write to your date",
      detail: myMessage
        ? theirMessage
          ? "You have both written. Nice."
          : `${partner?.first_name ?? "They"} has not written back yet.`
        : "One message, just for them. It stays private between the two of you.",
      state: myMessage ? "done" : paired ? "current" : "todo",
      href: "/pair",
      cta: "Write your message",
    },
    {
      label: table ? `You are at ${table.label}` : "Take your table",
      detail: table
        ? "Two seats, together. Your table is printed on your pass."
        : config.seat_selection_enabled
          ? "Choose two seats before they run out."
          : "The committee is seating everyone. Your table will appear on your pass.",
      state: table ? "done" : paired ? "current" : "todo",
      href: "/seating",
      cta: "Choose your table",
    },
    {
      label: "Your dinner pass",
      detail: paired
        ? "Show the QR at the door. A screenshot works fine."
        : "Unlocks the moment you are paired.",
      state: paired && table ? "current" : paired ? "todo" : "todo",
      href: "/pass",
      cta: "See your pass",
    },
  ];

  return (
    <main className="max-w-[1140px] mx-auto px-5 sm:px-9 py-12 sm:py-16">
      <div className="flex flex-col gap-14">
        {/* ---------------------------------------------------------- head */}
        <header className="flex flex-col gap-4 rise">
          <span className="eyebrow">
            {paired ? "You Are Going" : "Your Dinner"}
          </span>
          <h1 className="text-[clamp(2.2rem,6.5vw,3.6rem)] leading-[1.06]">
            {paired ? (
              <>
                {profile.first_name}
                <span className="script text-[clamp(2.8rem,8vw,4.6rem)] mx-3">&</span>
                {partner?.first_name ?? "your date"}
              </>
            ) : (
              <>
                Hello,{" "}
                <span className="script text-[clamp(3rem,9vw,5rem)]">
                  {profile.first_name}
                </span>
              </>
            )}
          </h1>
          <p className="text-[15.5px] leading-[1.9] max-w-[52ch]" style={{ color: "var(--ink-soft)" }}>
            {paired
              ? "Everything is settled. Your pass is ready and your seats are held."
              : waitingOnMe.length > 0
                ? `${waitingOnMe.length} ${waitingOnMe.length === 1 ? "person has" : "people have"} written to you. They are waiting on your answer.`
                : "Here is exactly where you are, and the one thing to do next."}
          </p>
        </header>

        {/* ----------------------------------------------------- attention */}
        {!paired && waitingOnMe.length > 0 ? (
          <section
            className="p-7 flex flex-col sm:flex-row sm:items-center gap-5 justify-between"
            style={{ background: "var(--gold-wash)", border: "1px solid var(--gold-light)" }}
          >
            <div className="flex flex-col gap-1">
              <span className="eyebrow">Waiting On You</span>
              <p className="font-display text-[24px]" style={{ color: "var(--olive)" }}>
                {waitingOnMe.length === 1
                  ? `${waitingOnMe[0].first_name} wrote you a love note`
                  : `${waitingOnMe.length} people have written to you`}
              </p>
              <p className="text-[13.5px]" style={{ color: "var(--ink-soft)" }}>
                Saying no is private and costs you nothing.
              </p>
            </div>
            <Link href="/invitations" className="btn btn-primary shrink-0">
              Read Them
            </Link>
          </section>
        ) : null}

        {/* ------------------------------------------------------- profiles */}
        <section className="grid gap-7 lg:grid-cols-2">
          <PersonCard
            eyebrow="Your Profile"
            profile={profile}
            meta={[
              { k: "Invitations left", v: String(invitesLeft) },
              {
                k: "Waiting on them",
                v: waitingOnThem.length > 0 ? waitingOnThem[0].first_name : "—",
              },
            ]}
            action={{ href: "/onboarding", label: "Edit profile" }}
          />

          {paired && partner ? (
            <PersonCard
              eyebrow="Your Date"
              profile={partner}
              meta={[
                { k: "Phone", v: partner.phone ?? "—" },
                { k: "Email", v: partner.email },
                { k: "Table", v: table?.label ?? "Not set yet" },
              ]}
              action={{ href: "/pair", label: "Your date page" }}
            />
          ) : (
            <article
              className="flex flex-col items-center justify-center text-center gap-5 p-10"
              style={{ background: "var(--paper)", border: "1px dashed var(--rule-strong)" }}
            >
              <span className="eyebrow">Your Date</span>
              <span className="script text-[52px]">Not yet</span>
              <p className="text-[14.5px] leading-[1.85] max-w-[34ch]" style={{ color: "var(--ink-soft)" }}>
                {waitingOnThem.length > 0
                  ? `${waitingOnThem[0].first_name} has your note. You will know within the day.`
                  : "This is where your date appears, the moment somebody says yes."}
              </p>
              <Link href="/discover" className="btn btn-gold">
                {hasAsked ? "Ask someone else" : "Find your date"}
              </Link>
            </article>
          )}
        </section>

        {/* -------------------------------------------------------- journey */}
        <section
          className="p-7 sm:p-10 flex flex-col gap-9"
          style={{ background: "var(--paper)", border: "1px solid var(--rule)" }}
        >
          <div className="flex flex-col gap-2">
            <span className="eyebrow">Your Progress</span>
            <h2 className="text-[clamp(1.7rem,4vw,2.4rem)]">
              No date, <span className="script text-[clamp(2.2rem,5.5vw,3.2rem)]">no dinner</span>
            </h2>
          </div>

          <JourneyStepper steps={steps} />
        </section>

        {/* ------------------------------------------------- seeking notice */}
        {!paired && profile.seeking_help ? (
          <p
            className="text-[14px] p-5 leading-[1.85]"
            style={{ background: "var(--sage-pale)", color: "var(--olive)" }}
          >
            You have asked the committee for help finding a date. Nobody else
            can see that. We will pair you before the deadline — you can keep
            looking in the meantime.
          </p>
        ) : null}
      </div>
    </main>
  );
}
