/**
 * The database raises short codes; the wording lives here.
 *
 * Keeping every sentence in one file is what makes the decline rule
 * enforceable. A declined invitation and a recipient who paired with someone
 * else both surface as "no longer available" — the sender is never told they
 * were turned down, and there is no second place in the codebase where that
 * could accidentally be phrased differently.
 */
const MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: "Please sign in first.",
  FORBIDDEN: "You don't have access to that.",

  // Registration & profile
  REGISTRATION_CLOSED: "Registration has closed for this event.",
  ALREADY_APPROVED: "Your profile is already approved.",
  NAME_REQUIRED: "Add your first name and surname.",
  GENDER_REQUIRED: "Select whether you're attending as a gentleman or a lady.",
  PHONE_REQUIRED: "Add a phone number so the committee can reach you.",
  PHOTO_REQUIRED: "Add a photo to finish your profile.",
  GENDER_LOCKED: "Gender can't be changed after your profile is approved.",
  PROFILE_NOT_FOUND: "We couldn't find that profile.",
  NOT_APPROVED: "Your profile is still being reviewed.",

  // Discovery
  DISCOVERY_CLOSED: "Finding dates is closed for now.",
  DEADLINE_PASSED: "The deadline for finding a date has passed.",

  // Invitations
  SELF_INVITE: "You can't invite yourself.",
  NOTE_LENGTH: "Your love note is the wrong length.",
  NOTE_TOO_SHORT: "Write a little more — a real note is what gets you a yes.",
  NOTE_TOO_LONG: "That note is longer than we can send. Trim it a little.",
  SENDER_NOT_APPROVED: "Your profile needs to be approved before you can invite anyone.",
  SENDER_PAIRED: "You already have a date.",
  GENDER_MISSING: "Set your gender on your profile first.",
  SAME_GENDER: "Invitations are between a gentleman and a lady.",
  LIFETIME_CAP: "You've used all of your invitations. Talk to the committee if you're stuck.",
  OUTSTANDING_CAP: "You already have an invitation waiting for an answer. Withdraw it to send another.",
  ALREADY_PENDING: "You've already invited them — give them a little time.",
  INVITE_NOT_FOUND: "We couldn't find that invitation.",
  NOT_YOURS: "That invitation isn't yours.",
  NOT_PENDING: "That invitation has already been answered.",

  // Deliberately identical wording. A recipient who declined, paired with
  // someone else, was un-approved or blocked all read the same from outside.
  RECIPIENT_UNAVAILABLE: "They're no longer available.",
  SENDER_ALREADY_PAIRED: "They're no longer available.",
  BLOCKED: "They're no longer available.",

  INVITE_EXPIRED: "That invitation ran out of time. Your slot is free again.",
  ALREADY_PAIRED: "You already have a date.",

  // Seating
  NOT_PAIRED: "You need a confirmed date before you can pick a table.",
  SEAT_SELECTION_OFF: "The committee is assigning tables for this event.",
  TABLE_UNAVAILABLE: "That table isn't available.",
  TABLE_FULL: "That table just filled up. Pick another one.",
  PAIR_NOT_FOUND: "We couldn't find that pair.",
  NOT_CONFIRMED: "That pair isn't confirmed.",

  // Door
  PASS_NOT_FOUND: "No pass matches that code.",
  BAD_SIDE: "Choose who is checking in.",
};

const FALLBACK = "Something went wrong. Please try again.";

/** Turn any thrown value — Supabase error, Error, string — into a sentence. */
export function friendlyError(err: unknown): string {
  const raw =
    typeof err === "string"
      ? err
      : err && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message ?? "")
        : "";

  if (!raw) return FALLBACK;

  // Postgres prefixes raised messages in some transports.
  const code = raw.trim().replace(/^.*\b([A-Z][A-Z_]{3,})\b.*$/s, "$1");
  return MESSAGES[code] ?? MESSAGES[raw.trim()] ?? FALLBACK;
}

/** True when the code is one we have deliberate wording for. */
export function isKnownError(err: unknown): boolean {
  return friendlyError(err) !== FALLBACK;
}
