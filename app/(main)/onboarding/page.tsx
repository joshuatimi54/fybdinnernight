import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/gate";
import ProfileForm from "@/components/ProfileForm";

export const metadata = { title: "Your profile" };

export default async function OnboardingPage() {
  const { profile, config } = await requireProfile();

  // Already through review and looking — no reason to be on this page.
  if (profile.review_status === "pending") redirect("/pending");

  return (
    <main className="max-w-[720px] mx-auto px-5 sm:px-8 py-12 sm:py-16">
      <div className="flex flex-col gap-10 rise">
        <header className="flex flex-col gap-4">
          <span className="eyebrow">Step one of two</span>
          <h1 className="text-[clamp(2.4rem,8vw,3.6rem)] leading-[0.95]">
            Build your
            <br />
            <em style={{ color: "var(--gold)" }}>profile.</em>
          </h1>
          <p className="text-ink-soft max-w-[48ch]">
            This is what people see when they&apos;re deciding who to ask. Your
            surname, phone and email stay hidden until you&apos;re paired.
          </p>
        </header>

        {profile.review_status === "rejected" && profile.rejection_reason ? (
          <div
            className="p-5 border flex flex-col gap-2"
            style={{ borderColor: "var(--gold)", background: "var(--gold-wash)" }}
          >
            <span className="eyebrow">Needs a change</span>
            <p className="text-[15px]">{profile.rejection_reason}</p>
            <p className="text-[13px] text-ink-soft">
              Fix it below and send it back — there&apos;s no limit on tries.
            </p>
          </div>
        ) : null}

        {!config.registration_open ? (
          <div
            className="p-5 border"
            style={{ borderColor: "var(--rule-strong)", background: "var(--paper)" }}
          >
            <p className="text-[15px]">
              Registration is closed for this event. You can still edit your
              profile, but it can&apos;t be submitted.
            </p>
          </div>
        ) : null}

        <ProfileForm profile={profile} requirePhoto={config.require_photo} />
      </div>
    </main>
  );
}
