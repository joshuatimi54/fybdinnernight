"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setSeekingHelp } from "@/app/actions/profile";

/**
 * The safety net, in the interface.
 *
 * The wording matters as much as the switch: it has to be something a person
 * can turn on without feeling like they have admitted defeat in public. It is
 * never shown to other guests — only the committee's matchmaker queue.
 */
export default function SeekingHelpToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next);

    startTransition(async () => {
      const res = await setSeekingHelp(next);
      if (!res.ok) {
        setOn(!next);
        toast.error(res.error);
        return;
      }
      toast.success(
        next
          ? "The committee will help you find a date."
          : "Turned off — you're on your own again.",
      );
    });
  }

  return (
    <section
      className="border p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      style={{
        borderColor: on ? "var(--gold)" : "var(--rule-strong)",
        background: on ? "var(--gold-wash)" : "var(--paper)",
      }}
    >
      <div className="flex flex-col gap-2 max-w-[52ch]">
        <span className="eyebrow">Private — committee only</span>
        <h3 className="text-xl font-body font-bold tracking-normal">
          Help me find a date
        </h3>
        <p className="text-[14px] text-ink-soft leading-relaxed">
          Turn this on and the committee will personally pair you before the
          deadline. Nobody else can see this — it never appears on your profile
          and it never shows up in anyone&apos;s browsing.
        </p>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Help me find a date"
        disabled={pending}
        onClick={toggle}
        className="relative shrink-0 w-[54px] h-[30px] rounded-full transition-colors disabled:opacity-50"
        style={{
          background: on ? "var(--gold)" : "var(--mist)",
          border: `1px solid ${on ? "var(--gold)" : "var(--rule-strong)"}`,
        }}
      >
        <span
          className="absolute top-[3px] w-[22px] h-[22px] rounded-full transition-[left]"
          style={{
            left: on ? "27px" : "3px",
            background: on ? "var(--olive-deep)" : "var(--ink-faint)",
          }}
        />
      </button>
    </section>
  );
}
