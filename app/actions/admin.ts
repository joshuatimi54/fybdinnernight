"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/errors";
import type { ActionResult } from "./profile";

function bump() {
  revalidatePath("/admin", "layout");
}

export async function reviewProfile(
  profileId: string,
  approve: boolean,
  reason?: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_review_profile", {
    p_profile: profileId,
    p_approve: approve,
    p_reason: reason ?? null,
  });

  if (error) return { ok: false, error: friendlyError(error) };
  bump();
  return { ok: true };
}

/**
 * The safety net made concrete. Framed on both sides as a committee
 * suggestion so neither person is the one who had to ask, and neither is the
 * one nobody asked.
 */
export async function proposeMatch(
  a: string,
  b: string,
  note?: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_propose_match", {
    p_a: a,
    p_b: b,
    p_note: note ?? null,
  });

  if (error) return { ok: false, error: friendlyError(error) };
  bump();
  return { ok: true };
}

export async function assignTable(
  pairId: string,
  tableId: string | null,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_assign_table", {
    p_pair: pairId,
    p_table: tableId,
  });

  if (error) return { ok: false, error: friendlyError(error) };
  bump();
  return { ok: true };
}

export async function autofillTables(): Promise<
  { ok: true; placed: number } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_autofill_tables");

  if (error) return { ok: false, error: friendlyError(error) };
  bump();
  return { ok: true, placed: (data as number) ?? 0 };
}

export async function dissolvePair(
  pairId: string,
  reason: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_dissolve_pair", {
    p_pair: pairId,
    p_reason: reason,
  });

  if (error) return { ok: false, error: friendlyError(error) };
  bump();
  return { ok: true };
}

export async function checkIn(
  code: string,
  side: "a" | "b" | "both",
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_check_in", {
    p_code: code,
    p_side: side,
  });

  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/admin/checkin");
  return { ok: true };
}

export async function moderateMessage(
  messageId: string,
  status: "approved" | "hidden" | "pending",
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("date_messages")
    .update({ moderation_status: status })
    .eq("id", messageId);

  if (error) return { ok: false, error: friendlyError(error) };
  bump();
  return { ok: true };
}

export async function resolveReport(
  reportId: string,
  status: "reviewed" | "actioned" | "dismissed",
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("reports")
    .update({ status })
    .eq("id", reportId);

  if (error) return { ok: false, error: friendlyError(error) };
  bump();
  return { ok: true };
}

export async function setProfileBlocked(
  profileId: string,
  blocked: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ is_blocked: blocked })
    .eq("id", profileId);

  if (error) return { ok: false, error: friendlyError(error) };
  bump();
  return { ok: true };
}

const tableSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(1).max(40),
  // Pairs are never split, so a table always seats an even number.
  capacity: z.number().int().min(2).max(20).refine((n) => n % 2 === 0, {
    message: "Capacity must be an even number — pairs are never split.",
  }),
  zone: z.string().trim().max(40).optional().nullable(),
  is_open: z.boolean(),
  sort_order: z.number().int().min(0).max(999),
});

export async function saveTable(input: unknown): Promise<ActionResult> {
  const parsed = tableSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the table details." };
  }

  const supabase = await createClient();
  const v = parsed.data;

  const { error } = v.id
    ? await supabase
        .from("tables")
        .update({
          label: v.label,
          capacity: v.capacity,
          zone: v.zone || null,
          is_open: v.is_open,
          sort_order: v.sort_order,
        })
        .eq("id", v.id)
    : await supabase.from("tables").insert({
        label: v.label,
        capacity: v.capacity,
        zone: v.zone || null,
        is_open: v.is_open,
        sort_order: v.sort_order,
      });

  if (error) return { ok: false, error: friendlyError(error) };
  bump();
  return { ok: true };
}

export async function deleteTable(tableId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { count } = await supabase
    .from("pairs")
    .select("id", { count: "exact", head: true })
    .eq("table_id", tableId)
    .eq("status", "confirmed");

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `That table still seats ${count} pair${count === 1 ? "" : "s"}. Move them first.`,
    };
  }

  const { error } = await supabase.from("tables").delete().eq("id", tableId);
  if (error) return { ok: false, error: friendlyError(error) };

  bump();
  return { ok: true };
}

const configSchema = z.object({
  event_name: z.string().trim().min(1).max(80),
  event_starts_at: z.string().nullable(),
  venue: z.string().trim().max(160).nullable(),
  dress_code: z.string().trim().max(160).nullable(),
  registration_open: z.boolean(),
  discovery_open: z.boolean(),
  seat_selection_enabled: z.boolean(),
  require_photo: z.boolean(),
  max_lifetime_invites: z.number().int().min(1).max(50),
  max_outstanding_invites: z.number().int().min(1).max(10),
  invite_expiry_hours: z.number().int().min(1).max(336),
  min_love_note_length: z.number().int().min(0).max(400),
  max_love_note_length: z.number().int().min(50).max(2000),
  show_guest_wall: z.boolean(),
  pairing_deadline: z.string().nullable(),
  total_seats: z.number().int().min(2).max(5000),
  hashtag: z.string().trim().max(40),
  social_handle: z.string().trim().max(40),
});

export async function updateConfig(input: unknown): Promise<ActionResult> {
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the settings." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("event_config")
    .update(parsed.data)
    .eq("id", true);

  if (error) return { ok: false, error: friendlyError(error) };

  revalidatePath("/", "layout");
  return { ok: true };
}
