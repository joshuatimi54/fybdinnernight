import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * The daily sweep. Queues rather than sends — /api/cron/email does the sending.
 *
 * Run it once a day, mid-morning. Both jobs dedupe internally (per invitation,
 * per person per day), so running it twice is harmless.
 */
export async function GET(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const [expiring, nudges] = await Promise.all([
    supabase.rpc("remind_expiring_invitations", { p_hours: 6 }),
    supabase.rpc("queue_dateless_nudges"),
  ]);

  const errors = [expiring.error?.message, nudges.error?.message].filter(Boolean);
  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join("; ") }, { status: 500 });
  }

  return NextResponse.json({
    expiring_reminders: expiring.data ?? 0,
    still_looking_nudges: nudges.data ?? 0,
    at: new Date().toISOString(),
  });
}
