"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { sendBroadcast } from "@/app/actions/broadcast";
import { SEGMENTS, type SegmentId } from "@/lib/segments";

const LINKS = [
  { path: "", label: "No button" },
  { path: "/discover", label: "Find your date" },
  { path: "/invitations", label: "See your invitations" },
  { path: "/dashboard", label: "Open my dinner" },
  { path: "/pass", label: "Open my pass" },
  { path: "/seating", label: "Choose your table" },
  { path: "/onboarding", label: "Finish my profile" },
];

export default function Composer({ counts }: { counts: Record<string, number> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [segment, setSegment] = useState<SegmentId>("unpaired");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [linkIdx, setLinkIdx] = useState(1);
  const [tested, setTested] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const audience = counts[segment] ?? 0;
  const link = LINKS[linkIdx];
  const ready = subject.trim().length >= 3 && body.trim().length >= 10;

  function payload(testOnly: boolean) {
    return {
      subject,
      body,
      segment,
      ctaLabel: link.path ? link.label : undefined,
      ctaPath: link.path || undefined,
      testOnly,
    };
  }

  function send(testOnly: boolean) {
    startTransition(async () => {
      const res = await sendBroadcast(payload(testOnly));

      if (!res.ok) {
        toast.error(res.error);
        return;
      }

      if (res.test) {
        setTested(true);
        toast.success("Test sent to you. Check your inbox before sending for real.");
      } else {
        setConfirming(false);
        setTested(false);
        setSubject("");
        setBody("");
        toast.success(
          `Queued for ${res.recipients} ${res.recipients === 1 ? "person" : "people"}. Sending starts within five minutes.`,
        );
      }

      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {/* --------------------------------------------------------- who */}
      <fieldset className="flex flex-col gap-3 border-0 p-0 m-0">
        <legend className="label">Who gets this</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {SEGMENTS.map((s) => {
            const n = counts[s.id] ?? 0;
            const active = segment === s.id;
            return (
              <label
                key={s.id}
                className="flex items-start gap-3 p-4 cursor-pointer transition-colors"
                style={{
                  border: `1px solid ${active ? "var(--gold)" : "var(--rule-strong)"}`,
                  background: active ? "var(--gold-wash)" : "var(--paper)",
                }}
              >
                <input
                  type="radio"
                  name="segment"
                  className="sr-only"
                  checked={active}
                  onChange={() => {
                    setSegment(s.id);
                    setTested(false);
                  }}
                />
                <span className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[14px] font-medium" style={{ color: "var(--olive)" }}>
                      {s.label}
                    </span>
                    <span
                      className="numeric text-[13px] shrink-0"
                      style={{ color: n === 0 ? "var(--ink-faint)" : "var(--gold)" }}
                    >
                      {n}
                    </span>
                  </span>
                  <span className="text-[12px] leading-snug" style={{ color: "var(--ink-soft)" }}>
                    {s.hint}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* -------------------------------------------------------- what */}
      <div className="flex flex-col gap-5">
        <div>
          <label className="label" htmlFor="bc-subject">Subject</label>
          <input
            id="bc-subject"
            className="field"
            maxLength={120}
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              setTested(false);
            }}
            placeholder="Three days left to find your date"
          />
          <p className="text-[12px] mt-1.5" style={{ color: "var(--ink-faint)" }}>
            This is all most people read. Say the actual thing.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="bc-body">Message</label>
          <textarea
            id="bc-body"
            className="field resize-y min-h-[200px] leading-[1.85]"
            maxLength={5000}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setTested(false);
            }}
            placeholder={"Write it the way you would say it out loud.\n\nLeave a blank line between paragraphs."}
          />
          <div className="flex justify-between gap-3 mt-1.5">
            <p className="text-[12px]" style={{ color: "var(--ink-faint)" }}>
              Plain text. Blank lines become paragraphs. It opens with their
              first name automatically.
            </p>
            <span className="numeric text-[11px]" style={{ color: "var(--ink-faint)" }}>
              {body.length}/5000
            </span>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="bc-link">Button</label>
          <select
            id="bc-link"
            className="field"
            value={linkIdx}
            onChange={(e) => {
              setLinkIdx(Number(e.target.value));
              setTested(false);
            }}
          >
            {LINKS.map((l, i) => (
              <option key={l.path || "none"} value={i}>
                {l.label}
                {l.path ? ` → ${l.path}` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ------------------------------------------------------- send */}
      <div
        className="flex flex-col gap-4 p-6"
        style={{ background: "var(--ivory-warm)", border: "1px solid var(--rule)" }}
      >
        <div className="flex flex-col gap-1">
          <span className="eyebrow">Before you send</span>
          <p className="text-[14px]" style={{ color: "var(--ink-soft)" }}>
            Send yourself a test first. An email cannot be unsent, and{" "}
            <strong style={{ color: "var(--olive)" }}>
              {audience} {audience === 1 ? "person" : "people"}
            </strong>{" "}
            will get this one.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={pending || !ready}
            onClick={() => send(true)}
          >
            {pending ? "Working…" : "Send a test to me"}
          </button>

          <button
            type="button"
            className="btn btn-primary"
            disabled={pending || !ready || audience === 0 || !tested}
            onClick={() => setConfirming(true)}
          >
            Send to {audience} {audience === 1 ? "person" : "people"}
          </button>
        </div>

        {!tested && ready ? (
          <p className="text-[12.5px]" style={{ color: "var(--gold)" }}>
            Send yourself a test first — the real send unlocks after that.
          </p>
        ) : null}

        {audience === 0 ? (
          <p className="text-[12.5px]" style={{ color: "var(--ink-faint)" }}>
            Nobody is in that group right now.
          </p>
        ) : null}
      </div>

      {/* ---------------------------------------------------- confirm */}
      {confirming ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center p-5"
          style={{ background: "color-mix(in srgb, var(--olive-deep) 55%, transparent)" }}
          role="dialog"
          aria-modal="true"
          aria-label="Confirm send"
        >
          <div
            className="w-full max-w-[420px] p-8 flex flex-col gap-6"
            style={{ background: "var(--paper)", border: "1px solid var(--rule-strong)" }}
          >
            <div className="flex flex-col gap-2">
              <span className="eyebrow">Last check</span>
              <h3 className="text-[28px] leading-tight">
                Send to {audience}{" "}
                <span className="script text-[34px]">
                  {audience === 1 ? "person" : "people"}
                </span>
                ?
              </h3>
              <p className="text-[14px] leading-[1.8]" style={{ color: "var(--ink-soft)" }}>
                Subject: <strong style={{ color: "var(--olive)" }}>{subject}</strong>
              </p>
              <p className="text-[13px]" style={{ color: "var(--ink-faint)" }}>
                This cannot be undone. Anyone who has opted out is excluded, and
                nobody receives it twice.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                className="btn btn-primary"
                disabled={pending}
                onClick={() => send(false)}
              >
                {pending ? "Queueing…" : "Yes, send it"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={pending}
                onClick={() => setConfirming(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
