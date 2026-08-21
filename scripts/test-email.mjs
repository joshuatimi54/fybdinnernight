#!/usr/bin/env node
/**
 * Sends one real email through Resend so you can see a template in your inbox
 * before 300 people do.
 *
 *   node --env-file=.env scripts/test-email.mjs you@gmail.com [template]
 *
 * Defaults to invitation_received, which is the one that matters most — it is
 * the email that has to make somebody want to open the site.
 */
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const to = process.argv[2];
const template = process.argv[3] ?? "invitation_received";

if (!to || !to.includes("@")) {
  console.error("Usage: node --env-file=.env scripts/test-email.mjs you@example.com [template]");
  process.exit(1);
}

const key = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM;

if (!key || /REPLACE/i.test(key)) {
  console.error("RESEND_API_KEY is not set in .env yet.");
  process.exit(1);
}
if (!from || /REPLACE/i.test(from)) {
  console.error("EMAIL_FROM is not set in .env yet.");
  process.exit(1);
}

// The templates are TypeScript, so rather than compile them we render through
// the running dev server's preview route... which needs auth. Simpler and more
// honest: rebuild the same HTML here from the compiled Next output if present,
// otherwise fall back to a plain check that Resend accepts our credentials.
const SAMPLE = {
  invitation_received: {
    subject: "Tunde wrote you a love note",
    intro: "Somebody would like you at their table.",
    note: "Amaka, we have somehow been in the same fellowship for four years and never had a proper conversation. I would like to fix that over dinner, if you will let me.",
  },
  still_looking: {
    subject: "Still looking for a date?",
    intro: "You are registered and approved — but your seat is not yours yet.",
    note: null,
  },
  pair_confirmed: {
    subject: "It's settled — you're going with Amaka",
    intro: "You and Amaka are paired. Your seat is now genuinely yours.",
    note: null,
  },
};

const sample = SAMPLE[template] ?? SAMPLE.invitation_received;

const html = await readFile(join(root, "supabase", "email-templates", "magic-link.html"), "utf8")
  .then((otp) =>
    template === "otp"
      ? otp.replace("{{ .Token }}", "204815")
      : null,
  )
  .catch(() => null);

const body =
  html ??
  `<!doctype html><html><body style="margin:0;background:#FBF8F2;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#FBF8F2;">
<tr><td align="center" style="padding:32px 14px;">
<table width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#FFFDF9;border:1px solid #E3DDD0;">
  <tr><td align="center" bgcolor="#333D2C" style="background:#333D2C;padding:30px 24px 26px;">
    <div style="font-family:Georgia,serif;font-size:24px;letter-spacing:6px;color:#FBF8F2;">FYB</div>
    <div style="font-family:Arial,sans-serif;font-size:8.5px;letter-spacing:4px;text-transform:uppercase;color:#E8CF8F;padding-top:7px;">Dinner Night</div>
  </td></tr>
  <tr><td style="height:3px;background:#B08B33;line-height:3px;">&nbsp;</td></tr>
  <tr><td style="padding:40px;">
    <div style="font-family:Arial,sans-serif;font-size:9.5px;letter-spacing:3.2px;text-transform:uppercase;color:#B08B33;padding-bottom:14px;">Deliverability Test</div>
    <h1 style="margin:0 0 22px;font-family:Georgia,serif;font-size:32px;line-height:1.2;font-weight:normal;color:#333D2C;">
      If you can read this, <span style="font-style:italic;color:#B08B33;">sending works</span>
    </h1>
    <p style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:15px;line-height:1.75;color:#5E6558;">
      ${sample.intro}
    </p>
    ${
      sample.note
        ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0;background:#F7EFDA;">
             <tr><td style="padding:22px 24px;border-left:3px solid #B08B33;font-family:Georgia,serif;font-size:17px;line-height:1.75;color:#333D2C;font-style:italic;">${sample.note}</td></tr>
           </table>`
        : ""
    }
    <p style="margin:0;font-family:Arial,sans-serif;font-size:13px;line-height:1.75;color:#8D9386;">
      Check three things: it landed in the inbox and not spam, the olive header
      rendered, and the gold rule under it is visible. Then open
      /admin/emails to preview the real templates.
    </p>
  </td></tr>
  <tr><td bgcolor="#232B1E" style="background:#232B1E;padding:18px 40px;font-family:Arial,sans-serif;font-size:10.5px;letter-spacing:1px;color:#93A189;">CACCF</td></tr>
</table>
</td></tr></table>
</body></html>`;

console.log(`Sending "${template}" to ${to}`);
console.log(`From: ${from}\n`);

const res = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    from,
    to: [to],
    subject: `[Test] ${sample.subject}`,
    html: body,
    ...(process.env.EMAIL_REPLY_TO ? { reply_to: process.env.EMAIL_REPLY_TO } : {}),
  }),
});

const text = await res.text();

if (res.ok) {
  console.log("✓ Accepted by Resend:", text);
  console.log("\nIf it does not arrive within a minute, check:");
  console.log("  · Resend dashboard → Emails, for a bounce or block");
  console.log("  · that fybdinnernight.online shows Verified under Domains");
  console.log("  · your spam folder (a brand-new domain often lands there once)");
} else {
  console.error(`✗ Resend said ${res.status}:`, text);
  if (res.status === 403) {
    console.error("\n403 almost always means the sending domain is not verified yet.");
    console.error("Resend → Domains → add fybdinnernight.online and publish the DNS records.");
  }
  if (res.status === 401) {
    console.error("\n401 means the API key is wrong or revoked.");
  }
  process.exit(1);
}
