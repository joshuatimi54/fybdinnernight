"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { DiscoveryCard } from "@/lib/types";
import { findByUsername, sendInvitation } from "@/app/actions/invitations";
import LoveNoteComposer from "@/components/LoveNoteComposer";
import { avatarUrl, initials } from "@/lib/utils";

type Choice = null | "registered" | "not_yet" | "looking";

type Unavailable =
  | "not_found"
  | "yourself"
  | "you_are_paired"
  | "same_gender"
  | "unavailable"
  | "already_invited";

type Found =
  | { status: "available"; profile: DiscoveryCard & { username: string } }
  | { status: Unavailable; first_name?: string };

const MESSAGE: Record<Unavailable, string> = {
  not_found:
    "Nobody has that username yet. If they haven't registered, send them yours and ask them to sign up.",
  yourself: "That's your own username.",
  you_are_paired: "You already have a date.",
  same_gender: "Pairs for this dinner are a gentleman and a lady.",
  unavailable:
    "They're not available — they may already have a date. If you think that's wrong, check the spelling with them.",
  already_invited: "You've already written to them. Give them a little time to answer.",
};

/**
 * "Do you have a date?" — the question the whole event turns on.
 *
 * The three answers are genuinely different situations, and collapsing them
 * into one search box leaves the most common one ("they haven't signed up
 * yet") with nothing to do. Each branch ends in a concrete next action.
 */
