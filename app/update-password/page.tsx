"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

const MIN_PASSWORD = 8;

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState<boolean | null>(null);

  // The reset link is exchanged for a session by /auth/callback before we get
  // here. No session means the link was stale or already used.
  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => setReady(Boolean(data.user)));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    if (password.length < MIN_PASSWORD) {
      toast.error(`Your password needs to be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (password !== confirm) {
      toast.error("Those two passwords don't match.");
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (error) {
      toast.error(
        /should be|weak/i.test(error.message)
          ? `Your password needs to be at least ${MIN_PASSWORD} characters.`
          : "We couldn't change your password. Request a fresh link and try again.",
      );
      return;
    }

    toast.success("Password changed.");
    router.push("/continue");
    router.refresh();
  }

  if (ready === false) {
    return (
      <main className="min-h-dvh grid place-items-center px-5 py-16">
        <div className="w-full max-w-[430px] flex flex-col gap-6 rise">
          <h1 className="text-[clamp(2.2rem,7.5vw,3rem)] leading-[1.05]">
            That link has
            <span className="script text-[clamp(2.8rem,9vw,4rem)] ml-3">expired</span>
          </h1>
          <p className="text-[15px] leading-[1.85]" style={{ color: "var(--ink-soft)" }}>
            Reset links last an hour and work once. Ask for a fresh one.
          </p>
          <Link href="/forgot-password" className="btn btn-primary self-start">
            Send me a new link
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh grid place-items-center px-5 py-16">
      <div className="w-full max-w-[430px] flex flex-col gap-8 rise">
        <div className="flex flex-col gap-4">
          <span className="eyebrow">Almost there</span>
          <h1 className="text-[clamp(2.2rem,7.5vw,3rem)] leading-[1.05]">
            Choose a new
            <span className="script text-[clamp(2.8rem,9vw,4rem)] ml-3">password</span>
          </h1>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-5">
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <label className="label" htmlFor="password">
                New password
              </label>
              <button
                type="button"
                className="text-[11px] tracking-[0.1em] uppercase mb-[7px]"
                style={{ color: "var(--gold)" }}
                onClick={() => setShow((v) => !v)}
              >
                {show ? "Hide" : "Show"}
              </button>
            </div>
            <input
              id="password"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD}
              autoFocus
              className="field"
              placeholder={`At least ${MIN_PASSWORD} characters`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy || ready === null}
            />
          </div>

          <div>
            <label className="label" htmlFor="confirm">
              Confirm it
            </label>
            <input
              id="confirm"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              required
              className="field"
              placeholder="Type it once more"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={busy || ready === null}
            />
            {confirm.length > 0 && confirm !== password ? (
              <p className="text-[12px] mt-1.5" style={{ color: "var(--danger)" }}>
                Those don&apos;t match yet.
              </p>
            ) : null}
          </div>

          <button type="submit" className="btn btn-primary" disabled={busy || ready === null}>
            {busy ? "Saving…" : "Save my password"}
          </button>
        </form>
      </div>
    </main>
  );
}
