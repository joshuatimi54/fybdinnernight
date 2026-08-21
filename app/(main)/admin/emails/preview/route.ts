import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { render } from "@/lib/email/templates";
import { eventBits } from "@/lib/email/send";

export const dynamic = "force-dynamic";

/** Believable stand-in data, so previews read like real mail. */
const SAMPLES: Record<string, Record<string, unknown>> = {
  invitation_received: {
    from_name: "Tunde",
    note: "Amaka, we have somehow been in the same fellowship for four years and never had a proper conversation. I would like to fix that over dinner, if you will let me. I promise to be excellent company and to let you pick the dessert.",
    expires_hours: 24,
  },
  invitation_expiring: { from_name: "Tunde" },
  no_longer_available: { other_name: "Amaka" },
  invitation_expired: { other_name: "Amaka" },
  pair_confirmed: { partner_name: "Amaka", code: "A1B2C3D4", how: "accepted" },
  matchmaker_match: {
    other_name: "Chidi",
    note: "The FYB committee thinks you two would make a great table.",
    to_answer: true,
  },
  pair_dissolved: { reason: "Your date has had to withdraw from the event." },
  table_assigned: { table_label: "Table 7" },
  profile_rejected: { reason: "We can't see your face clearly — please use a different photo." },
  still_looking: { days_left: 3, others_looking: 42, seeking_help: false },
  event_reminder: { table_label: "Table 7" },
  profile_approved: {},
  broadcast: {
    subject: "The venue has moved",
    body: "We've had to move the dinner to the main auditorium — the original room turned out to be too small for the number of pairs we now have.\n\nEverything else is exactly as it was: same date, same time, same table numbers. Your pass already shows the new venue.\n\nSee you there.",
    cta_label: "Open my pass",
    cta_path: "/pass",
    is_test: false,
  },
};

export async function GET(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles")
    .select("is_admin, first_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!me?.is_admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const template = params.get("template") ?? "invitation_received";

  const { data: config } = await supabase
    .from("event_config")
    .select("event_name, event_starts_at, venue, hashtag")
    .maybeSingle();

  if (!config) return NextResponse.json({ error: "no event config" }, { status: 500 });

  const rendered = render(
    template,
    SAMPLES[template] ?? {},
    { name: me.first_name || "Amaka" },
    eventBits(config),
  );

  if (!rendered) {
    return NextResponse.json({ error: `unknown template "${template}"` }, { status: 404 });
  }

  return new NextResponse(
    `<div style="font-family:system-ui;background:#333D2C;color:#E8CF8F;padding:10px 16px;font-size:12px;letter-spacing:1px;">
       SUBJECT — ${rendered.subject}
     </div>${rendered.html}`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
