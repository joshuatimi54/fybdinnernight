import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Where password-reset links land.
 *
 * Supabase sends a one-time `code` that has to be exchanged for a session
 * server-side. Only relative `next` paths are honoured, so a tampered link
 * cannot bounce somebody off to another site carrying their session.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const rawNext = url.searchParams.get("next") ?? "/continue";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/continue";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", url.origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/login?error=expired_link", url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
