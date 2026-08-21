"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveDateMessage } from "@/app/actions/pair";
import type { DateMessage } from "@/lib/types";

export default function DateMessageForm({
  pairId,
  existing,
  partnerName,
}: {
  pairId: string;
  existing: DateMessage | null;
  partnerName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [body, setBody] = useState(existing?.body ?? "");
  const [consent, setConsent] = useState(existing?.share_consent ?? false);
  const [anonymise, setAnonymise] = useState(existing?.anonymise ?? false);

  function save(e: React.FormEvent) {
    e.preventDefault();

    startTransition(async () => {
      const res = await saveDateMessage({
        pairId,
        body,
        shareConsent: consent,
        anonymise,
      });

      if (!res.ok) {
        toast.error(res.error);
        return;
      }

      toast.success(
        existing ? "Message updated." : `Sent to ${partnerName}.`,
      );
      router.refresh();
    });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-5">
      <div>
        <label className="label" htmlFor="msg">
          {existing ? "Your message" : `Write ${partnerName} something`}
        </label>
        <textarea
          id="msg"
          className="field resize-y min-h-[150px] leading-relaxed"
          maxLength={1000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={`A note, a joke, how you two know each other, or why you asked. ${partnerName} sees this and nobody else.`}
        />
        <p className="text-[12px] text-ink-faint mt-1.5 numeric text-right">
          {body.length}/1000
        </p>
      </div>

      <div
        className="flex flex-col gap-3 p-4 border"
        style={{ borderColor: "var(--rule-strong)", background: "var(--ivory-warm)" }}
      >
        <label className="flex items-start gap-3 text-[14px] cursor-pointer">
          <input
            type="checkbox"
            className="mt-1"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>
            The committee may share this publicly.
            <span className="block text-[12.5px] text-ink-faint mt-0.5">
              Off by default. Nothing is ever posted without this ticked, and a
              person still reads it first.
            </span>
          </span>
        </label>

        {consent ? (
          <label className="flex items-start gap-3 text-[14px] cursor-pointer pl-7">
            <input
              type="checkbox"
              className="mt-1"
              checked={anonymise}
              onChange={(e) => setAnonymise(e.target.checked)}
            />
            <span>
              Hide my name if you do
              <span className="block text-[12.5px] text-ink-faint mt-0.5">
                It would be posted as &ldquo;Anonymous&rdquo;.
              </span>
            </span>
          </label>
        ) : null}
      </div>

      <button
        type="submit"
        className="btn btn-primary self-start"
        disabled={pending || body.trim().length === 0}
      >
        {pending ? "Saving…" : existing ? "Update message" : "Send it"}
      </button>
    </form>
  );
}
