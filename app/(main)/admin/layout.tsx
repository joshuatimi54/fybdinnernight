import Link from "next/link";
import { requireAdmin } from "@/lib/gate";
import { createClient } from "@/lib/supabase/server";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/profiles", label: "Approvals" },
  { href: "/admin/matchmaker", label: "Matchmaker" },
  { href: "/admin/tables", label: "Seating" },
  { href: "/admin/moderation", label: "Moderation" },
  { href: "/admin/checkin", label: "Door" },
  { href: "/admin/settings", label: "Settings" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  const supabase = await createClient();
  const [{ count: pendingProfiles }, { count: openReports }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("review_status", "pending"),
    supabase
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
  ]);

  const badges: Record<string, number> = {
    "/admin/profiles": pendingProfiles ?? 0,
    "/admin/moderation": openReports ?? 0,
  };

  return (
    <div className="max-w-[1180px] mx-auto px-5 sm:px-8 py-8 sm:py-12">
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-4">
          <span className="eyebrow">Committee</span>
          <h1 className="text-[clamp(1.9rem,5vw,2.6rem)]">Dinner Night control</h1>
        </header>

        <nav
          className="scroll-x border-b border-rule -mb-px"
          aria-label="Admin sections"
        >
          <ul className="flex gap-1 min-w-max">
            {TABS.map((t) => (
              <li key={t.href}>
                <Link
                  href={t.href}
                  className="flex items-center gap-2 px-4 py-3 text-[13px] font-semibold text-ink-soft hover:text-ink whitespace-nowrap"
                >
                  {t.label}
                  {badges[t.href] ? (
                    <span
                      className="numeric text-[10px] px-1.5 py-0.5 leading-none rounded-[2px]"
                      style={{ background: "var(--olive)", color: "#FBF8F2" }}
                    >
                      {badges[t.href]}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {children}
      </div>
    </div>
  );
}
