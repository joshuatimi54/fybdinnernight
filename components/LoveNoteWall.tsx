"use client";

import { useRef, useState } from "react";

export type PublicNote = {
  id: string;
  body: string;
  author: string;
  partner: string | null;
  created_at: string;
};

/**
 * The love notes people wrote to their dates, scrolled sideways.
 *
 * Horizontal because there is no natural end to them — the wall grows all the
 * way to the night, and a vertical list would either truncate or swallow the
 * page. Only consented, human-approved notes ever reach this component.
 */
export default function LoveNoteWall({ notes }: { notes: PublicNote[] }) {
  const railRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  function onScroll() {
    const el = railRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft < 8);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 8);
  }

  function nudge(direction: 1 | -1) {
    const el = railRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * (el.clientWidth * 0.8), behavior: "smooth" });
  }

  return (
    <div className="flex flex-col gap-7">
      <div
        ref={railRef}
        onScroll={onScroll}
        className="scroll-x flex gap-6 pb-3 snap-x snap-mandatory"
        style={{ scrollbarWidth: "none" }}
        tabIndex={0}
        role="region"
        aria-label="Love notes from paired guests"
      >
        {notes.map((n) => (
          <figure
            key={n.id}
            className="snap-start shrink-0 w-[280px] sm:w-[340px] p-8 flex flex-col gap-5"
            style={{ background: "var(--paper)", border: "1px solid var(--rule)" }}
          >
            <span
              className="font-display text-5xl leading-[0.5] h-5"
              style={{ color: "var(--gold-light)" }}
              aria-hidden="true"
            >
              &ldquo;
            </span>

            <blockquote
              className="text-[15px] leading-[1.85] flex-1"
              style={{ color: "var(--ink-soft)" }}
            >
              {n.body.length > 260 ? `${n.body.slice(0, 260).trimEnd()}…` : n.body}
            </blockquote>

            <figcaption className="flex flex-col gap-1 pt-4" style={{ borderTop: "1px solid var(--rule)" }}>
              <span className="font-display text-xl" style={{ color: "var(--olive)" }}>
                {n.author}
              </span>
              {n.partner ? (
                <span className="text-[10px] tracking-[0.22em] uppercase" style={{ color: "var(--gold)" }}>
                  to {n.partner}
                </span>
              ) : null}
            </figcaption>
          </figure>
        ))}
      </div>

      <div className="flex gap-3 justify-center">
        <button
          type="button"
          onClick={() => nudge(-1)}
          disabled={atStart}
          aria-label="Previous notes"
          className="w-11 h-11 grid place-items-center transition-opacity disabled:opacity-25"
          style={{ border: "1px solid var(--rule-strong)", color: "var(--olive)" }}
        >
          ←
        </button>
        <button
          type="button"
          onClick={() => nudge(1)}
          disabled={atEnd}
          aria-label="More notes"
          className="w-11 h-11 grid place-items-center transition-opacity disabled:opacity-25"
          style={{ border: "1px solid var(--rule-strong)", color: "var(--olive)" }}
        >
          →
        </button>
      </div>
    </div>
  );
}
