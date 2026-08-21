"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/errors";
import type { ActionResult } from "./profile";

// The real minimum is the committee's setting, enforced inside
// send_invitation(). This only catches the empty and the absurd before the
// round trip — it must never be stricter than the database.
const sendSchema = z.object({
  recipient: z.string().uuid(),
  note: z.string().trim().min(1, "Write them a love note first.").max(2000),
});

export async function sendInvitation(input: unknown): Promise<ActionResult> {
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your note." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("send_invitation", {
    p_recipient: parsed.data.recipient,
    p_note: parsed.data.note,
  });

  if (error) return { ok: false, error: friendlyError(error) };

  revalidatePath("/discover");
  revalidatePath("/invitations");
  return { ok: true };
}

export type RespondResult =
  | { ok: true; accepted: true; pairId: string }
  | { ok: true; accepted: false; reason: string }
  | { ok: false; error: string };

/**
 * Accepting is the single most dangerous moment in the product — see
 * respond_to_invitation() in 0002_functions.sql. Everything that makes it
 * safe happens inside one database transaction; this is only the messenger.
 */
export async function respondToInvitation(
  invitationId: string,
  accept: boolean,
): Promise<RespondResult> {
  if (!z.string().uuid().safeParse(invitationId).success) {
    return { ok: false, error: "We couldn't find that invitation." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("respond_to_invitation", {
    p_invitation: invitationId,
    p_accept: accept,
  });

  if (error) return { ok: false, error: friendlyError(error) };

  revalidatePath("/invitations");
  revalidatePath("/discover");
  revalidatePath("/pair", "layout");

  const result = data as { accepted: boolean; pair_id?: string; reason?: string };

  if (result?.accepted && result.pair_id) {
    return { ok: true, accepted: true, pairId: result.pair_id };
  }

  return { ok: true, accepted: false, reason: result?.reason ?? "DECLINED" };
}

export type FindResult =
  | { ok: true; result: unknown }
  | { ok: false; error: string };

/** Look someone up by the handle they gave you. */
export async function findByUsername(username: string): Promise<FindResult> {
  const clean = username.trim().replace(/^@/, "").toLowerCase();

  if (!/^[a-z][a-z0-9_]{2,19}$/.test(clean)) {
    return { ok: true, result: { status: "not_found" } };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("find_by_username", {
    p_username: clean,
  });

  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true, result: data };
}

export async function withdrawInvitation(invitationId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(invitationId).success) {
    return { ok: false, error: "We couldn't find that invitation." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_invitation", {
    p_invitation: invitationId,
  });

  if (error) return { ok: false, error: friendlyError(error) };

  revalidatePath("/invitations");
  revalidatePath("/discover");
  return { ok: true };
}
