"use client";

import { useState } from "react";
import type { DiscoveryCard } from "@/lib/types";
import { avatarUrl, initials } from "@/lib/utils";

const OPENERS = [
  "I noticed you said",
  "We have never really talked, but",
  "I have wanted to ask you since",
  "This is going to sound forward, but",
];

/**
 * The love note is the gate: you cannot ask anyone to this dinner without
 * writing to them first, and the minimum length is enforced in the database.
 *
 * So the composer is deliberately unhurried — the note is the point, and the
 * Send button only appears once there is something worth sending.
 */
export default function LoveNoteComposer({
  target,
  note,
  onNote,
  onSend,
  onCancel,
  pending,
  invitesLeft,
  minLength,
  maxLength,
}: {
  target: DiscoveryCard;
  note: string;
  onNote: (v: string) => void;
  onSend: () => void;
  onCancel: () => void;
  pending: boolean;
  invitesLeft: number;
  minLength: number;
  maxLength: number;
}) {
  const [touched, setTouched] = useState(false);
  const length = note.trim().length;
  const short = length < minLength;
  const photo = avatarUrl(target.photo_url, 200);
  const prompts = Array.isArray(target.prompts) ? target.prompts.filter((p) => p.a) : [];

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{ background: "color-mix(in srgb, var(--olive-deep) 55%, transparent)" }}
      role="dialog"
      aria-modal="true"
      aria-label={`Write a love note to ${target.first_name}`}
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
    >
      <div className="min-h-full grid place-items-center p-4 sm:p-6">
        <div
          className="w-full max-w-[540px] p-7 sm:p-10 flex flex-col gap-7"
          style={{ background: "var(--paper)", border: "1px solid var(--rule-strong)" }}
        >
          {/* ------------------------------------------------------ header */}
          <div className="flex flex-col items-center text-center gap-4">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo}
                alt=""
                className="w-20 h-20 rounded-full object-cover"
                style={{ border: "1px solid var(--gold-light)" }}
              />
            ) : (
              <span
                className="w-20 h-20 rounded-full grid place-items-center font-display text-2xl"
                style={{
                  border: "1px solid var(--gold-light)",
                  background: "var(--ivory-warm)",
                  color: "var(--olive-soft)",
                }}
              >
                {initials(target.first_name)}
              </span>
            )}

            <div className="flex flex-col gap-1">
              <span className="eyebrow">Before You Ask</span>
              <h3 className="text-[clamp(1.8rem,5vw,2.4rem)] leading-tight">
                Write {target.first_name} a
                <span className="script text-[clamp(2.4rem,6vw,3.2rem)] ml-2">
                  love note
                </span>
              </h3>
            </div>

            <p className="text-[14px] leading-[1.85] max-w-[40ch]" style={{ color: "var(--ink-soft)" }}>
              Nobody gets invited to this dinner with a tap. Say something only
              you would say — it is the whole difference between being asked and
              being added to a list.
            </p>
          </div>

          {/* ---------------------------------------------- their own words */}
          {prompts.length > 0 ? (
            <div
              className="p-5 flex flex-col gap-3"
              style={{ background: "var(--ivory)", border: "1px solid var(--rule)" }}
            >
              <span className="text-[9px] tracking-[0.24em] uppercase" style={{ color: "var(--gold)" }}>
                In {target.first_name}&apos;s Words
              </span>
              {prompts.slice(0, 2).map((p, i) => (
                <div key={i} className="flex flex-col gap-0.5">
                  <span className="text-[11px]" style={{ color: "var(--ink-faint)" }}>
                    {p.q}
                  </span>
                  <p className="text-[14px]" style={{ color: "var(--olive)" }}>
                    {p.a}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          {/* -------------------------------------------------------- note */}
          <div className="flex flex-col gap-2">
            <label className="label" htmlFor="love-note">
              Your Note
            </label>
            <textarea
              id="love-note"
              className="field resize-y min-h-[160px] leading-[1.85]"
              maxLength={maxLength}
              autoFocus
              value={note}
              onBlur={() => setTouched(true)}
              onChange={(e) => onNote(e.target.value)}
              placeholder={`Dear ${target.first_name},`}
            />

            <div className="flex items-center justify-between gap-3">
              <span
                className="text-[12px]"
                style={{ color: short ? "var(--gold)" : "var(--good)" }}
              >
                {short
                  ? `${minLength - length} more character${minLength - length === 1 ? "" : "s"} to go`
                  : "That will do nicely"}
              </span>
              <span className="numeric text-[11px]" style={{ color: "var(--ink-faint)" }}>
                {length}/{maxLength}
              </span>
            </div>

            {short && touched && length > 0 ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {OPENERS.map((o) => (
                  <button
                    key={o}
                    type="button"
                    className="text-[11.5px] px-3 py-1.5 transition-colors"
                    style={{ border: "1px solid var(--rule-strong)", color: "var(--ink-soft)" }}
                    onClick={() => onNote(note ? `${note.trimEnd()} ${o} ` : `${o} `)}
                  >
                    {o}…
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* ------------------------------------------------------- costs */}
          <p
            className="text-[12.5px] leading-[1.8] p-4"
            style={{ background: "var(--gold-wash)", color: "var(--ink-soft)" }}
          >
            This uses one of your{" "}
            <span className="numeric" style={{ color: "var(--gold)" }}>
              {invitesLeft}
            </span>{" "}
            remaining invitations, and you will be waiting on this one until{" "}
            {target.first_name} answers or it runs out.
          </p>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending || short}
              onClick={onSend}
            >
              {pending ? "Sending…" : `Send To ${target.first_name}`}
            </button>
            <button type="button" className="btn btn-ghost" disabled={pending} onClick={onCancel}>
              Not Yet
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
