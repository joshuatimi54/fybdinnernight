import Link from "next/link";
import { requireAdmin } from "@/lib/gate";
import { createClient } from "@/lib/supabase/server";
import { TEMPLATE_NAMES } from "@/lib/email/templates";

export const metadata = { title: "Emails" };
export const dynamic = "force-dynamic";

type OutboxRow = {
  id: number;
  to_email: string;
  template: string;
  status: string;
  attempts: number;
  last_error: string | null;
  sent_at: string | null;
  created_at: string;
};

const TONE: Record<string, string> = {
  sent: "pill-good",
  queued: "pill-gold",
  failed: "pill-danger",
  skipped: "pill-quiet",
};

export default async function AdminEmailsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: rows }, ...counts] = await Promise.all([
    supabase
      .from("email_outbox")
      .select("id, to_email, template, status, attempts, last_error, sent_at, created_at")
      .order("id", { ascending: false })
      .limit(60),
    ...["queued", "sent", "failed", "skipped"].map((s) =>
      supabase
        .from("email_outbox")
        .select("id", { count: "exact", head: true })
        .eq("status", s),
    ),
  ]);

  const outbox = (rows ?? []) as OutboxRow[];
  const [queued, sent, failed, skipped] = counts.map((c) => c.count ?? 0);

  return (
    <div className="flex flex-col gap-9">
      <div className="flex flex-col gap-3">
        <p className="text-[15px] max-w-[62ch]" style={{ color: "var(--ink-soft)" }}>
          Every email is queued by the transaction that causes it, then sent by
          the cron job a few minutes later. Nothing is sent twice — each one
          carries a dedupe key.
        </p>
      </div>

      <div className="grid gap-px grid-cols-2 sm:grid-cols-4" style={{ background: "var(--rule)", border: "1px solid var(--rule)" }}>
        {[
          { v: queued, l: "Queued" },
          { v: sent, l: "Sent" },
          { v: failed, l: "Failed", urgent: failed > 0 },
          { v: skipped, l: "Skipped" },
        ].map((s) => (
          <div key={s.l} className="p-5 flex flex-col gap-1.5" style={{ background: "var(--paper)" }}>
            <span
              className="font-display text-3xl leading-none"
              style={{ color: s.urgent ? "var(--danger)" : "var(--olive)" }}
            >
              {s.v}
            </span>
            <span className="text-[9.5px] tracking-[0.2em] uppercase" style={{ color: "var(--ink-faint)" }}>
              {s.l}
            </span>
          </div>
        ))}
      </div>

      {/* ------------------------------------------------------- previews */}
      <section className="flex flex-col gap-4">
        <span className="eyebrow">Preview the designs</span>
        <div className="flex flex-wrap gap-2">
          {TEMPLATE_NAMES.map((t) => (
            <a
              key={t}
              href={`/admin/emails/preview?template=${t}`}
              target="_blank"
              rel="noreferrer"
              className="pill pill-quiet hover:opacity-70"
            >
              {t.replace(/_/g, " ")}
            </a>
          ))}
        </div>
        <p className="text-[13px]" style={{ color: "var(--ink-faint)" }}>
          The sign-in code email is sent by Supabase, not from here — its design
          lives in{" "}
          <code style={{ fontFamily: "var(--f-mono)", fontSize: "12px" }}>
            supabase/email-templates/magic-link.html
          </code>
          , to be pasted into Authentication → Email Templates → Magic Link.
        </p>
      </section>

      {/* --------------------------------------------------------- outbox */}
      <section className="flex flex-col gap-4">
        <span className="eyebrow">Recent</span>

        {outbox.length === 0 ? (
          <p className="text-[15px]" style={{ color: "var(--ink-soft)" }}>
            Nothing queued yet. Emails appear here the moment somebody is
            invited, approved or paired.
          </p>
        ) : (
          <div className="scroll-x" style={{ border: "1px solid var(--rule)" }}>
            <table className="w-full min-w-[680px] text-[13.5px]" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--ivory-warm)" }}>
                  {["To", "Template", "Status", "Tries", "When"].map((h) => (
                    <th
                      key={h}
                      className="text-left p-3 text-[9.5px] tracking-[0.2em] uppercase font-medium"
                      style={{ color: "var(--ink-faint)", borderBottom: "1px solid var(--rule)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {outbox.map((r) => (
                  <tr key={r.id}>
                    <td className="p-3 break-all" style={{ borderBottom: "1px solid var(--rule)" }}>
                      {r.to_email}
                      {r.last_error ? (
                        <div className="text-[11.5px] pt-1" style={{ color: "var(--danger)" }}>
                          {r.last_error.slice(0, 90)}
                        </div>
                      ) : null}
                    </td>
                    <td className="p-3" style={{ borderBottom: "1px solid var(--rule)" }}>
                      {r.template.replace(/_/g, " ")}
                    </td>
                    <td className="p-3" style={{ borderBottom: "1px solid var(--rule)" }}>
                      <span className={`pill ${TONE[r.status] ?? "pill-quiet"}`}>{r.status}</span>
                    </td>
                    <td className="p-3 numeric" style={{ borderBottom: "1px solid var(--rule)" }}>
                      {r.attempts}
                    </td>
                    <td className="p-3 numeric text-[12px]" style={{ borderBottom: "1px solid var(--rule)", color: "var(--ink-faint)" }}>
                      {new Date(r.sent_at ?? r.created_at).toLocaleString("en-GB", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Link href="/admin" className="btn btn-quiet self-start">
        ← Back to overview
      </Link>
    </div>
  );
}
