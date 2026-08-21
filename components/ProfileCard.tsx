"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { DiscoveryCard } from "@/lib/types";
import { avatarUrl, initials } from "@/lib/utils";
import { blockProfile, reportProfile, REPORT_LABELS, type ReportReason } from "@/app/actions/safety";

export default function ProfileCard({
  card,
  onInvite,
  canInvite,
  onHidden,
}: {
  card: DiscoveryCard;
  onInvite: (card: DiscoveryCard) => void;
  canInvite: boolean;
  onHidden: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState<ReportReason>("inappropriate_photo");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const photo = avatarUrl(card.photo_url, 480);
  const prompts = Array.isArray(card.prompts) ? card.prompts.filter((p) => p.a) : [];

  async function submitReport() {
    setBusy(true);
    const res = await reportProfile({ reported: card.id, reason, notes });
    setBusy(false);

    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setReporting(false);
    setMenuOpen(false);
    toast.success("Thank you. The committee will look at this.");
  }

  async function block() {
    setBusy(true);
    const res = await blockProfile(card.id);
    setBusy(false);

    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    onHidden(card.id);
    toast.success("You won't see each other again.");
  }

  return (
    <article className="card flex flex-col overflow-hidden">
      <div className="relative aspect-[4/5] bg-ivory-warm">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt={`${card.first_name} ${card.last_initial}`}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full grid place-items-center font-display text-5xl text-ink-faint">
            {initials(card.first_name)}
          </div>
        )}

        <button
          type="button"
          className="absolute top-2 right-2 w-8 h-8 grid place-items-center rounded-[2px] text-lg leading-none"
          style={{ background: "color-mix(in srgb, var(--ivory) 75%, transparent)", color: "var(--ink-soft)" }}
          aria-label={`More options for ${card.first_name}`}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          ⋯
        </button>

        {menuOpen ? (
          <div
            className="absolute top-11 right-2 z-10 border flex flex-col min-w-[160px]"
            style={{ background: "var(--ivory-warm)", borderColor: "var(--rule-strong)" }}
          >
            <button
              type="button"
              className="btn btn-quiet justify-start text-[13px]"
              onClick={() => setReporting(true)}
            >
              Report this profile
            </button>
            <button
              type="button"
              className="btn btn-quiet justify-start text-[13px]"
              disabled={busy}
              onClick={block}
            >
              Block
            </button>
          </div>
        ) : null}
      </div>

      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="flex flex-col gap-0.5">
          <h3 className="font-display text-2xl leading-none">
            {card.first_name} {card.last_initial}
          </h3>
          {card.department || card.level ? (
            <p className="text-[12px] text-ink-faint">
              {[card.department, card.level].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>

        {card.bio ? (
          <p className="text-[14px] text-ink-soft leading-snug">{card.bio}</p>
        ) : null}

        {prompts.length > 0 ? (
          <div className="flex flex-col gap-3 pt-1">
            {prompts.slice(0, 2).map((p, i) => (
              <div key={i} className="flex flex-col gap-1">
                <span className="text-[10.5px] uppercase tracking-[0.13em] text-ink-faint">
                  {p.q}
                </span>
                <p className="text-[14px] leading-snug">{p.a}</p>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-auto pt-3">
          {card.has_pending_from_me ? (
            <span className="pill pill-gold">Waiting on their answer</span>
          ) : (
            <button
              type="button"
              className="btn btn-primary w-full"
              disabled={!canInvite}
              onClick={() => onInvite(card)}
            >
              Invite {card.first_name}
            </button>
          )}
        </div>
      </div>

      {reporting ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center p-5"
          style={{ background: "color-mix(in srgb, var(--olive-deep) 85%, transparent)" }}
          role="dialog"
          aria-modal="true"
          aria-label="Report profile"
        >
          <div className="card p-6 w-full max-w-[420px] flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <span className="eyebrow">Report</span>
              <h3 className="text-2xl">Tell the committee</h3>
              <p className="text-[13px] text-ink-soft">
                {card.first_name} won&apos;t be told you reported them.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              {(Object.keys(REPORT_LABELS) as ReportReason[]).map((r) => (
                <label key={r} className="flex items-center gap-3 text-[14px] cursor-pointer">
                  <input
                    type="radio"
                    name={`reason-${card.id}`}
                    checked={reason === r}
                    onChange={() => setReason(r)}
                  />
                  {REPORT_LABELS[r]}
                </label>
              ))}
            </div>

            <textarea
              className="field resize-y min-h-[80px]"
              maxLength={500}
              placeholder="Anything else we should know? (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />

            <div className="flex gap-3">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={submitReport}>
                {busy ? "Sending…" : "Send report"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setReporting(false);
                  setMenuOpen(false);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}
