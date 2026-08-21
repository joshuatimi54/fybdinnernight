import Link from "next/link";
import { requireAdmin } from "@/lib/gate";
import { createClient } from "@/lib/supabase/server";
import { SEGMENTS } from "@/lib/segments";
import Composer from "@/components/admin/Composer";

export const metadata = { title: "Write to guests" };
export const dynamic = "force-dynamic";

export default async function ComposePage() {
  await requireAdmin();
  const supabase = await createClient();

  // One count per segment, from the same function the send uses — so the
  // number on the button is the number who actually receive it.
  const results = await Promise.all(
    SEGMENTS.map((s) =>
      supabase
        .rpc("admin_broadcast_count", { p_segment: s.id })
        .then(({ data }) => [s.id, (data as number) ?? 0] as const),
    ),
  );

  const counts = Object.fromEntries(results);

  const { data: recent } = await supabase
    .from("broadcasts")
    .select("id, subject, segment, recipient_count, test_only, created_at")
    .eq("test_only", false)
    .order("created_at", { ascending: false })
    .limit(8);

  return (
    <div className="flex flex-col gap-9 max-w-[760px]">
      <div className="flex flex-col gap-3">
        <p className="text-[15px] leading-[1.85]" style={{ color: "var(--ink-soft)" }}>
          Write to a group of guests — a venue change, a last call, a thank you.
          It goes out in the same stationery as every other email, opens with
          each person&apos;s first name, and skips anyone who has opted out.
        </p>
      </div>

      <Composer counts={counts} />

      {recent && recent.length > 0 ? (
        <section className="flex flex-col gap-4 pt-4" style={{ borderTop: "1px solid var(--rule)" }}>
          <span className="eyebrow">Already sent</span>
          <ul className="flex flex-col gap-px" style={{ background: "var(--rule)", border: "1px solid var(--rule)" }}>
            {recent.map((b) => (
              <li
                key={b.id}
                className="p-4 flex flex-wrap items-center justify-between gap-3"
                style={{ background: "var(--paper)" }}
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[14px]" style={{ color: "var(--olive)" }}>
                    {b.subject}
                  </span>
                  <span className="text-[11.5px]" style={{ color: "var(--ink-faint)" }}>
                    {b.segment.replace(/_/g, " ")} ·{" "}
                    {new Date(b.created_at).toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <span className="pill pill-quiet">
                  {b.recipient_count} sent
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Link href="/admin/emails" className="btn btn-quiet self-start">
        ← Back to the outbox
      </Link>
    </div>
  );
}
