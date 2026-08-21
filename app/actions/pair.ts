"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/errors";
import { looksFlagged } from "@/lib/utils";
import type { ActionResult } from "./profile";

const messageSchema = z.object({
  pairId: z.string().uuid(),
  body: z.string().trim().min(1, "Write something first.").max(1000),
  shareConsent: z.boolean(),
  anonymise: z.boolean(),
});

/**
 * The only free-text channel between two people in the whole product.
 *
 * The recipient sees it immediately — moderation gates PUBLIC reuse only,
 * never delivery. Anything flagged goes straight to the committee queue
 * rather than being auto-hidden, because a human should make that call.
 */
export async function saveDateMessage(input: unknown): Promise<ActionResult> {
  const parsed = messageSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your message." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in first." };

  const { pairId, body, shareConsent, anonymise } = parsed.data;

  const { error } = await supabase.from("date_messages").upsert(
    {
      pair_id: pairId,
      author_id: user.id,
      body,
      share_consent: shareConsent,
      anonymise,
    },
    { onConflict: "pair_id,author_id" },
  );

  if (error) return { ok: false, error: friendlyError(error) };

  if (looksFlagged(body)) {
    // Recorded for the committee, not shown to the author. The message is
    // still delivered; only public reuse waits on a human.
    await supabase.from("reports").insert({
      reporter_id: user.id,
      reported_id: user.id,
      reason: "auto_flagged_message",
      notes: "Language filter matched a date message. Review before public use.",
    });
  }

  revalidatePath("/pair");
  return { ok: true };
}

export async function claimTable(tableId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(tableId).success) {
    return { ok: false, error: "That table isn't available." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("claim_table", { p_table: tableId });

  if (error) return { ok: false, error: friendlyError(error) };

  revalidatePath("/seating");
  revalidatePath("/pass");
  revalidatePath("/pair");
  return { ok: true };
}
