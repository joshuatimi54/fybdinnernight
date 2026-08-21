import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/gate";
import type { DinnerTable } from "@/lib/types";
import SeatingBoard, { type BoardPair } from "@/components/admin/SeatingBoard";

export const metadata = { title: "Seating" };
export const dynamic = "force-dynamic";

type PairRow = {
  id: string;
  table_id: string | null;
  a: { first_name: string; last_name: string } | null;
  b: { first_name: string; last_name: string } | null;
};

export default async function AdminTablesPage() {
  const { config } = await requireAdmin();
  const supabase = await createClient();

  const [{ data: tablesData }, { data: pairsData }] = await Promise.all([
    supabase.from("tables").select("*").order("sort_order").order("label"),
    supabase
      .from("pairs")
      .select(
        `id, table_id,
         a:profiles!pairs_user_a_id_fkey(first_name, last_name),
         b:profiles!pairs_user_b_id_fkey(first_name, last_name)`,
      )
      .eq("status", "confirmed")
      .order("confirmed_at"),
  ]);

  const tables = (tablesData ?? []) as DinnerTable[];

  const pairs: BoardPair[] = ((pairsData ?? []) as unknown as PairRow[]).map((p) => ({
    id: p.id,
    table_id: p.table_id,
    name_a: `${p.a?.first_name ?? ""} ${p.a?.last_name ?? ""}`.trim() || "—",
    name_b: `${p.b?.first_name ?? ""} ${p.b?.last_name ?? ""}`.trim() || "—",
  }));

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-3">
        <p className="text-ink-soft max-w-[62ch] text-[15px]">
          A pair is one unit and is never split across tables. Guests{" "}
          {config.seat_selection_enabled
            ? "can currently choose their own table"
            : "cannot choose — you are seating everyone from here"}
          .
        </p>
        <div className="flex flex-wrap gap-2">
          <span className="pill pill-quiet">{tables.length} tables</span>
          <span className="pill pill-quiet">
            {tables.reduce((s, t) => s + (t.is_open ? t.capacity : 0), 0)} seats
          </span>
          <span className="pill pill-quiet">{pairs.length} pairs</span>
        </div>
      </div>

      <SeatingBoard tables={tables} pairs={pairs} />
    </div>
  );
}
