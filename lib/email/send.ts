import { formatEventDate } from "@/lib/utils";
import type { EventBits } from "./layout";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

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
        html: input.html,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
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
