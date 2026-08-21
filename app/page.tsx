import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { avatarUrl, formatEventDate, initials } from "@/lib/utils";
import type { PublicStats, WallPair } from "@/lib/types";
import SiteNav from "@/components/SiteNav";
import LiveStats from "@/components/LiveStats";
import Countdown from "@/components/Countdown";
import LoveNoteWall, { type PublicNote } from "@/components/LoveNoteWall";
import { BotanicalSpray, LeafWreath } from "@/components/Botanical";

export const dynamic = "force-dynamic";

type Guest = { first_name: string; photo_url: string | null; paired: boolean };

const STEPS = [
  { t: "Create Your Profile", d: "A photo, and three prompts worth answering. People choose a date from what you wrote." },
  { t: "Write A Love Note", d: "You cannot ask anyone to this dinner without writing to them first. That is the whole point." },
  { t: "Send The Invitation", d: "Five for the entire event, one waiting for an answer at a time. Make the first one count." },
  { t: "Wait For A Yes", d: "Forty-eight hours to answer. Saying no is private, and costs neither of you anything." },
  { t: "Take Your Table", d: "The moment you are paired, your pass unlocks and two seats become yours." },
  { t: "Tell Everyone", d: "Make your graphic, post it, tag us. We will repost the ones that make us smile." },
];

function SectionHead({
  eyebrow,
  title,
  script,
  intro,
  align = "center",
}: {
  eyebrow: string;
  title: string;
  script?: string;
  intro?: string;
  align?: "center" | "left";
}) {
  return (
    <div
      className={`flex flex-col gap-4 ${
        align === "center" ? "items-center text-center mx-auto" : "items-start"
      }`}
      style={{ maxWidth: align === "center" ? "620px" : undefined }}
    >
      <span className="eyebrow">{eyebrow}</span>
      <h2 className="text-[clamp(2.1rem,5vw,3.4rem)]">
        {title}
        {script ? (
          <>
            {" "}
            <span className="script text-[clamp(2.9rem,7vw,4.6rem)] inline-block align-baseline">
              {script}
            </span>
          </>
        ) : null}
      </h2>
      {intro ? (
        <p className="text-[15px] leading-[1.9]" style={{ color: "var(--ink-soft)" }}>
          {intro}
        </p>
      ) : null}
    </div>
  );
}

