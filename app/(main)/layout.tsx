import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppNav from "@/components/AppNav";
import type { Profile } from "@/lib/types";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const profile = data as Profile | null;

  // Only counts what is actually actionable: live invitations addressed to you.
  const { count } = await supabase
    .from("invitations")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", user.id)
    .eq("status", "pending");

  return (
    <div className="min-h-dvh flex flex-col">
      <AppNav
        profile={{
          firstName: profile?.first_name ?? "",
          isAdmin: profile?.is_admin ?? false,
          paired: profile?.pairing_status === "paired",
          approved: profile?.review_status === "approved",
          pendingInvites: count ?? 0,
        }}
      />
      <div className="flex-1">{children}</div>
    </div>
  );
}
