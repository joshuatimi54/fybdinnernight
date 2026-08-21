import { createHmac, timingSafeEqual } from "crypto";

/**
 * Signed unsubscribe tokens.
 *
 * Gmail's bulk-sender rules expect a one-click List-Unsubscribe on every
 * marketing-ish message, and a header pointing at a link that does not really
 * work is worse than none at all — so this is a genuine opt-out, written to
 * profiles.email_opt_out, which every queue already honours.
 *
 * The secret is namespaced so an unsubscribe token can never be replayed as a
 * dinner pass, and vice versa.
 */
function sign(email: string): string {
  const secret = process.env.PASS_SIGNING_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("PASS_SIGNING_SECRET must be set to sign unsubscribe links");
  }
  return createHmac("sha256", secret)
    .update(`unsub:${email.trim().toLowerCase()}`)
    .digest("hex")
    .slice(0, 20);
}

export function unsubscribeToken(email: string): string {
  const clean = email.trim().toLowerCase();
  return `${Buffer.from(clean).toString("base64url")}.${sign(clean)}`;
}

/** Returns the email address if the signature holds, otherwise null. */
export function verifyUnsubscribeToken(token: string): string | null {
  const [encoded, signature] = (token ?? "").trim().split(".");
  if (!encoded || !signature) return null;

  let email: string;
  try {
    email = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!email.includes("@")) return null;

  let expected: string;
  try {
    expected = sign(email);
  } catch {
    return null;
  }

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;

  return timingSafeEqual(a, b) ? email : null;
}

export function unsubscribeUrl(email: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/api/unsubscribe?t=${encodeURIComponent(unsubscribeToken(email))}`;
}
