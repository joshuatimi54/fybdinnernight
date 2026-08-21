"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  moderateMessage,
  resolveReport,
  setProfileBlocked,
} from "@/app/actions/admin";
import { REPORT_LABELS, type ReportReason } from "@/app/actions/safety";

export type ReportRow = {
  id: string;
  reason: string;
  notes: string | null;
  created_at: string;
  reporter: { first_name: string; last_name: string } | null;
  reported: { id: string; first_name: string; last_name: string; is_blocked: boolean } | null;
};

export type MessageRow = {
  id: string;
  body: string;
  anonymise: boolean;
  moderation_status: "pending" | "approved" | "hidden";
  created_at: string;
  author: { first_name: string; last_name: string } | null;
};

export default function ModerationPanel({
  reports,
  messages,
}: {
  reports: ReportRow[];
  messages: MessageRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function act(fn: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? "That didn't work.");
        return;
      }
      toast.success(done);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-12">
      {/* -------------------------------------------------------- reports */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="eyebrow">Reports</span>
          <h3 className="text-2xl">
            {reports.length === 0 ? "Nothing open" : `${reports.length} to look at`}
          </h3>
        </div>

        {reports.length === 0 ? (
          <p className="text-ink-soft text-[15px]">
            Nobody has reported anyone. Reports arrive here the moment they&apos;re made.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {reports.map((r) => (
              <li key={r.id} className="card p-5 flex flex-col gap-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-[15px]">
                      {r.reported?.first_name} {r.reported?.last_name}
                    </span>
                    <span className="text-[12px] text-ink-faint">
                      {r.reason === "auto_flagged_message"
                        ? "Language filter — date message"
                        : (REPORT_LABELS[r.reason as ReportReason] ?? r.reason)}
                      {r.reporter
                        ? ` · reported by ${r.reporter.first_name} ${r.reporter.last_name}`
                        : ""}
                    </span>
                  </div>
                  {r.reported?.is_blocked ? (
                    <span className="pill pill-danger">Blocked</span>
                  ) : null}
                </div>

                {r.notes ? (
                  <blockquote className="text-[14px] text-ink-soft pl-4 border-l-2 border-rule">
                    {r.notes}
                  </blockquote>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost text-[13px]"
                    disabled={pending}
                    onClick={() => act(() => resolveReport(r.id, "dismissed"), "Dismissed.")}
                  >
                    No action needed
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost text-[13px]"
                    disabled={pending}
                    onClick={() => act(() => resolveReport(r.id, "reviewed"), "Marked reviewed.")}
                  >
                    Reviewed, watching
                  </button>
                  {r.reported && !r.reported.is_blocked ? (
                    <button
                      type="button"
                      className="btn btn-danger text-[13px]"
                      disabled={pending}
                      onClick={() =>
                        act(async () => {
                          const a = await setProfileBlocked(r.reported!.id, true);
                          if (!a.ok) return a;
                          return resolveReport(r.id, "actioned");
                        }, "Blocked and closed.")
                      }
                    >
                      Block this person
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ------------------------------------------------------- messages */}
      <section className="flex flex-col gap-4 border-t border-rule pt-10">
        <div className="flex flex-col gap-2">
          <span className="eyebrow">Cleared for sharing</span>
          <h3 className="text-2xl">Date messages</h3>
          <p className="text-[14px] text-ink-soft max-w-[58ch]">
            Everyone here ticked the box saying you may share their message
            publicly. Approving one puts it on the landing page — it has already
            reached the person it was written for either way.
          </p>
        </div>

        {messages.length === 0 ? (
          <p className="text-ink-soft text-[15px]">
            Nobody has given permission yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {messages.map((m) => (
              <li key={m.id} className="card p-5 flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[14px]">
                    {m.anonymise
                      ? "Anonymous (name hidden by request)"
                      : `${m.author?.first_name ?? ""} ${m.author?.last_name ?? ""}`}
                  </span>
                  <span
                    className={`pill ${
                      m.moderation_status === "approved"
                        ? "pill-good"
                        : m.moderation_status === "hidden"
                          ? "pill-quiet"
                          : "pill-gold"
                    }`}
                  >
                    {m.moderation_status}
                  </span>
                </div>

                <blockquote
                  className="text-[15px] leading-relaxed pl-4 border-l-2 whitespace-pre-wrap"
                  style={{ borderColor: "var(--olive)" }}
                >
                  {m.body}
                </blockquote>

                <div className="flex flex-wrap gap-2">
                  {m.moderation_status !== "approved" ? (
                    <button
                      type="button"
                      className="btn btn-primary text-[13px]"
                      disabled={pending}
                      onClick={() => act(() => moderateMessage(m.id, "approved"), "Now public.")}
                    >
                      Approve for sharing
                    </button>
                  ) : null}
                  {m.moderation_status !== "hidden" ? (
                    <button
                      type="button"
                      className="btn btn-ghost text-[13px]"
                      disabled={pending}
                      onClick={() => act(() => moderateMessage(m.id, "hidden"), "Hidden.")}
                    >
                      Don&apos;t share
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
