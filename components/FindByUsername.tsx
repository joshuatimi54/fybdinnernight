"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { DiscoveryCard } from "@/lib/types";
import { findByUsername, sendInvitation } from "@/app/actions/invitations";
import LoveNoteComposer from "@/components/LoveNoteComposer";
import { avatarUrl, initials } from "@/lib/utils";

/**
 * Every non-available answer is a literal, so TypeScript can narrow on
 * `status` — and so adding a new outcome in the database forces us to write
 * a sentence for it here rather than falling through to nothing.
 */
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

/**
 * For people who already have a date.
 *
 * Browsing is for finding somebody new. If you already know who you are
 * asking, you need to point at exactly them — and there are six Amakas. The
 * username is the handle you send someone so they can find you and no one else.
 */
export default function FindByUsername({
  myUsername,
  invitesLeft,
  canInvite,
  minNoteLength,
  maxNoteLength,
}: {
  myUsername: string | null;
  invitesLeft: number;
  canInvite: boolean;
  minNoteLength: number;
  maxNoteLength: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [composing, setComposing] = useState<(DiscoveryCard & { username: string }) | null>(null);
  const [note, setNote] = useState("");

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
      toast.success(`Your note is on its way to ${composing.first_name}.`);
      setComposing(null);
      setFound(null);
      setQuery("");
      setNote("");
      router.refresh();
    });
  }

  async function copyUsername() {
    if (!myUsername) return;
    try {
      await navigator.clipboard.writeText(myUsername);
      toast.success("Your username is copied. Send it to them.");
    } catch {
      toast.error("Couldn't copy — select it and copy manually.");
    }
  }

  const message: Record<Unavailable, string> = {
    not_found: "Nobody has that username. Check the spelling, or ask them to send it to you again.",
    yourself: "That's your own username.",
    you_are_paired: "You already have a date.",
    same_gender: "Pairs for this dinner are a gentleman and a lady.",
    unavailable: "They're not available — they may already have a date, or their profile is still being reviewed.",
    already_invited: "You've already written to them. Give them a little time.",
  };

  return (
    <section
      className="p-7 sm:p-9 flex flex-col gap-7"
      style={{ background: "var(--paper)", border: "1px solid var(--rule)" }}
    >
      <div className="flex flex-col gap-3">
        <span className="eyebrow">Already Have Someone In Mind?</span>
        <h2 className="text-[clamp(1.7rem,4vw,2.3rem)] leading-tight">
          Find them by
          <span className="script text-[clamp(2.2rem,5.5vw,3rem)] ml-2">username</span>
        </h2>
        <p className="text-[14.5px] leading-[1.85] max-w-[54ch]" style={{ color: "var(--ink-soft)" }}>
          If your date has already registered, type their username below. If
          they haven&apos;t, send them your own username first — they&apos;ll
          need it to find you.
        </p>
      </div>

      {/* ------------------------------------------------- your own handle */}
      {myUsername ? (
        <div
          className="flex flex-wrap items-center justify-between gap-4 p-5"
          style={{ background: "var(--gold-wash)", border: "1px solid var(--gold-light)" }}
        >
          <div className="flex flex-col gap-1">
            <span className="text-[9.5px] tracking-[0.22em] uppercase" style={{ color: "var(--gold)" }}>
              Your Username
            </span>
            <span className="font-mono text-[19px]" style={{ color: "var(--olive)" }}>
              @{myUsername}
            </span>
          </div>
          <button type="button" className="btn btn-ghost" onClick={copyUsername}>
            Copy &amp; share
          </button>
        </div>
      ) : null}

      {/* ------------------------------------------------------- the search */}
      <form onSubmit={look} className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1">
          <label className="label" htmlFor="find-username">
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
              id="find-username"
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

      {/* ------------------------------------------------------- the result */}
      {found && found.status === "available" ? (
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
            {canInvite ? "Write them a note" : "No invitations left"}
          </button>
        </div>
      ) : found ? (
        <div
          className="p-5 text-[14.5px] leading-[1.8]"
          style={{
            background: "var(--ivory-warm)",
            border: "1px solid var(--rule-strong)",
            color: "var(--ink-soft)",
          }}
        >
          {message[found.status] ?? "We couldn't find them."}
          {found.status === "not_found" && myUsername ? (
            <>
              {" "}
              If they haven&apos;t registered yet, send them{" "}
              <span className="font-mono" style={{ color: "var(--olive)" }}>
                @{myUsername}
              </span>{" "}
              and ask them to look you up once they have.
            </>
          ) : null}
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
