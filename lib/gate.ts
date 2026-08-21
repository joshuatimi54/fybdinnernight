import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { EventConfig, Profile } from "@/lib/types";

/**
 * Where a person belongs right now.
 *
 * The journey is a state machine — draft → pending → approved → paired — and
 * every page asks this rather than deciding for itself, so a half-finished
 * profile can never wander into discovery.
 */
export function destinationFor(profile: Profile | null): string {
  if (!profile) return "/onboarding";

  switch (profile.review_status) {
    case "draft":
      return "/onboarding";
    case "pending":
    case "rejected":
      return "/pending";
    case "approved":
      // Everyone lands on the dashboard rather than straight into discovery:
      // it shows your profile, your date if you have one, and the single next
      // thing to do — so nobody has to work out where they are.
      return "/dashboard";
  }
}

export async function getSessionUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Signed-in user plus their profile and the event config, or a redirect. */
export async function requireProfile(): Promise<{
  profile: Profile;
  config: EventConfig;
  userId: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: profile }, { data: config }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("event_config").select("*").maybeSingle(),
  ]);

  if (!profile) redirect("/onboarding");

  return {
    profile: profile as Profile,
    config: config as EventConfig,
    userId: user.id,
  };
}

/** As above, but bounces anyone who isn't through review yet. */
export async function requireApproved() {
  const ctx = await requireProfile();
  if (ctx.profile.review_status !== "approved") {
    redirect(destinationFor(ctx.profile));
  }
  return ctx;
}

export async function requireAdmin() {
  const ctx = await requireProfile();
  if (!ctx.profile.is_admin) redirect("/");
  return ctx;
}
