import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribe";

export const dynamic = "force-dynamic";

async function optOut(token: string): Promise<{ ok: boolean; email?: string }> {
  const email = verifyUnsubscribeToken(token);
  if (!email) return { ok: false };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("profiles")
    .update({ email_opt_out: true })
    .eq("email", email);

  return { ok: !error, email };
}

/**
 * One-click unsubscribe, as Gmail and Apple Mail invoke it: a POST with no
 * body and no cookies. It must succeed without the person being signed in,
 * which is why the token is signed rather than looked up.
 */
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  const { ok } = await optOut(token);
  return ok
    ? new NextResponse(null, { status: 200 })
    : NextResponse.json({ error: "invalid token" }, { status: 400 });
}

/** The same link, opened by a human in a browser. */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  const { ok, email } = await optOut(token);

  const page = (title: string, body: string) => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · FYB Dinner Night</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#FBF8F2;
       font-family:Georgia,'Times New Roman',serif;color:#333D2C;padding:24px;}
  .card{max-width:460px;background:#FFFDF9;border:1px solid #E3DDD0;padding:44px 40px;text-align:center;}
  .eyebrow{font-family:Arial,sans-serif;font-size:9.5px;letter-spacing:3.2px;
           text-transform:uppercase;color:#B08B33;margin:0 0 16px;}
  h1{margin:0 0 18px;font-size:30px;font-weight:normal;line-height:1.2;}
  p{margin:0 0 14px;font-family:Arial,sans-serif;font-size:14.5px;line-height:1.8;color:#5E6558;}
  a{color:#B08B33;}
</style></head>
<body><div class="card">
  <p class="eyebrow">FYB Dinner Night</p>
  <h1>${title}</h1>
  ${body}
</div></body></html>`;

  if (!ok) {
    return new NextResponse(
      page(
        "That link didn't work",
        `<p>The unsubscribe link was invalid or has already been used.</p>
         <p>Email <a href="mailto:support@fybdinnernight.online">support@fybdinnernight.online</a>
            and we'll take you off the list by hand.</p>`,
      ),
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  return new NextResponse(
    page(
      "You're unsubscribed",
      `<p>We won't email <strong>${email}</strong> about the Dinner Night again.</p>
       <p>Your registration and your date are untouched — you can still sign in
          at any time to see your invitations and your pass.</p>
       <p><a href="/login">Sign in</a></p>`,
    ),
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
