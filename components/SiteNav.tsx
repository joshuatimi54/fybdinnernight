"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "/#how", label: "How It Works" },
  { href: "/#couples", label: "The Couples" },
  { href: "/#notes", label: "Love Notes" },
  { href: "/#guests", label: "Guests" },
  { href: "/#details", label: "The Night" },
];

export default function SiteNav({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [lifted, setLifted] = useState(false);

  useEffect(() => {
    const onScroll = () => setLifted(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className="sticky top-0 z-50 transition-[background-color,border-color,box-shadow] duration-300"
      style={{
        background: lifted
          ? "color-mix(in srgb, var(--paper) 94%, transparent)"
          : "transparent",
        borderBottom: `1px solid ${lifted ? "var(--rule)" : "transparent"}`,
        backdropFilter: lifted ? "blur(10px)" : "none",
      }}
    >
      <div className="max-w-[1240px] mx-auto px-5 sm:px-9 h-[74px] flex items-center justify-between gap-6">
        {/* ------------------------------------------------------- wordmark */}
        <Link href="/" className="flex flex-col leading-none shrink-0 group">
          <span
            className="font-display text-[22px] tracking-[0.16em] uppercase"
            style={{ color: "var(--olive)" }}
          >
            FYB
          </span>
          <span
            className="text-[8px] tracking-[0.34em] uppercase mt-0.5"
            style={{ color: "var(--gold)" }}
          >
            Dinner Night
          </span>
        </Link>

        {/* ----------------------------------------------------------- links */}
        <nav className="hidden lg:flex items-center gap-8">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-[11px] tracking-[0.18em] uppercase transition-colors"
              style={{ color: "var(--ink-soft)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--gold)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--ink-soft)")}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden lg:flex items-center gap-3 shrink-0">
          <Link href={signedIn ? "/continue" : "/login"} className="btn btn-primary">
            {signedIn ? "My Dinner" : "Register"}
          </Link>
        </div>

        {/* ---------------------------------------------------------- burger */}
        <button
          type="button"
          className="lg:hidden flex flex-col gap-[5px] p-2 -mr-2"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="site-menu"
          onClick={() => setOpen((v) => !v)}
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="block h-px w-[22px] transition-transform duration-300"
              style={{
                background: "var(--olive)",
                transform: open
                  ? i === 0
                    ? "translateY(6px) rotate(45deg)"
                    : i === 2
                      ? "translateY(-6px) rotate(-45deg)"
                      : "scaleX(0)"
                  : "none",
                opacity: open && i === 1 ? 0 : 1,
              }}
            />
          ))}
        </button>
      </div>

      {open ? (
        <nav
          id="site-menu"
          className="lg:hidden border-t px-5 py-6 flex flex-col gap-1"
          style={{ background: "var(--paper)", borderColor: "var(--rule)" }}
        >
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="py-3 text-[12px] tracking-[0.18em] uppercase border-b"
              style={{ color: "var(--ink-soft)", borderColor: "var(--rule)" }}
            >
              {l.label}
            </Link>
          ))}
          <Link
            href={signedIn ? "/continue" : "/login"}
            onClick={() => setOpen(false)}
            className="btn btn-primary mt-4"
          >
            {signedIn ? "My Dinner" : "Register"}
          </Link>
        </nav>
      ) : null}
    </header>
  );
}
