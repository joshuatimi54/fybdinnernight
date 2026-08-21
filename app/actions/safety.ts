"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/errors";
import type { ActionResult } from "./profile";

const REASONS = [
  "inappropriate_photo",
  "harassment",
  "fake_profile",
  "not_a_member",
  "other",
] as const;

export type ReportReason = (typeof REASONS)[number];

export const REPORT_LABELS: Record<ReportReason, string> = {
  inappropriate_photo: "Inappropriate photo",
  harassment: "Harassment or abusive language",
  fake_profile: "This doesn't look like a real person",
  not_a_member: "Not part of the fellowship",
  other: "Something else",
};

const reportSchema = z.object({
  reported: z.string().uuid(),
  reason: z.enum(REASONS),
  notes: z.string().trim().max(500).optional(),
});

export async function reportProfile(input: unknown): Promise<ActionResult> {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pick a reason first." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in first." };

  const { error } = await supabase.from("reports").insert({
    reporter_id: user.id,
    reported_id: parsed.data.reported,
    reason: parsed.data.reason,
    notes: parsed.data.notes || null,
  });

  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true };
}

/** Blocking is mutual and silent — neither person appears to the other again. */
export async function blockProfile(blockedId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(blockedId).success) {
    return { ok: false, error: "We couldn't find that profile." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in first." };

  const { error } = await supabase
    .from("blocks")
    .upsert(
      { blocker_id: user.id, blocked_id: blockedId },
      { onConflict: "blocker_id,blocked_id" },
    );

  if (error) return { ok: false, error: friendlyError(error) };

  revalidatePath("/discover");
  return { ok: true };
}
