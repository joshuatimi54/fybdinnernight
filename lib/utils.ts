import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatEventDate(iso: string | null): string {
  if (!iso) return "Date to be announced";
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatShortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

/** "3 hours left", "12 hours left", "Expired" — for invitation countdowns. */
export function timeLeft(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "Expired";

  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} left`;
  }
  if (hours >= 1) return `${hours} hour${hours === 1 ? "" : "s"} left`;

  const minutes = Math.max(1, Math.floor(ms / 60_000));
  return `${minutes} minute${minutes === 1 ? "" : "s"} left`;
}

export function fullName(first: string, last: string): string {
  return [first, last].filter(Boolean).join(" ").trim() || "Someone";
}

export function initials(first: string, last?: string): string {
  return [first?.[0], last?.[0]].filter(Boolean).join("").toUpperCase() || "?";
}

/**
 * Cloudinary face-aware square crop. Falls back to the raw URL for anything
 * not hosted on Cloudinary, so seeded and legacy photos still render.
 */
export function avatarUrl(url: string | null, size = 400): string | null {
  if (!url) return null;
  if (!url.includes("res.cloudinary.com") || !url.includes("/upload/")) return url;
  return url.replace(
    "/upload/",
    `/upload/c_fill,g_face,w_${size},h_${size},q_auto,f_auto/`,
  );
}

/**
 * Deliberately conservative: it only ever gates a message from PUBLIC reuse,
 * never from reaching the person it was written for, and a human makes the
 * final call in the moderation queue.
 */
const FLAGGED = [
  "fuck", "shit", "bitch", "bastard", "asshole", "dick", "pussy", "cunt",
  "whore", "slut", "nigga", "nigger", "faggot", "rape", "kill yourself",
];

export function looksFlagged(text: string): boolean {
  const normalised = text.toLowerCase().replace(/[^a-z\s]/g, "");
  return FLAGGED.some((word) => new RegExp(`\\b${word}\\b`).test(normalised));
}

export function pluralise(n: number, one: string, many?: string): string {
  return `${n} ${n === 1 ? one : (many ?? `${one}s`)}`;
}
