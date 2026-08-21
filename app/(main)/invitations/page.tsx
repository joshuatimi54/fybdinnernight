import { requireApproved } from "@/lib/gate";
import { createClient } from "@/lib/supabase/server";
import InvitationList, { type FeedItem } from "@/components/InvitationList";

export const metadata = { title: "Invitations" };
export const dynamic = "force-dynamic";

export default async function InvitationsPage() {
  await requireApproved();

  const supabase = await createClient();
  const { data } = await supabase.rpc("get_my_invitations");
  const items = (data ?? []) as FeedItem[];

  return (
    <main className="max-w-[720px] mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="flex flex-col gap-9">
        <header className="flex flex-col gap-3">
          <span className="eyebrow">Your invitations</span>
          <h1 className="text-[clamp(2.2rem,7vw,3.4rem)] leading-[0.95]">
            Asked, and
            <br />
            <em style={{ color: "var(--gold)" }}>answered.</em>
          </h1>
        </header>

        <InvitationList items={items} />
      </div>
    </main>
  );
}
