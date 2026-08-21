"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateConfig } from "@/app/actions/admin";
import type { EventConfig } from "@/lib/types";

/** datetime-local wants `YYYY-MM-DDTHH:mm` in local time, not an ISO string. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className="flex items-start gap-4 p-4 border cursor-pointer"
      style={{
        borderColor: value ? "var(--good)" : "var(--rule-strong)",
        background: value ? "var(--good-wash)" : "var(--paper)",
      }}
    >
      <input
        type="checkbox"
        className="mt-1"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="flex flex-col gap-1">
        <span className="text-[15px] font-semibold">{label}</span>
        <span className="text-[13px] text-ink-soft leading-snug">{hint}</span>
      </span>
    </label>
  );
}

export default function SettingsForm({ config }: { config: EventConfig }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [c, setC] = useState({
    ...config,
    event_starts_at: toLocalInput(config.event_starts_at),
    pairing_deadline: toLocalInput(config.pairing_deadline),
  });

  function set<K extends keyof typeof c>(key: K, value: (typeof c)[K]) {
    setC((prev) => ({ ...prev, [key]: value }));
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await updateConfig({
        event_name: c.event_name,
        event_starts_at: fromLocalInput(c.event_starts_at),
        venue: c.venue || null,
        dress_code: c.dress_code || null,
        registration_open: c.registration_open,
        discovery_open: c.discovery_open,
        seat_selection_enabled: c.seat_selection_enabled,
        require_photo: c.require_photo,
        max_lifetime_invites: Number(c.max_lifetime_invites),
        max_outstanding_invites: Number(c.max_outstanding_invites),
        invite_expiry_hours: Number(c.invite_expiry_hours),
        min_love_note_length: Number(c.min_love_note_length),
        max_love_note_length: Number(c.max_love_note_length),
        show_guest_wall: c.show_guest_wall,
        pairing_deadline: fromLocalInput(c.pairing_deadline),
        total_seats: Number(c.total_seats),
        hashtag: c.hashtag,
        social_handle: c.social_handle,
      });

      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Settings saved.");
      router.refresh();
    });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-10 max-w-[720px]">
      <section className="flex flex-col gap-5">
        <span className="eyebrow">The night</span>

        <div>
          <label className="label" htmlFor="ev-name">Event name</label>
          <input
            id="ev-name" className="field" maxLength={80} required
            value={c.event_name} onChange={(e) => set("event_name", e.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="ev-when">Date and time</label>
            <input
              id="ev-when" className="field" type="datetime-local"
              value={c.event_starts_at}
              onChange={(e) => set("event_starts_at", e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="ev-deadline">Pairing deadline</label>
            <input
              id="ev-deadline" className="field" type="datetime-local"
              value={c.pairing_deadline}
              onChange={(e) => set("pairing_deadline", e.target.value)}
            />
            <p className="text-[12px] text-ink-faint mt-1.5">
              After this, no new invitations can be sent.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="ev-venue">Venue</label>
            <input
              id="ev-venue" className="field" maxLength={160}
              value={c.venue ?? ""} onChange={(e) => set("venue", e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="ev-dress">Dress code</label>
            <input
              id="ev-dress" className="field" maxLength={160}
              value={c.dress_code ?? ""} onChange={(e) => set("dress_code", e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="ev-seats">Total seats</label>
            <input
              id="ev-seats" className="field numeric" type="number" min={2} max={5000}
              value={c.total_seats}
              onChange={(e) => set("total_seats", Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label" htmlFor="ev-tag">Hashtag</label>
            <input
              id="ev-tag" className="field" maxLength={40}
              value={c.hashtag} onChange={(e) => set("hashtag", e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="ev-handle">Social handle</label>
            <input
              id="ev-handle" className="field" maxLength={40}
              value={c.social_handle} onChange={(e) => set("social_handle", e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4 border-t border-rule pt-8">
        <span className="eyebrow">Switches</span>
        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle
            label="Registration open"
            hint="New guests can submit a profile for review."
            value={c.registration_open}
            onChange={(v) => set("registration_open", v)}
          />
          <Toggle
            label="Discovery open"
            hint="Guests can browse and send invitations."
            value={c.discovery_open}
            onChange={(v) => set("discovery_open", v)}
          />
          <Toggle
            label="Guests pick their table"
            hint="Turn off to seat everyone yourself from the seating page."
            value={c.seat_selection_enabled}
            onChange={(v) => set("seat_selection_enabled", v)}
          />
          <Toggle
            label="Photo required"
            hint="Turn off if you'd rather not require a photo to be listed."
            value={c.require_photo}
            onChange={(v) => set("require_photo", v)}
          />
          <Toggle
            label="Public guest wall"
            hint="Shows first names and photos of approved guests on the landing page. Switch it off if that feels like too much exposure."
            value={c.show_guest_wall}
            onChange={(v) => set("show_guest_wall", v)}
          />
        </div>
      </section>

      <section className="flex flex-col gap-5 border-t border-rule pt-8">
        <div className="flex flex-col gap-2">
          <span className="eyebrow">The love note</span>
          <p className="text-[14px] max-w-[56ch]" style={{ color: "var(--ink-soft)" }}>
            Nobody can be invited without one. The minimum is what stops
            &ldquo;hey&rdquo; counting as asking someone to dinner — it is
            enforced in the database, so the rule holds even outside the app.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 max-w-[420px]">
          <div>
            <label className="label" htmlFor="note-min">Minimum characters</label>
            <input
              id="note-min" className="field numeric" type="number" min={0} max={400}
              value={c.min_love_note_length}
              onChange={(e) => set("min_love_note_length", Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label" htmlFor="note-max">Maximum characters</label>
            <input
              id="note-max" className="field numeric" type="number" min={50} max={2000}
              value={c.max_love_note_length}
              onChange={(e) => set("max_love_note_length", Number(e.target.value))}
            />
          </div>
        </div>

        {c.min_love_note_length < 20 ? (
          <div
            className="p-4 text-[13px] leading-relaxed"
            style={{ background: "var(--gold-wash)", color: "var(--ink-soft)" }}
          >
            Below about twenty characters the note stops being a note. The
            whole mechanic rests on people having to say something real before
            they can ask.
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-5 border-t border-rule pt-8">
        <div className="flex flex-col gap-2">
          <span className="eyebrow">Invitation rules</span>
          <p className="text-[14px] text-ink-soft max-w-[56ch]">
            Five in total with one outstanding is the recommendation. The limit
            is on the sender, never the receiver — that is what stops one
            popular person absorbing every invitation in the room.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="inv-life">Invitations each</label>
            <input
              id="inv-life" className="field numeric" type="number" min={1} max={50}
              value={c.max_lifetime_invites}
              onChange={(e) => set("max_lifetime_invites", Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label" htmlFor="inv-out">Outstanding at once</label>
            <input
              id="inv-out" className="field numeric" type="number" min={1} max={10}
              value={c.max_outstanding_invites}
              onChange={(e) => set("max_outstanding_invites", Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label" htmlFor="inv-exp">Expiry (hours)</label>
            <input
              id="inv-exp" className="field numeric" type="number" min={1} max={336}
              value={c.invite_expiry_hours}
              onChange={(e) => set("invite_expiry_hours", Number(e.target.value))}
            />
          </div>
        </div>

        {c.max_outstanding_invites > 1 ? (
          <div
            className="p-4 border text-[13px] leading-relaxed"
            style={{ borderColor: "var(--gold)", background: "var(--gold-wash)" }}
          >
            Above one outstanding invitation, a person can have several offers
            in flight at once. The pairing transaction still handles it safely,
            but it makes each invitation feel cheaper — which is the opposite of
            what the one-at-a-time rule was for.
          </div>
        ) : null}
      </section>

      <div className="flex gap-3 border-t border-rule pt-8">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  );
}
