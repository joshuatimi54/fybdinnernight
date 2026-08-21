import { requireApproved } from "@/lib/gate";
import { createClient } from "@/lib/supabase/server";
import { avatarUrl, formatShortDate } from "@/lib/utils";
import type { Pair, Profile } from "@/lib/types";
import GraphicStudio from "@/components/GraphicStudio";

export const metadata = { title: "Share" };
export const dynamic = "force-dynamic";

export default async function SharePage() {
  const { profile, config } = await requireApproved();
  const supabase = await createClient();

  let partner: Profile | null = null;

  if (profile.active_pair_id) {
    const { data: pairData } = await supabase
      .from("pairs")
      .select("*")
      .eq("id", profile.active_pair_id)
      .maybeSingle();

    const pair = pairData as Pair | null;
    if (pair) {
      const partnerId =
        pair.user_a_id === profile.id ? pair.user_b_id : pair.user_a_id;
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", partnerId)
        .maybeSingle();
      partner = data as Profile | null;
    }
  }

  return (
    <main className="max-w-[1000px] mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="flex flex-col gap-9">
        <header className="flex flex-col gap-3">
          <span className="eyebrow">Tell everyone</span>
          <h1 className="text-[clamp(2.2rem,7vw,3.4rem)] leading-[0.95]">
            Make it
            <br />
            <em style={{ color: "var(--gold)" }}>public.</em>
          </h1>
          <p className="text-ink-soft max-w-[50ch]">
            Built right here in your browser — your photo never leaves your
            phone to make this. Post it, tag us, and we&apos;ll repost the good
            ones.
          </p>
        </header>

        <GraphicStudio
          input={{
            firstName: profile.first_name,
            photo: avatarUrl(profile.photo_url, 640),
            partnerName: partner?.first_name ?? null,
            partnerPhoto: avatarUrl(partner?.photo_url ?? null, 640),
            eventName: config.event_name,
            hashtag: config.hashtag,
            handle: config.social_handle,
            when: formatShortDate(config.event_starts_at),
          }}
        />
      </div>
    </main>
  );
}
