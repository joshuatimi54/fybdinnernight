"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { DiscoveryCard } from "@/lib/types";
import ProfileCard from "@/components/ProfileCard";
import LoveNoteComposer from "@/components/LoveNoteComposer";
import { sendInvitation } from "@/app/actions/invitations";

export default function DiscoverGrid({
  cards,
  invitesLeft,
  hasOutstanding,
  minNoteLength,
  maxNoteLength,
}: {
  cards: DiscoveryCard[];
  invitesLeft: number;
  hasOutstanding: boolean;
  minNoteLength: number;
  maxNoteLength: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [hidden, setHidden] = useState<string[]>([]);
  const [target, setTarget] = useState<DiscoveryCard | null>(null);
  const [note, setNote] = useState("");

  const canInvite = invitesLeft > 0 && !hasOutstanding;
  const visible = cards.filter((c) => !hidden.includes(c.id));

  function send() {
    if (!target) return;
    startTransition(async () => {
      const res = await sendInvitation({ recipient: target.id, note });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Your note is on its way to ${target.first_name}.`);
      setTarget(null);
      setNote("");
      router.refresh();
    });
  }

  if (visible.length === 0) {
    return (
      <div
        className="py-20 text-center flex flex-col gap-4 items-center"
        style={{ border: "1px solid var(--rule)", background: "var(--paper)" }}
      >
        <span className="script text-5xl">Nobody yet</span>
        <p className="text-[15px] max-w-[40ch]" style={{ color: "var(--ink-soft)" }}>
          Either everyone matching your search has already been asked, or
          profiles are still being approved. Check back shortly.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-7 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((card) => (
          <ProfileCard
            key={card.id}
            card={card}
            canInvite={canInvite}
            onInvite={(c) => {
              setNote("");
              setTarget(c);
            }}
            onHidden={(id) => setHidden((h) => [...h, id])}
          />
        ))}
      </div>

      {target ? (
        <LoveNoteComposer
          target={target}
          note={note}
          onNote={setNote}
          onSend={send}
          onCancel={() => setTarget(null)}
          pending={pending}
          invitesLeft={invitesLeft}
          minLength={minNoteLength}
          maxLength={maxNoteLength}
        />
      ) : null}
    </>
  );
}