function Face({
  url,
  name,
  size = 60,
  ring = "var(--sage-pale)",
}: {
  url: string | null;
  name: string;
  size?: number;
  ring?: string;
}) {
  const src = avatarUrl(url, 200);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      className="rounded-full object-cover"
      style={{ width: size, height: size, border: `1px solid ${ring}` }}
    />
  ) : (
    <span
      className="rounded-full grid place-items-center font-display"
      style={{
        width: size,
        height: size,
        border: `1px solid ${ring}`,
        background: "var(--ivory-warm)",
        color: "var(--olive-soft)",
        fontSize: size / 2.8,
      }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

export default async function LandingPage() {
  const supabase = await createClient();

  const [
    { data: { user } },
    { data: statsData },
    { data: counters },
    { data: wallData },
    { data: notesData },
    { data: guestsData },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("get_public_stats"),
    supabase.from("public_counters").select("approved_profiles, confirmed_pairs, seats_taken").maybeSingle(),
    supabase.rpc("get_public_wall", { p_limit: 12 }),
    supabase.rpc("get_public_love_notes", { p_limit: 20 }),
    supabase.rpc("get_public_guests", { p_limit: 18 }),
  ]);

  const stats = (statsData ?? null) as PublicStats | null;
  const couples = (wallData ?? []) as WallPair[];
  const notes = (notesData ?? []) as PublicNote[];
  const guests = (guestsData ?? []) as Guest[];

  const eventName = stats?.event_name ?? "FYB Dinner Night";
  const totalSeats = stats?.total_seats ?? 300;
  const registerHref = user ? "/continue" : "/login";

  return (
    <>
      <SiteNav signedIn={Boolean(user)} />

      <main>
        {/* ================================================== hero ======== */}
        <section className="relative overflow-hidden">
          <BotanicalSpray
            className="absolute left-[-70px] bottom-[-30px] w-[240px] sm:w-[320px] lg:w-[380px]"
            opacity={0.55}
          />
          <BotanicalSpray
            className="absolute right-[-70px] top-[40px] w-[220px] sm:w-[300px] lg:w-[350px]"
            flip
            tone="gold"
            opacity={0.5}
          />

          <div className="relative max-w-[1240px] mx-auto px-5 sm:px-9 pt-16 pb-24 sm:pt-24 sm:pb-32">
            <div className="max-w-[760px] mx-auto text-center flex flex-col items-center gap-8 rise">
              <span className="eyebrow">CACCF Presents · {eventName}</span>

              <h1 className="text-[clamp(2.6rem,8.5vw,5.6rem)] leading-[1.04]">
                No Date,
                <br />
                <span className="script text-[clamp(4rem,13vw,9rem)] block mt-2 mb-1">
                  No Dinner
                </span>
              </h1>

              <p
                className="text-[16px] sm:text-[17px] leading-[1.95] max-w-[52ch]"
                style={{ color: "var(--ink-soft)" }}
              >
                Nobody comes to this one alone. Write someone a love note, ask
                them properly, and your seat is yours the moment they say yes.
              </p>

              <div className="flex flex-wrap gap-4 justify-center pt-2">
                <Link href={registerHref} className="btn btn-primary">
                  {stats?.registration_open === false ? "Registration Closed" : "Reserve Your Seat"}
                </Link>
                <a href="#how" className="btn btn-ghost">
                  How It Works
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ================================================== steps ======= */}
        <section
          id="how"
          className="relative scroll-mt-20 py-20 sm:py-28"
          style={{ background: "var(--paper)", borderTop: "1px solid var(--rule)" }}
        >
          <div className="max-w-[1240px] mx-auto px-5 sm:px-9 flex flex-col gap-14">
            <SectionHead
              eyebrow="How It Works"
              title="What To"
              script="Expect"
              intro="Six steps between opening this page and sitting down to dinner. One of them is not up to you."
            />

            <ol className="grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.t} className="flex flex-col items-center text-center gap-4">
                  <span
                    className="w-14 h-14 grid place-items-center rounded-full font-display text-xl"
                    style={{
                      border: "1px solid var(--gold-light)",
                      background: "var(--gold-wash)",
                      color: "var(--gold)",
                    }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="text-2xl">{s.t}</h3>
                  <p className="text-[14.5px] leading-[1.85] max-w-[34ch]" style={{ color: "var(--ink-soft)" }}>
                    {s.d}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ================================================== the rule ==== */}
        <section className="relative overflow-hidden py-20 sm:py-28">
          <span
            aria-hidden="true"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-display leading-none select-none whitespace-nowrap"
            style={{
              fontSize: "clamp(9rem, 30vw, 24rem)",
              color: "var(--ivory-warm)",
              zIndex: 0,
            }}
          >
            2026
          </span>

          <div className="relative max-w-[1240px] mx-auto px-5 sm:px-9 flex flex-col gap-14 items-center">
            <SectionHead
              eyebrow="The One Rule"
              title="Your Registration Is Not Finished Until Someone Says"
              script="Yes"
              intro="You can bring a date you already have, or find one here. Either way, a seat only becomes yours when two people have agreed to share a table. That is what makes the whole night different."
            />

            <LiveStats
              initial={counters ?? { approved_profiles: 0, confirmed_pairs: 0, seats_taken: 0 }}
              totalSeats={totalSeats}
            />

            {stats?.event_starts_at ? (
              <Countdown to={stats.event_starts_at} label="The Night Begins In" />
            ) : null}
          </div>
        </section>

        {/* ================================================== couples ===== */}
        {couples.length > 0 ? (
          <section
            id="couples"
            className="relative overflow-hidden scroll-mt-20 py-20 sm:py-28"
            style={{ background: "var(--paper)", borderTop: "1px solid var(--rule)" }}
          >
            <BotanicalSpray className="absolute right-[-80px] bottom-0 w-[260px]" flip opacity={0.4} />

            <div className="relative max-w-[1240px] mx-auto px-5 sm:px-9 flex flex-col gap-14">
              <SectionHead
                eyebrow="Already Paired"
                title="They Found Their"
                script="Person"
                intro={`${couples.length} ${couples.length === 1 ? "pair has" : "pairs have"} sorted themselves out. Their seats are gone.`}
              />

              <ul className="grid gap-x-8 gap-y-12 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                {couples.map((c) => (
                  <li key={c.pair_id} className="flex flex-col items-center text-center gap-4">
                    <div className="flex items-center -space-x-4">
                      <Face url={c.photo_a} name={c.name_a} size={72} ring="var(--gold-light)" />
                      <Face url={c.photo_b} name={c.name_b} size={72} ring="var(--gold-light)" />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <p className="font-display text-[22px] leading-tight" style={{ color: "var(--olive)" }}>
                        {c.name_a}
                        <span className="script text-[26px] mx-1.5">&</span>
                        {c.name_b}
                      </p>
                      <span className="text-[9.5px] tracking-[0.24em] uppercase" style={{ color: "var(--gold)" }}>
                        Table For Two
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {/* ================================================== quote ======= */}
        <section className="relative py-24 sm:py-32">
          <div className="relative max-w-[760px] mx-auto px-5 sm:px-9 grid place-items-center">
            <LeafWreath className="absolute w-[min(560px,120%)] opacity-70" />
            <blockquote className="relative text-center flex flex-col items-center gap-6 py-10">
              <p className="font-display text-[clamp(1.5rem,3.6vw,2.3rem)] leading-[1.45] italic" style={{ color: "var(--olive)" }}>
                &ldquo;The best table in the room is the one where somebody had
                to be brave enough to ask.&rdquo;
              </p>
              <span className="eyebrow">The FYB Committee</span>
            </blockquote>
          </div>
        </section>

        {/* ================================================== notes ======= */}
        <section
          id="notes"
          className="relative overflow-hidden scroll-mt-20 py-20 sm:py-28"
          style={{ background: "var(--paper)", borderTop: "1px solid var(--rule)" }}
        >
          <BotanicalSpray className="absolute left-[-80px] top-10 w-[240px]" opacity={0.4} />

          <div className="relative max-w-[1240px] mx-auto px-5 sm:px-9 flex flex-col gap-14">
            <SectionHead
              eyebrow="Love Notes"
              title="What They Wrote To"
              script="Each Other"
              intro="Every invitation carries a note. These are the ones people were happy for us to share — the rest stay between the two of them."
            />

            {notes.length > 0 ? (
              <LoveNoteWall notes={notes} />
            ) : (
              <div
                className="py-16 text-center flex flex-col items-center gap-4"
                style={{ border: "1px solid var(--rule)", background: "var(--ivory)" }}
              >
                <span className="script text-5xl">Soon</span>
                <p className="text-[15px] max-w-[40ch]" style={{ color: "var(--ink-soft)" }}>
                  The first notes are being written. Come back once a few more
                  people have found their person.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* ================================================== details ===== */}
        <section id="details" className="relative scroll-mt-20 py-20 sm:py-28">
          <div className="max-w-[1240px] mx-auto px-5 sm:px-9 grid gap-14 lg:grid-cols-[1fr_1fr] lg:items-center">
            <div className="flex flex-col gap-7">
              <SectionHead
                align="left"
                eyebrow="The Evening"
                title="An Evening Worth Getting"
                script="Dressed For"
                intro="Candlelight, a long table, and a room where every single person had to be asked to be there."
              />
              <Link href={registerHref} className="btn btn-primary self-start">
                Reserve Your Seat
              </Link>
            </div>

            <dl className="grid gap-px" style={{ background: "var(--rule)", border: "1px solid var(--rule)" }}>
              {[
                { k: "When", v: formatEventDate(stats?.event_starts_at ?? null) },
                { k: "Where", v: stats?.venue ?? "To be announced" },
                { k: "Dress", v: stats?.dress_code ?? "Come as your best self" },
                {
                  k: "Seats",
                  v: `${stats?.seats_left ?? totalSeats} of ${totalSeats} remaining`,
                },
              ].map((row) => (
                <div key={row.k} className="p-6 sm:p-7 flex flex-col gap-1.5" style={{ background: "var(--paper)" }}>
                  <dt className="text-[9.5px] tracking-[0.26em] uppercase" style={{ color: "var(--gold)" }}>
                    {row.k}
                  </dt>
                  <dd className="font-display text-[22px] leading-snug" style={{ color: "var(--olive)" }}>
                    {row.v}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ================================================== guests ====== */}
        {guests.length > 0 ? (
          <section
            id="guests"
            className="relative overflow-hidden scroll-mt-20 py-20 sm:py-28"
            style={{ background: "var(--paper)", borderTop: "1px solid var(--rule)" }}
          >
            <div className="relative max-w-[1240px] mx-auto px-5 sm:px-9 flex flex-col gap-14">
              <SectionHead
                eyebrow="The Guest List"
                title="Who Is Already"
                script="Coming"
                intro="Everyone here has been approved by the committee. Sign in to see who is still looking for a date."
              />

              <ul className="flex flex-wrap justify-center gap-x-8 gap-y-10">
                {guests.map((g, i) => (
                  <li key={`${g.first_name}-${i}`} className="flex flex-col items-center gap-3 w-[92px]">
                    <Face
                      url={g.photo_url}
                      name={g.first_name}
                      size={84}
                      ring={g.paired ? "var(--gold-light)" : "var(--sage-pale)"}
                    />
                    <span className="font-display text-[17px] text-center leading-tight" style={{ color: "var(--olive)" }}>
                      {g.first_name}
                    </span>
                    {g.paired ? (
                      <span className="text-[8.5px] tracking-[0.2em] uppercase" style={{ color: "var(--gold)" }}>
                        Paired
                      </span>
                    ) : (
                      <span className="text-[8.5px] tracking-[0.2em] uppercase" style={{ color: "var(--ink-faint)" }}>
                        Looking
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {/* ================================================== cta ========= */}
        <section className="relative overflow-hidden py-24 sm:py-32">
          <BotanicalSpray className="absolute left-[-60px] bottom-[-20px] w-[220px]" opacity={0.45} />
          <BotanicalSpray className="absolute right-[-60px] top-0 w-[220px]" flip tone="gold" opacity={0.45} />

          <div className="relative max-w-[640px] mx-auto px-5 sm:px-9 text-center flex flex-col items-center gap-7">
            <span className="eyebrow">One Last Thing</span>
            <h2 className="text-[clamp(2.2rem,6vw,3.6rem)] leading-[1.08]">
              Somebody Is Waiting
              <br />
              <span className="script text-[clamp(3.2rem,9vw,5.6rem)] block mt-2">
                To Be Asked
              </span>
            </h2>
            <p className="text-[15.5px] leading-[1.9] max-w-[44ch]" style={{ color: "var(--ink-soft)" }}>
              Five invitations. One at a time. Nothing happens until you write
              the first note.
            </p>
            <Link href={registerHref} className="btn btn-gold">
              Write Your First Note
            </Link>
          </div>
        </section>

        {/* ================================================== footer ====== */}
        <footer style={{ background: "var(--olive)", color: "var(--ivory-warm)" }}>
          <div className="max-w-[1240px] mx-auto px-5 sm:px-9 py-16 grid gap-12 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-3">
              <span className="font-display text-2xl tracking-[0.16em] uppercase" style={{ color: "var(--ivory)" }}>
                FYB
              </span>
              <span className="text-[9px] tracking-[0.32em] uppercase" style={{ color: "var(--gold-light)" }}>
                Dinner Night
              </span>
              <p className="text-[13.5px] leading-[1.9] mt-2" style={{ color: "var(--sage-pale)" }}>
                A dinner where nobody comes alone. Organised by the CACCF
                fellowship committee.
              </p>
            </div>

            <nav className="flex flex-col gap-3">
              <span className="text-[9.5px] tracking-[0.26em] uppercase" style={{ color: "var(--gold-light)" }}>
                The Night
              </span>
              {[
                { h: "/#how", l: "How It Works" },
                { h: "/#couples", l: "The Couples" },
                { h: "/#notes", l: "Love Notes" },
                { h: "/#guests", l: "Guest List" },
              ].map((x) => (
                <Link key={x.h} href={x.h} className="text-[13.5px]" style={{ color: "var(--sage-pale)" }}>
                  {x.l}
                </Link>
              ))}
            </nav>

            <nav className="flex flex-col gap-3">
              <span className="text-[9.5px] tracking-[0.26em] uppercase" style={{ color: "var(--gold-light)" }}>
                Your Dinner
              </span>
              {[
                { h: registerHref, l: user ? "My Dinner" : "Register" },
                { h: "/login", l: "Sign In" },
                { h: "/invitations", l: "Invitations" },
                { h: "/pass", l: "Your Pass" },
              ].map((x) => (
                <Link key={x.l} href={x.h} className="text-[13.5px]" style={{ color: "var(--sage-pale)" }}>
                  {x.l}
                </Link>
              ))}
            </nav>

            <div className="flex flex-col gap-3">
              <span className="text-[9.5px] tracking-[0.26em] uppercase" style={{ color: "var(--gold-light)" }}>
                Stuck For A Date?
              </span>
              <p className="text-[13.5px] leading-[1.9]" style={{ color: "var(--sage-pale)" }}>
                Turn on <em>Help me find a date</em> in your profile. It is
                private, only the committee sees it, and we will pair you
                ourselves before the deadline.
              </p>
              {stats?.hashtag ? (
                <span className="script text-3xl mt-1" style={{ color: "var(--gold-light)" }}>
                  {stats.hashtag}
                </span>
              ) : null}
            </div>
          </div>

          <div
            className="max-w-[1240px] mx-auto px-5 sm:px-9 py-6 text-[12px] flex flex-col sm:flex-row gap-2 sm:justify-between"
            style={{ borderTop: "1px solid rgba(255,255,255,0.12)", color: "var(--sage)" }}
          >
            <span>© {new Date().getFullYear()} CACCF · {eventName}</span>
            <span>{stats?.social_handle ?? ""}</span>
          </div>
        </footer>
      </main>
    </>
  );
}
