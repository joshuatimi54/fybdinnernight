import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/gate";

export const metadata = { title: "Under review" };
export const dynamic = "force-dynamic";

export default async function PendingPage() {
  const { profile } = await requireProfile();

  if (profile.review_status === "approved") {
    redirect("/dashboard");
  }
  if (profile.review_status === "draft") redirect("/onboarding");

  const rejected = profile.review_status === "rejected";

  return (
    <main className="max-w-[560px] mx-auto px-5 sm:px-8 py-16 sm:py-24">
      <div className="flex flex-col gap-8 rise">
        <span className="eyebrow">{rejected ? "Needs a change" : "With the committee"}</span>

        <h1 className="text-[clamp(2.4rem,8vw,3.6rem)] leading-[0.95]">
          {rejected ? (
            <>
              Almost —
              <br />
              <em style={{ color: "var(--gold)" }}>one fix.</em>
            </>
          ) : (
            <>
              We&apos;re looking
              <br />
              <em style={{ color: "var(--gold)" }}>at your profile.</em>
            </>
          )}
        </h1>

        {rejected ? (
          <>
            <div
              className="p-5 border flex flex-col gap-2"
              style={{ borderColor: "var(--gold)", background: "var(--gold-wash)" }}
            >
              <span className="eyebrow">What to change</span>
              <p className="text-[15px]">
                {profile.rejection_reason ?? "The committee asked for a change."}
              </p>
            </div>
            <p className="text-ink-soft">
              Update it and send it back. There&apos;s no limit on how many
              times you can try.
            </p>
            <Link href="/onboarding" className="btn btn-primary self-start">
              Edit my profile
            </Link>
          </>
        ) : (
          <>
            <p className="text-ink-soft">
              Every profile is checked by a person before it goes live — it
              usually takes a few hours. We&apos;ll email you the moment
              you&apos;re approved, and then you can start looking.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/onboarding" className="btn btn-ghost">
                Edit my profile
              </Link>
              <Link href="/" className="btn btn-quiet">
                Back to the event
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
