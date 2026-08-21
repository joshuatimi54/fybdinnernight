"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

const MIN_PASSWORD = 8;

/** Supabase phrases these for developers; guests need something else. */
function readableAuthError(message: string, mode: Mode): string {
  const m = message.toLowerCase();

  if (m.includes("invalid login credentials")) {
    return "That email and password don't match. Check them, or create an account.";
  }
  if (m.includes("already registered") || m.includes("already been registered")) {
    return "You already have an account with that email. Sign in instead.";
  }
  if (m.includes("email not confirmed")) {
    return "Your email hasn't been confirmed yet. Tell the committee — this is our setup, not you.";
  }
  if (m.includes("password should be")) {
    return `Your password needs to be at least ${MIN_PASSWORD} characters.`;
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Too many attempts. Wait a minute and try again.";
  }
  if (m.includes("invalid email")) {
    return "That doesn't look like a valid email address.";
  }
  return mode === "signup"
    ? "We couldn't create your account. Try again in a moment."
    : "We couldn't sign you in. Try again in a moment.";
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");

  // ?mode=signup lands straight on the create-account tab, so "Register" and
  // "Sign in" can be two separate doors that both come here.
  const [mode, setMode] = useState<Mode>(
    params.get("mode") === "signup" ? "signup" : "signin",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    const address = email.trim().toLowerCase();
    if (!address.includes("@")) {
      toast.error("Enter a valid email address.");
      return;
    }
    if (password.length < MIN_PASSWORD) {
      toast.error(`Your password needs to be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (mode === "signup" && password !== confirm) {
      toast.error("Those two passwords don't match.");
      return;
    }

    setBusy(true);
    const supabase = createClient();

    const { data, error } =
      mode === "signup"
        ? await supabase.auth.signUp({ email: address, password })
        : await supabase.auth.signInWithPassword({ email: address, password });

    if (error) {
      setBusy(false);
      toast.error(readableAuthError(error.message, mode));
      return;
    }

    // With email confirmation switched on, signUp returns a user but no
    // session — there is nothing to redirect into yet.
    if (mode === "signup" && !data.session) {
      setBusy(false);
      toast.success("Account created. Check your email to confirm it, then sign in.");
      setMode("signin");
      setPassword("");
      setConfirm("");
      return;
    }

    router.push(next ?? "/continue");
    router.refresh();
  }

  const isSignup = mode === "signup";

  return (
    <main className="min-h-dvh grid place-items-center px-5 py-16">
      <div className="w-full max-w-[430px] flex flex-col gap-9 rise">
        <div className="flex flex-col gap-4">
          <Link href="/" className="eyebrow hover:opacity-80">
            ← FYB Dinner Night
          </Link>
          <h1 className="text-[clamp(2.3rem,8vw,3.2rem)] leading-[1.05]">
            {isSignup ? (
              <>
                Reserve
                <span className="script text-[clamp(3rem,10vw,4.2rem)] ml-3">your seat</span>
              </>
            ) : (
              <>
                Welcome
                <span className="script text-[clamp(3rem,10vw,4.2rem)] ml-3">back</span>
              </>
            )}
          </h1>
          <p className="text-[15px] leading-[1.85]" style={{ color: "var(--ink-soft)" }}>
            {isSignup
              ? "One account, one seat. You'll need a date before it's yours."
              : "Sign in to see your invitations, your date and your pass."}
          </p>
        </div>

        {/* ------------------------------------------------------- tabs */}
        <div
          className="grid grid-cols-2"
          style={{ border: "1px solid var(--rule-strong)" }}
          role="tablist"
        >
          {(
            [
              { id: "signin" as const, label: "Sign in" },
              { id: "signup" as const, label: "Create account" },
            ]
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={mode === t.id}
              disabled={busy}
              onClick={() => setMode(t.id)}
              className="py-3 text-[13px] font-semibold tracking-[0.06em] transition-colors"
              style={{
                background: mode === t.id ? "var(--olive)" : "transparent",
                color: mode === t.id ? "var(--ivory)" : "var(--ink-soft)",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

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
              className="field"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </div>

          <div>
            <div className="flex items-baseline justify-between gap-3">
              <label className="label" htmlFor="password">
                Password
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
              autoComplete={isSignup ? "new-password" : "current-password"}
              required
              minLength={MIN_PASSWORD}
              className="field"
              placeholder={isSignup ? `At least ${MIN_PASSWORD} characters` : "Your password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </div>

          {isSignup ? (
            <div>
              <label className="label" htmlFor="confirm">
                Confirm password
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
                disabled={busy}
              />
              {confirm.length > 0 && confirm !== password ? (
                <p className="text-[12px] mt-1.5" style={{ color: "var(--danger)" }}>
                  Those don&apos;t match yet.
                </p>
              ) : null}
            </div>
          ) : null}

          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy
              ? isSignup
                ? "Creating…"
                : "Signing in…"
              : isSignup
                ? "Create my account"
                : "Sign in"}
          </button>

          {!isSignup ? (
            <Link
              href="/forgot-password"
              className="text-[13px] text-center hover:underline"
              style={{ color: "var(--ink-soft)" }}
            >
              Forgotten your password?
            </Link>
          ) : null}
        </form>

        <p
          className="text-[13px] leading-[1.8] pt-6"
          style={{ color: "var(--ink-faint)", borderTop: "1px solid var(--rule)" }}
        >
          {isSignup
            ? "Your surname, phone and email stay hidden from other guests until you and your date have both said yes."
            : "New here? Create an account — registration takes about a minute and there is no approval queue."}
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-dvh" />}>
      <LoginForm />
    </Suspense>
  );
}
