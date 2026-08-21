import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/gate";
import CheckInScanner from "@/components/admin/CheckInScanner";

export const metadata = { title: "Door" };
export const dynamic = "force-dynamic";

export default async function CheckInPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [{ count: total }, { count: bothIn }, { count: partial }] = await Promise.all([
    supabase.from("passes").select("id", { count: "exact", head: true }),
    supabase
      .from("passes")
      .select("id", { count: "exact", head: true })
      .not("checked_in_a_at", "is", null)
      .not("checked_in_b_at", "is", null),
    supabase
      .from("passes")
      .select("id", { count: "exact", head: true })
      .not("checked_in_a_at", "is", null)
      .is("checked_in_b_at", null),
  ]);

  const arrived = (bothIn ?? 0) * 2 + (partial ?? 0);

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-px bg-rule border border-rule grid-cols-3">
        {[
          { v: arrived, l: "guests in" },
          { v: bothIn ?? 0, l: "pairs complete" },
          { v: (total ?? 0) - (bothIn ?? 0), l: "still to come" },
        ].map((s) => (
          <div key={s.l} className="bg-ivory p-5 flex flex-col gap-1">
            <span className="numeric text-3xl leading-none">{s.v}</span>
            <span className="text-[10.5px] uppercase tracking-[0.14em] text-ink-faint">
              {s.l}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <span className="eyebrow">At the door</span>
        <p className="text-ink-soft text-[15px] max-w-[54ch]">
          Scan the QR on the guest&apos;s pass, or type the code printed beneath
          it. Check a pair in together, or one at a time if they arrive apart.
        </p>
      </div>

      <CheckInScanner />
    </div>
  );
}
