import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/gate";
import type { Profile } from "@/lib/types";
import ReviewQueue from "@/components/admin/ReviewQueue";

export const metadata = { title: "Approvals" };
export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "pending", label: "Awaiting review" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Sent back" },
  { key: "draft", label: "Unfinished" },
] as const;

export default async function AdminProfilesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin();

  const sp = await searchParams;
  const status = FILTERS.some((f) => f.key === sp.status) ? sp.status! : "pending";

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("review_status", status)
    .order("created_at", { ascending: true })
    .limit(120);

  const profiles = (data ?? []) as Profile[];

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-3">
        <p className="text-ink-soft max-w-[58ch] text-[15px]">
          Every profile is checked by a person before anyone else sees it. Aim
          for a same-day turnaround — this queue is the bottleneck that stalls
          the whole event if it sits.
        </p>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={`/admin/profiles?status=${f.key}`}
              className={`pill ${status === f.key ? "pill-olive" : "pill-quiet"}`}
            >
              {f.label}
            </Link>
          ))}
        </div>
      </div>

      {status === "pending" ? (
        <ReviewQueue profiles={profiles} />
      ) : (
        <ul className="flex flex-col gap-px bg-rule border border-rule">
          {profiles.length === 0 ? (
            <li className="bg-ivory p-8 text-center text-ink-soft">
              Nothing here.
            </li>
          ) : (
            profiles.map((p) => (
              <li
                key={p.id}
                className="bg-ivory p-4 flex flex-wrap gap-3 items-center justify-between"
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[15px]">
                    {p.first_name} {p.last_name}
                  </span>
                  <span className="text-[12px] text-ink-faint numeric break-all">
                    {p.email} · {p.phone ?? "no phone"}
                  </span>
                  {p.rejection_reason ? (
                    <span className="text-[12px]" style={{ color: "var(--gold)" }}>
                      {p.rejection_reason}
                    </span>
                  ) : null}
                </div>
                <div className="flex gap-2 items-center">
                  {p.seeking_help ? (
                    <span className="pill pill-gold">Needs a date</span>
                  ) : null}
                  <span
                    className={`pill ${p.pairing_status === "paired" ? "pill-good" : "pill-quiet"}`}
                  >
                    {p.pairing_status}
                  </span>
                </div>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
