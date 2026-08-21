"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/errors";
import { SEGMENT_IDS } from "@/lib/segments";


const schema = z.object({
  subject: z.string().trim().min(3, "Give it a subject.").max(120),
  body: z.string().trim().min(10, "Write a little more.").max(5000),
  segment: z.enum(SEGMENT_IDS),
  ctaLabel: z.string().trim().max(40).optional(),
  ctaPath: z.string().trim().max(120).optional(),
  testOnly: z.boolean(),
});

export type BroadcastResult =
  | { ok: true; recipients: number; test: boolean }
  | { ok: false; error: string };

export async function sendBroadcast(input: unknown): Promise<BroadcastResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the message." };
  }

  const v = parsed.data;

  if (v.ctaLabel && !v.ctaPath) {
    return { ok: false, error: "A button needs a link as well as a label." };
  }
  if (v.ctaPath && !v.ctaPath.startsWith("/")) {
    return { ok: false, error: "The button link must stay on this site — start it with /" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_broadcast", {
    p_subject: v.subject,
    p_body: v.body,
    p_segment: v.segment,
    p_cta_label: v.ctaLabel || null,
    p_cta_path: v.ctaPath || null,
    p_test_only: v.testOnly,
  });

  if (error) return { ok: false, error: friendlyError(error) };

  const res = data as { recipients: number; test: boolean };
  revalidatePath("/admin/emails");

  return { ok: true, recipients: res?.recipients ?? 0, test: Boolean(res?.test) };
}