export default function DateStep({
  myUsername,
  invitesLeft,
  canInvite,
  minNoteLength,
  maxNoteLength,
  siteUrl,
  compact,
}: {
  myUsername: string | null;
  invitesLeft: number;
  canInvite: boolean;
  minNoteLength: number;
  maxNoteLength: number;
  siteUrl: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [choice, setChoice] = useState<Choice>(null);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [composing, setComposing] = useState<(DiscoveryCard & { username: string }) | null>(null);
  const [note, setNote] = useState("");

  const shareText = myUsername
    ? `I'm going to the FYB Dinner Night and I'd like to take you. Register at ${siteUrl} and look me up — my username is @${myUsername}.`
    : "";

  function look(e: React.FormEvent) {
    e.preventDefault();
    const u = query.trim().replace(/^@/, "").toLowerCase();
    if (!u) return;

    startTransition(async () => {
      const res = await findByUsername(u);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setFound(res.result as Found);
    });
  }

  function send() {
    if (!composing) return;
    startTransition(async () => {
      const res = await sendInvitation({ recipient: composing.id, note });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Your love note is on its way to ${composing.first_name}.`);
      setComposing(null);
      setFound(null);
      setQuery("");
      setNote("");
      router.push("/dashboard");
      router.refresh();
    });
  }

  async function copy(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(done);
    } catch {
      toast.error("Couldn't copy — select it and copy manually.");
    }
  }

  const options = [
    {
      id: "registered" as const,
      label: "Yes — and they've registered",
      hint: "Find them by their username and send your love note.",
    },
    {
      id: "not_yet" as const,
      label: "Yes — but they haven't registered",
      hint: "Send them your username so they can find you.",
    },
    {
      id: "looking" as const,
      label: "Not yet",
      hint: "Browse everyone still looking for a date.",
    },
  ];

  return (
    <section
      className={compact ? "flex flex-col gap-6" : "p-7 sm:p-9 flex flex-col gap-7"}
      style={
        compact
          ? undefined
          : { background: "var(--paper)", border: "1px solid var(--rule)" }
      }
    >
      <div className="flex flex-col gap-3">
        <span className="eyebrow">The Only Question That Matters</span>
        <h2 className="text-[clamp(1.8rem,4.5vw,2.6rem)] leading-tight">
          Do you have
          <span className="script text-[clamp(2.4rem,6vw,3.4rem)] ml-2">a date?</span>
        </h2>
        <p className="text-[14.5px] leading-[1.85] max-w-[54ch]" style={{ color: "var(--ink-soft)" }}>
          No date, no dinner. Your seat isn&apos;t reserved until two people
          have agreed to share a table.
        </p>
      </div>

      {/* ------------------------------------------------------- the choice */}
      <div className="grid gap-3">
        {options.map((o) => {
          const active = choice === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                setChoice(active ? null : o.id);
                setFound(null);
              }}
              aria-pressed={active}
              className="text-left p-5 transition-colors"
              style={{
                border: `1px solid ${active ? "var(--gold)" : "var(--rule-strong)"}`,
                background: active ? "var(--gold-wash)" : "var(--paper)",
              }}
            >
              <span className="flex flex-col gap-1">
                <span className="text-[16px]" style={{ color: "var(--olive)" }}>
                  {o.label}
                </span>
                <span className="text-[13px] leading-snug" style={{ color: "var(--ink-soft)" }}>
                  {o.hint}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* ------------------------------------------- they have registered */}
      {choice === "registered" ? (
        <div className="flex flex-col gap-5 pt-2">
          <form onSubmit={look} className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1">
              <label className="label" htmlFor="date-username">
                Their username
              </label>
              <div className="relative">
                <span
                  className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-[15px] pointer-events-none"
                  style={{ color: "var(--ink-faint)" }}
                  aria-hidden="true"
                >
                  @
                </span>
                <input
                  id="date-username"
                  className="field font-mono pl-9"
                  maxLength={21}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value.replace(/[^A-Za-z0-9_@]/g, ""));
                    setFound(null);
                  }}
                  placeholder="theirname"
                />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={pending || !query.trim()}>
              {pending ? "Looking…" : "Find them"}
            </button>
          </form>

          {found?.status === "available" ? (
            <div
              className="flex flex-wrap items-center gap-5 p-5"
              style={{ background: "var(--ivory)", border: "1px solid var(--gold-light)" }}
            >
              {avatarUrl(found.profile.photo_url, 200) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl(found.profile.photo_url, 200)!}
                  alt=""
                  className="w-16 h-16 rounded-full object-cover"
                  style={{ border: "1px solid var(--gold-light)" }}
                />
              ) : (
                <span
                  className="w-16 h-16 rounded-full grid place-items-center font-display text-xl"
                  style={{
                    border: "1px solid var(--gold-light)",
                    background: "var(--ivory-warm)",
                    color: "var(--olive-soft)",
                  }}
                >
                  {initials(found.profile.first_name)}
                </span>
              )}

              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                <span className="font-display text-[24px]" style={{ color: "var(--olive)" }}>
                  {found.profile.first_name} {found.profile.last_initial}
                </span>
                <span className="font-mono text-[12.5px]" style={{ color: "var(--ink-faint)" }}>
                  @{found.profile.username}
                </span>
              </div>

              <button
                type="button"
                className="btn btn-gold"
                disabled={!canInvite}
                onClick={() => {
                  setNote("");
                  setComposing(found.profile);
                }}
              >
                {canInvite ? "Write their love note" : "No invitations left"}
              </button>
            </div>
          ) : found ? (
            <p
              className="p-5 text-[14.5px] leading-[1.8]"
              style={{
                background: "var(--ivory-warm)",
                border: "1px solid var(--rule-strong)",
                color: "var(--ink-soft)",
              }}
            >
              {MESSAGE[found.status]}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* --------------------------------------- they have NOT registered */}
      {choice === "not_yet" ? (
        <div className="flex flex-col gap-5 pt-2">
          <div
            className="flex flex-wrap items-center justify-between gap-4 p-5"
            style={{ background: "var(--gold-wash)", border: "1px solid var(--gold-light)" }}
          >
            <div className="flex flex-col gap-1">
              <span className="text-[9.5px] tracking-[0.22em] uppercase" style={{ color: "var(--gold)" }}>
                Your Username
              </span>
              <span className="font-mono text-[21px]" style={{ color: "var(--olive)" }}>
                @{myUsername ?? "—"}
              </span>
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!myUsername}
              onClick={() => copy(myUsername!, "Username copied.")}
            >
              Copy username
            </button>
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-[14.5px] leading-[1.85]" style={{ color: "var(--ink-soft)" }}>
              Send them this. Once they register, either of you can send the
              request — but whoever sends it writes the love note.
            </p>

            <div
              className="p-5 text-[14.5px] leading-[1.85]"
              style={{
                background: "var(--ivory-warm)",
                border: "1px solid var(--rule-strong)",
                color: "var(--olive)",
              }}
            >
              {shareText}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!myUsername}
                onClick={() => copy(shareText, "Message copied. Paste it to them.")}
              >
                Copy the message
              </button>
              <a
                className="btn btn-ghost"
                href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Send on WhatsApp
              </a>
            </div>
          </div>
        </div>
      ) : null}

      {/* ---------------------------------------------------- still looking */}
      {choice === "looking" ? (
        <div className="flex flex-col gap-4 pt-2">
          <p className="text-[14.5px] leading-[1.85]" style={{ color: "var(--ink-soft)" }}>
            Have a look at everyone else who is still looking. When somebody
            catches your eye, you write them a love note — that&apos;s the only
            way to ask at this dinner.
          </p>
          <a href="/discover" className="btn btn-primary self-start">
            Browse everyone looking
          </a>
        </div>
      ) : null}

      {composing ? (
        <LoveNoteComposer
          target={composing}
          note={note}
          onNote={setNote}
          onSend={send}
          onCancel={() => setComposing(null)}
          pending={pending}
          invitesLeft={invitesLeft}
          minLength={minNoteLength}
          maxLength={maxNoteLength}
        />
      ) : null}
    </section>
  );
}
