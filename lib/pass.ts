import { createHmac, timingSafeEqual } from "crypto";

/**
 * The QR carries `CODE.SIGNATURE` rather than a bare code.
 *
 * The signing secret lives in the environment, never in the database, so a
 * leaked table dump still cannot be used to mint passes — and the secret can
 * be rotated without touching a single row.
 */
function sign(code: string): string {
  const secret = process.env.PASS_SIGNING_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("PASS_SIGNING_SECRET must be set to at least 32 characters");
  }
  return createHmac("sha256", secret).update(code.toUpperCase()).digest("hex").slice(0, 16);
}

export function passToken(code: string): string {
  return `${code.toUpperCase()}.${sign(code)}`;
}

/** Returns the code if the signature holds, otherwise null. */
export function verifyPassToken(token: string): string | null {
  const [code, signature] = (token ?? "").trim().split(".");
  if (!code || !signature) return null;

  let expected: string;
  try {
    expected = sign(code);
  } catch {
    return null;
  }

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;

  return timingSafeEqual(a, b) ? code.toUpperCase() : null;
}
