import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { render } from "@/lib/email/templates";
import { eventBits, sendEmail } from "@/lib/email/send";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH = 40;
const MAX_ATTEMPTS = 4;

type Row = {
  id: number;
  to_email: string;
  to_name: string | null;
  template: string;
  payload: Record<string, unknown>;
  attempts: number;
};

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Drains the email outbox.
 *
 * Runs every few minutes. Each row is claimed before sending, so two
 * overlapping cron runs cannot send the same email twice — and dedupe_key
 * already made duplicates impossible at queue time.
 */
export async function GET(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: config, error: cfgErr } = await supabase
    .from("event_config")
    .select("event_name, event_starts_at, venue, hashtag")
    .maybeSingle();

  if (cfgErr || !config) {
    return NextResponse.json({ error: "no event config" }, { status: 500 });
  }

  const bits = eventBits(config);

  const { data: queued, error } = await supabase
    .from("email_outbox")
    .select("id, to_email, to_name, template, payload, attempts")
    .eq("status", "queued")
    .lte("send_after", new Date().toISOString())
    .order("id", { ascending: true })
    .limit(BATCH);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (queued ?? []) as Row[];
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    // Claim it first. A second cron run overlapping this one will not see it.
    const { data: claimed } = await supabase
      .from("email_outbox")
      .update({ attempts: row.attempts + 1 })
      .eq("id", row.id)
      .eq("status", "queued")
      .eq("attempts", row.attempts)
      .select("id")
      .maybeSingle();

    if (!claimed) continue;

    // Seeded fixtures use @example.test and must never leave the building.
    if (/@example\.(test|com)$/i.test(row.to_email)) {
      await supabase
        .from("email_outbox")
        .update({ status: "skipped", last_error: "test address" })
        .eq("id", row.id);
      skipped++;
      continue;
    }

    const rendered = render(
      row.template,
      row.payload ?? {},
      { name: row.to_name ?? "" },
      bits,
    );

    if (!rendered) {
      await supabase
        .from("email_outbox")
        .update({ status: "failed", last_error: `unknown template "${row.template}"` })
        .eq("id", row.id);
      failed++;
      continue;
    }

    const result = await sendEmail({
      to: row.to_email,
      subject: rendered.subject,
      html: rendered.html,
      replyTo: process.env.EMAIL_REPLY_TO,
    });

    if (result.ok) {
      await supabase
        .from("email_outbox")
        .update({ status: "sent", sent_at: new Date().toISOString(), last_error: null })
        .eq("id", row.id);
      sent++;
      continue;
    }

    const giveUp = !result.retryable || row.attempts + 1 >= MAX_ATTEMPTS;
    await supabase
      .from("email_outbox")
      .update({
        status: giveUp ? "failed" : "queued",
        last_error: result.error,
        // Back off a little before the next attempt.
        send_after: giveUp
          ? undefined
          : new Date(Date.now() + (row.attempts + 1) * 5 * 60_000).toISOString(),
      })
      .eq("id", row.id);

    failed++;
  }

  return NextResponse.json({
    considered: rows.length,
    sent,
    failed,
    skipped,
    at: new Date().toISOString(),
  });
}
