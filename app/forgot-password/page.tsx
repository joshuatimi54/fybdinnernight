"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const address = email.trim().toLowerCase();
    if (!address.includes("@")) {
      toast.error("Enter a valid email address.");
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(address, {
      // Deliberately window.location.origin, not NEXT_PUBLIC_SITE_URL: the
      // PKCE verifier is stored per-origin, so the link has to come back to
      // the same host the request was made from or the exchange cannot work.
      redirectTo: `${window.location.origin}/auth/callback?next=/update-password`,
    });
    setBusy(false);

    // Deliberately identical whether or not the address exists — otherwise
    // this page becomes a way to find out who has registered.
    if (error && !/rate limit|too many/i.test(error.message)) {
      console.error("Password reset failed:", error.message);
    }
    if (error && /rate limit|too many/i.test(error.message)) {
      toast.error("Too many attempts. Wait a minute and try again.");
      return;
    }

    setSent(true);
  }

  return (
    <main className="min-h-dvh grid place-items-center px-5 py-16">
      <div className="w-full max-w-[430px] flex flex-col gap-8 rise">
        <div className="flex flex-col gap-4">
          <Link href="/login" className="eyebrow hover:opacity-80">
            ← Back to sign in
          </Link>
          <h1 className="text-[clamp(2.2rem,7.5vw,3rem)] leading-[1.05]">
            {sent ? (
              <>
                Check your
                <span className="script text-[clamp(2.8rem,9vw,4rem)] ml-3">email</span>
              </>
            ) : (
              <>
                Forgotten
                <span className="script text-[clamp(2.8rem,9vw,4rem)] ml-3">password</span>
              </>
            )}
          </h1>
        </div>

        {sent ? (
          <>
            <p className="text-[15px] leading-[1.85]" style={{ color: "var(--ink-soft)" }}>
              If there&apos;s an account for <strong style={{ color: "var(--olive)" }}>{email.trim().toLowerCase()}</strong>,
              we&apos;ve sent it a link to set a new password. It&apos;s good for one hour.
            </p>
            <p className="text-[13.5px] leading-[1.8]" style={{ color: "var(--ink-faint)" }}>
              Nothing arriving? Check spam. If it still doesn&apos;t come, tell
              the committee — password emails are our setup, not something you
              can fix from your side.
            </p>
            <Link href="/login" className="btn btn-ghost self-start">
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <p className="text-[15px] leading-[1.85]" style={{ color: "var(--ink-soft)" }}>
              Type your email and we&apos;ll send you a link to set a new one.
            </p>
            <form onSubmit={submit} className="flex flex-col gap-5">
              <div>
                <label className="label" htmlFor="email">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  required
                  autoFocus
                  className="field"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? "Sending…" : "Send me a link"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
