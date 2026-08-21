"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/errors";

export type ActionResult = { ok: true } | { ok: false; error: string };

const profileSchema = z.object({
  first_name: z.string().trim().min(1, "Add your first name").max(40),
  last_name: z.string().trim().min(1, "Add your surname").max(40),
  gender: z.enum(["male", "female"]),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_]{2,19}$/, "Pick a username: 3-20 characters, starting with a letter."),
  phone: z.string().trim().min(7, "Add a reachable phone number").max(24),
  photo_url: z.string().trim().url().or(z.literal("")).nullable().optional(),
  bio: z.string().trim().max(140).optional().nullable(),
  department: z.string().trim().max(60).optional().nullable(),
  level: z.string().trim().max(20).optional().nullable(),
  prompts: z
    .array(
      z.object({
        q: z.string().trim().min(1).max(80),
        a: z.string().trim().min(1).max(160),
      }),
    )
    .max(3),
});

export async function saveProfile(input: unknown): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in first." };

  const v = parsed.data;
  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: v.first_name,
      last_name: v.last_name,
      gender: v.gender,
      username: v.username,
      phone: v.phone,
      photo_url: v.photo_url || null,
      bio: v.bio || null,
      department: v.department || null,
      level: v.level || null,
      // Blank answers are dropped rather than stored as empty prompts.
      prompts: v.prompts.filter((p) => p.a.trim().length > 0),
    })
    .eq("id", user.id);

  if (error) return { ok: false, error: friendlyError(error) };

  revalidatePath("/onboarding");
  return { ok: true };
}

export async function submitProfile(): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_profile_for_review");
  if (error) return { ok: false, error: friendlyError(error) };

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * The safety net, and deliberately private — this only ever appears in the
 * committee's matchmaker queue, never to another guest.
 */
export async function setSeekingHelp(seeking: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in first." };

  const { error } = await supabase
    .from("profiles")
    .update({ seeking_help: seeking })
    .eq("id", user.id);

  if (error) return { ok: false, error: friendlyError(error) };

  revalidatePath("/discover");
  return { ok: true };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
