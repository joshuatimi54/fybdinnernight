import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/gate";
import ModerationPanel, {
  type MessageRow,
  type ReportRow,
} from "@/components/admin/ModerationPanel";

export const metadata = { title: "Moderation" };
export const dynamic = "force-dynamic";

export default async function ModerationPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: reportsData }, { data: messagesData }] = await Promise.all([
    supabase
      .from("reports")
      .select(
        `id, reason, notes, created_at,
         reporter:profiles!reports_reporter_id_fkey(first_name, last_name),
         reported:profiles!reports_reported_id_fkey(id, first_name, last_name, is_blocked)`,
      )
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(100),
    // Only messages whose author actually consented ever reach this queue.
    supabase
      .from("date_messages")
      .select(
        `id, body, anonymise, moderation_status, created_at,
         author:profiles!date_messages_author_id_fkey(first_name, last_name)`,
      )
      .eq("share_consent", true)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  return (
    <ModerationPanel
      reports={(reportsData ?? []) as unknown as ReportRow[]}
      messages={(messagesData ?? []) as unknown as MessageRow[]}
    />
  );
}
