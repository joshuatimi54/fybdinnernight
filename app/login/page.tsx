"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    const address = email.trim().toLowerCase();
    if (!address.includes("@")) {
      toast.error("Enter a valid email address.");
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: { shouldCreateUser: true },
    });
    setBusy(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setEmail(address);
    setStep("code");
    toast.success("Check your email for a six-digit code.");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    const token = code.replace(/\D/g, "");
    if (token.length !== 6) {
      toast.error("Enter the six digits from your email.");
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });

    if (error) {
      setBusy(false);
      toast.error("That code didn't work. Check it, or send a new one.");
      return;
    }

    router.push(next ?? "/continue");
    router.refresh();
  }

  return (
    <main className="min-h-dvh grid place-items-center px-5 py-16">
      <div className="w-full max-w-[420px] flex flex-col gap-9 rise">
        <div className="flex flex-col gap-4">
          <Link href="/" className="eyebrow hover:opacity-80">
            ← FYB Dinner Night
          </Link>
          <h1 className="text-[clamp(2.4rem,9vw,3.4rem)] leading-[0.95]">
            {step === "email" ? (
              <>
                Let&apos;s get you
                <br />
                <em style={{ color: "var(--gold)" }}>a seat.</em>
              </>
            ) : (
              <>
                Check your
                <br />
                <em style={{ color: "var(--gold)" }}>email.</em>
              </>
            )}
          </h1>
          <p className="text-ink-soft">
            {step === "email"
              ? "We'll email you a six-digit code. No password to remember."
              : `We sent a code to ${email}. It's good for the next hour.`}
          </p>
        </div>

        {step === "email" ? (
          <form onSubmit={sendCode} className="flex flex-col gap-5">
            <div>
              <label className="label" htmlFor="email">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                autoFocus
                required
                className="field"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Sending…" : "Send my code"}
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="flex flex-col gap-5">
            <div>
              <label className="label" htmlFor="code">
                Six-digit code
              </label>
              <input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
                maxLength={6}
                className="field numeric text-center text-2xl tracking-[0.4em]"
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                disabled={busy}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Checking…" : "Verify and continue"}
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              disabled={busy}
              onClick={() => {
                setStep("email");
                setCode("");
              }}
            >
              Use a different email
            </button>
          </form>
        )}

        <p className="text-[13px] text-ink-faint leading-relaxed border-t border-rule pt-6">
          We use a code rather than a link because links open in the wrong
          browser when you tap them from WhatsApp — and then nothing works.
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
