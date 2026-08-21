import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { destinationFor } from "@/lib/gate";
import type { Profile } from "@/lib/types";

/**
 * The one place that decides where a person belongs after signing in, so the
 * journey's state machine is never duplicated across pages.
 */
export default async function ContinuePage() {
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

  redirect(destinationFor((data as Profile) ?? null));
}
