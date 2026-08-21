"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type State = "idle" | "checking" | "free" | "taken" | "invalid";

const RULE = /^[a-z][a-z0-9_]{2,19}$/;

/**
 * The handle someone sends to their date so they can be found.
 *
 * Checked as you type rather than on submit — a username collision discovered
 * after filling in a whole form is a small, avoidable annoyance, and this is
 * the one field where collisions are likely.
 */
export default function UsernameField({
  value,
  onChange,
  locked,
}: {
  value: string;
  onChange: (v: string) => void;
  locked: boolean;
}) {
  const [state, setState] = useState<State>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggested = useRef(false);

  // Offer a sensible default so most people never have to think about it.
  useEffect(() => {
    if (value || locked || suggested.current) return;
    suggested.current = true;

    void (async () => {
      const supabase = createClient();
      const { data } = await supabase.rpc("suggest_username");
      if (typeof data === "string" && data) onChange(data);
    })();
  }, [value, locked, onChange]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);

    const u = value.trim().toLowerCase();
    if (!u) return setState("idle");
    if (!RULE.test(u)) return setState("invalid");

    setState("checking");
    timer.current = setTimeout(async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("username_available", { p_username: u });
      setState(error ? "idle" : data ? "free" : "taken");
    }, 400);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value]);

  const hint: Record<State, { text: string; colour: string }> = {
    idle: {
      text: "Three to twenty characters. Letters, numbers and underscores; starts with a letter.",
      colour: "var(--ink-faint)",
    },
    checking: { text: "Checking…", colour: "var(--ink-faint)" },
    free: { text: "That one is yours.", colour: "var(--good)" },
    taken: { text: "Somebody already has that one. Try another.", colour: "var(--danger)" },
    invalid: {
      text: "Start with a letter, then letters, numbers or underscores. Three characters minimum.",
      colour: "var(--danger)",
    },
  };

  return (
    <div>
      <label className="label" htmlFor="username">
        Username
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
          id="username"
          className="field font-mono pl-9"
          maxLength={20}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          disabled={locked}
          value={value}
          aria-describedby="username-hint"
          onChange={(e) =>
            onChange(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
          }
          placeholder="yourname"
        />
      </div>

      <p id="username-hint" className="text-[12px] mt-1.5" style={{ color: hint[state].colour }}>
        {locked
          ? "Your username is fixed now that people may have it."
          : hint[state].text}
      </p>

      <p className="text-[12px] mt-1" style={{ color: "var(--ink-faint)" }}>
        This is what you send to your date so they can find you. Pick something
        you would happily paste into a WhatsApp message.
      </p>
    </div>
  );
}
