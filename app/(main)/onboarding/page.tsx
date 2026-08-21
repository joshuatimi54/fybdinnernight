import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/gate";
import { createClient } from "@/lib/supabase/server";
import type { Invitation } from "@/lib/types";
import ProfileForm from "@/components/ProfileForm";
import DateStep from "@/components/DateStep";

export const metadata = { title: "Reserve your seat" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const { profile, config } = await requireProfile();
  const sp = await searchParams;

  const registered = profile.review_status === "approved";
  const step = sp.step === "date" && registered ? "date" : "details";

  // Already sorted — nothing to do here.
  if (profile.pairing_status === "paired") redirect("/dashboard");

  let invitesLeft = 0;
  let outstanding = 0;

  if (registered) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("invitations")
      .select("*")
      .eq("sender_id", profile.id)
      .eq("status", "pending");

    outstanding = ((data ?? []) as Invitation[]).length;
    invitesLeft = Math.max(0, config.max_lifetime_invites - profile.invites_sent_count);
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  return (
    <main className="max-w-[720px] mx-auto px-5 sm:px-9 py-12 sm:py-16">
      <div className="flex flex-col gap-10 rise">
        {/* -------------------------------------------------------- steps */}
        <nav aria-label="Progress" className="flex items-center gap-3">
          {[
            { n: 1, label: "Your details", done: registered, here: step === "details" },
            { n: 2, label: "Your date", done: false, here: step === "date" },
          ].map((s, i) => (
            <div key={s.n} className="flex items-center gap-3">
              {i > 0 ? (
                <span
                  className="w-8 h-px"
                  style={{ background: registered ? "var(--gold-light)" : "var(--rule)" }}
                  aria-hidden="true"
                />
              ) : null}
              <span className="flex items-center gap-2">
                <span
                  className="w-7 h-7 grid place-items-center rounded-full text-[11px]"
                  style={{
                    border: `1px solid ${s.done || s.here ? "var(--gold)" : "var(--rule-strong)"}`,
                    background: s.done ? "var(--gold)" : "transparent",
                    color: s.done ? "#FFFDF6" : s.here ? "var(--gold)" : "var(--ink-faint)",
                    fontFamily: "var(--f-body)",
                  }}
                >
                  {s.done ? "✓" : s.n}
                </span>
                <span
                  className="text-[12px] tracking-[0.14em] uppercase"
                  style={{ color: s.here ? "var(--olive)" : "var(--ink-faint)" }}
                >
                  {s.label}
                </span>
              </span>
            </div>
          ))}
        </nav>

        {step === "details" ? (
          <>
            <header className="flex flex-col gap-4">
              <span className="eyebrow">Step One</span>
              <h1 className="text-[clamp(2.2rem,7vw,3.4rem)] leading-[1.04]">
                Tell us who
                <span className="script text-[clamp(2.8rem,9vw,4.4rem)] ml-3">you are</span>
              </h1>
              <p className="text-[15.5px] leading-[1.9] max-w-[50ch]" style={{ color: "var(--ink-soft)" }}>
                No approval queue, no waiting. Save this and you can reserve
                your seat straight away — your surname, phone and email stay
                hidden until you have a date.
              </p>
            </header>

            {!config.registration_open ? (
              <div
                className="p-5"
                style={{ background: "var(--ivory-warm)", border: "1px solid var(--rule-strong)" }}
              >
                <p className="text-[15px]">
                  Registration is closed for this event. You can still edit your
                  details, but no new seats can be reserved.
                </p>
              </div>
            ) : null}

            <ProfileForm profile={profile} requirePhoto={config.require_photo} />
          </>
        ) : (
          <>
            <header className="flex flex-col gap-4">
              <span className="eyebrow">Step Two</span>
              <h1 className="text-[clamp(2.2rem,7vw,3.4rem)] leading-[1.04]">
                Now reserve
                <span className="script text-[clamp(2.8rem,9vw,4.4rem)] ml-3">your seat</span>
              </h1>
              <p className="text-[15.5px] leading-[1.9] max-w-[50ch]" style={{ color: "var(--ink-soft)" }}>
                You&apos;re registered. Your seat is held the moment you and
                somebody else have both said yes.
              </p>
            </header>

            <DateStep
              myUsername={profile.username}
              invitesLeft={invitesLeft}
              canInvite={invitesLeft > 0 && outstanding < config.max_outstanding_invites}
              minNoteLength={config.min_love_note_length ?? 40}
              maxNoteLength={config.max_love_note_length ?? 500}
              siteUrl={siteUrl}
            />

            <div className="flex flex-wrap gap-3 pt-2" style={{ borderTop: "1px solid var(--rule)" }}>
              <Link href="/dashboard" className="btn btn-ghost mt-6">
                Skip for now
              </Link>
              <Link href="/onboarding" className="btn btn-quiet mt-6">
                Edit my details
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
