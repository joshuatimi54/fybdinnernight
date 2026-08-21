import { formatEventDate } from "@/lib/utils";
import { unsubscribeUrl } from "./unsubscribe";
import type { EventBits } from "./layout";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * A readable plain-text version of the HTML.
 *
 * HTML-only mail is a long-standing spam signal, and some clients show this
 * instead of rendering. Crude on purpose: strip the chrome, keep the words and
 * the links, collapse the whitespace.
 */
function toPlainText(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    // Keep the destination of every button and link.
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    .replace(/<\/(p|div|tr|h1|h2|h3|li)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, "—")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

export type SendResult =
  | { ok: true; id: string }
  | { ok: false; error: string; retryable: boolean };

/**
 * Resend over plain fetch rather than the SDK — one dependency fewer, and the
 * whole API surface we need is a single POST.
 */
export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!key) return { ok: false, error: "RESEND_API_KEY is not set", retryable: false };
  if (!from) return { ok: false, error: "EMAIL_FROM is not set", retryable: false };

  // The footer's opt-out link is signed with the recipient's address, so it
  // can only be filled in here, once we know who this copy is going to.
  const unsub = unsubscribeUrl(input.to);
  const html = input.html.replaceAll("{{UNSUB}}", unsub);

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html,
        // Sent alongside the HTML, not instead of it.
        text: toPlainText(html),
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
        headers: {
          // Gmail and Yahoo expect one-click unsubscribe on bulk mail; without
          // it a well-authenticated domain still lands in spam. The URL is a
          // real opt-out, not a decorative header.
          "List-Unsubscribe": `<${unsub}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
    });

    const text = await res.text();

    if (!res.ok) {
      return {
        ok: false,
        error: `${res.status} ${text.slice(0, 300)}`,
        // 429 and 5xx are worth another go; a 422 bad address never will be.
        retryable: res.status === 429 || res.status >= 500,
      };
    }

    const json = JSON.parse(text) as { id?: string };
    return { ok: true, id: json.id ?? "sent" };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "network error",
      retryable: true,
    };
  }
}

/** The shared event details every template's footer prints. */
export function eventBits(config: {
  event_name: string;
  event_starts_at: string | null;
  venue: string | null;
  hashtag: string;
}): EventBits {
  return {
    eventName: config.event_name,
    when: formatEventDate(config.event_starts_at),
    venue: config.venue ?? "Venue to be announced",
    siteUrl: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
    hashtag: config.hashtag,
  };
}
