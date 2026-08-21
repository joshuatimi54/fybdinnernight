"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/app/actions/profile";
import { cn } from "@/lib/utils";

export type NavProfile = {
  firstName: string;
  isAdmin: boolean;
  paired: boolean;
  approved: boolean;
  pendingInvites: number;
};

export default function AppNav({ profile }: { profile: NavProfile }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const links = profile.approved
    ? [
        { href: "/dashboard", label: "My Dinner" },
        ...(profile.paired
          ? [{ href: "/pair", label: "Your Date" }]
          : [{ href: "/discover", label: "Discover" }]),
        { href: "/invitations", label: "Invitations", badge: profile.pendingInvites },
        ...(profile.paired
          ? [
              { href: "/seating", label: "Your Table" },
              { href: "/pass", label: "Pass" },
              { href: "/share", label: "Share" },
            ]
          : []),
      ]
    : [];

  return (
    <header className="border-b border-rule sticky top-0 z-40 backdrop-blur-md"
      style={{ background: "color-mix(in srgb, var(--ivory) 88%, transparent)" }}
    >
      <div className="max-w-[1240px] mx-auto px-5 sm:px-9 h-[68px] flex items-center justify-between gap-4">
        <Link href="/dashboard" className="flex flex-col leading-none shrink-0">
          <span
            className="font-display text-[20px] tracking-[0.16em] uppercase"
            style={{ color: "var(--olive)" }}
          >
            FYB
          </span>
          <span
            className="text-[8px] tracking-[0.32em] uppercase mt-0.5"
            style={{ color: "var(--gold)" }}
          >
            Dinner Night
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {links.map((l) => (
            <NavLink key={l.href} {...l} active={pathname === l.href} />
          ))}
          {profile.isAdmin ? (
            <NavLink href="/admin" label="Admin" active={pathname.startsWith("/admin")} />
          ) : null}
          <form action={signOut}>
            <button type="submit" className="btn btn-quiet text-[13px]">
              Sign out
            </button>
          </form>
        </nav>

        <button
          type="button"
          className="btn btn-quiet md:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Close" : "Menu"}
          {!open && profile.pendingInvites > 0 ? (
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: "var(--gold)" }}
              aria-label={`${profile.pendingInvites} waiting`}
            />
          ) : null}
        </button>
      </div>

      {open ? (
        <nav
          id="mobile-nav"
          className="md:hidden border-t border-rule flex flex-col p-3 gap-1"
          style={{ background: "var(--ivory)" }}
        >
          {links.map((l) => (
            <NavLink
              key={l.href}
              {...l}
              active={pathname === l.href}
              onClick={() => setOpen(false)}
              block
            />
          ))}
          {profile.isAdmin ? (
            <NavLink
              href="/admin"
              label="Admin"
              active={pathname.startsWith("/admin")}
              onClick={() => setOpen(false)}
              block
            />
          ) : null}
          <form action={signOut}>
            <button type="submit" className="btn btn-quiet w-full justify-start">
              Sign out
            </button>
          </form>
        </nav>
      ) : null}
    </header>
  );
}

function NavLink({
  href,
  label,
  badge,
  active,
  onClick,
  block,
}: {
  href: string;
  label: string;
  badge?: number;
  active: boolean;
  onClick?: () => void;
  block?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "px-3 py-2 text-[13px] font-semibold rounded-[2px] flex items-center gap-2 transition-colors",
        block && "w-full",
        active ? "text-ink" : "text-ink-soft hover:text-ink",
      )}
      style={active ? { background: "var(--ivory-warm)" } : undefined}
    >
      {label}
      {badge ? (
        <span
          className="numeric text-[10px] px-1.5 py-0.5 rounded-[2px] leading-none"
          style={{ background: "var(--olive)", color: "#FBF8F2" }}
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
