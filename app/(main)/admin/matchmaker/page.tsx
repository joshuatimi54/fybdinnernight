import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/gate";
import type { Profile } from "@/lib/types";
import Matchmaker from "@/components/admin/Matchmaker";

export const metadata = { title: "Matchmaker" };
export const dynamic = "force-dynamic";

export default async function MatchmakerPage() {
  const { config } = await requireAdmin();
  const supabase = await createClient();

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("review_status", "approved")
    .eq("pairing_status", "unpaired")
    .eq("is_blocked", false)
    // People who asked for help come first — that is the whole point of the
    // queue. After them, whoever has been waiting longest.
    .order("seeking_help", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(400);

  const all = (data ?? []) as Profile[];
  const men = all.filter((p) => p.gender === "male");
  const women = all.filter((p) => p.gender === "female");
  const asked = all.filter((p) => p.seeking_help);

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-3">
        <p className="text-ink-soft max-w-[62ch] text-[15px]">
          The safety net. Everyone here is approved and still without a date —
          the ones marked <span style={{ color: "var(--gold)" }}>Asked</span>{" "}
          have quietly requested help, and nobody else can see that they did.
        </p>

        <div className="flex flex-wrap gap-2">
          <span className="pill pill-gold">
            {asked.length} asked for help
          </span>
          <span className="pill pill-quiet">{men.length} gentlemen unpaired</span>
          <span className="pill pill-quiet">{women.length} ladies unpaired</span>
          {config.pairing_deadline ? (
            <span className="pill pill-olive">
              Deadline{" "}
              {new Date(config.pairing_deadline).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
              })}
            </span>
          ) : null}
        </div>

        {Math.abs(men.length - women.length) > 5 ? (
          <div
            className="p-4 border text-[14px]"
            style={{ borderColor: "var(--gold)", background: "var(--gold-wash)" }}
          >
            The columns are{" "}
            <strong>{Math.abs(men.length - women.length)} apart</strong>. Some
            people on the longer side cannot be paired no matter what you do —
            worth deciding early how you want to handle that, rather than at the
            deadline.
          </div>
        ) : null}
      </div>

      <Matchmaker men={men} women={women} />
    </div>
  );
}
