import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyPassToken } from "@/lib/pass";

/**
 * Door lookup. Accepts either the signed token from the QR or the bare code
 * typed in by hand — both resolve to the same pass, and the caller must be an
 * admin either way, so a guessed code gets nobody anywhere.
 */
export async function GET(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!me?.is_admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const raw = new URL(request.url).searchParams.get("token") ?? "";
  const code = raw.includes(".") ? verifyPassToken(raw) : raw.trim().toUpperCase();

  if (!code || !/^[A-Z0-9]{4,16}$/.test(code)) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const { data: pass } = await supabase
    .from("passes")
    .select("code, pair_id, checked_in_a_at, checked_in_b_at")
    .eq("code", code)
    .maybeSingle();

  if (!pass) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: pair } = await supabase
    .from("pairs")
    .select(
      `id, status,
       table:tables(label),
       a:profiles!pairs_user_a_id_fkey(first_name, last_name),
       b:profiles!pairs_user_b_id_fkey(first_name, last_name)`,
    )
    .eq("id", pass.pair_id)
    .maybeSingle();

  if (!pair || pair.status !== "confirmed") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const row = pair as unknown as {
    table: { label: string } | null;
    a: { first_name: string; last_name: string } | null;
    b: { first_name: string; last_name: string } | null;
  };

  return NextResponse.json({
    code: pass.code,
    nameA: `${row.a?.first_name ?? ""} ${row.a?.last_name ?? ""}`.trim(),
    nameB: `${row.b?.first_name ?? ""} ${row.b?.last_name ?? ""}`.trim(),
    table: row.table?.label ?? null,
    aIn: Boolean(pass.checked_in_a_at),
    bIn: Boolean(pass.checked_in_b_at),
  });
}
