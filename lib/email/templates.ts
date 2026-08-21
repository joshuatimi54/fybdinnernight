import {
  BRAND,
  button,
  details,
  escapeHtml,
  paragraph,
  quote,
  wrap,
  type EventBits,
} from "./layout";

export type Rendered = { subject: string; html: string };
type Payload = Record<string, unknown>;

const str = (p: Payload, k: string, fallback = "") =>
  typeof p[k] === "string" && p[k] ? (p[k] as string) : fallback;
const num = (p: Payload, k: string) =>
  typeof p[k] === "number" ? (p[k] as number) : null;

/**
 * Every email the site sends.
 *
 * The wording rule that matters most lives here: `no_longer_available` is the
 * only thing a sender is ever told, whether the person declined, paired with
 * somebody else, or was removed. There is no template that says "declined",
 * and there must never be one.
 */
export function render(
  template: string,
  payload: Payload,
  to: { name: string },
  event: EventBits,
): Rendered | null {
  const name = escapeHtml(to.name || "there");
  const url = event.siteUrl;

  switch (template) {
    // ---------------------------------------------------------- profile --
    case "profile_approved":
      return {
        subject: `You're in — ${event.eventName}`,
        html: wrap({
          preheader: "Your profile is approved. Time to find your date.",
          eyebrow: "Approved",
          heading: "You're on the",
          script: "guest list",
          event,
          body:
            paragraph(`${name}, the committee has approved your profile. You are now visible to the people you can ask — and they can ask you.`) +
            paragraph(`Here is the part that catches people out: <strong style="color:${BRAND.olive};">your seat is not yours yet.</strong> Nobody attends this dinner alone. You need to write someone a love note and get a yes.`) +
            button(`${url}/discover`, "Find your date") +
            paragraph(`Five invitations for the whole event, one waiting for an answer at a time. Make the first one count.`),
          footerNote: `Stuck? Turn on <em>Help me find a date</em> in your profile — it is private, and the committee will pair you before the deadline.`,
        }),
      };

    case "profile_rejected":
      return {
        subject: `One small change to your profile`,
        html: wrap({
          preheader: "The committee sent your profile back with a note.",
          eyebrow: "Almost There",
          heading: "One thing to",
          script: "fix",
          event,
          body:
            paragraph(`${name}, the committee looked at your profile and asked for a change:`) +
            quote(str(payload, "reason", "Please review your profile details.")) +
            paragraph(`Update it and send it back — there is no limit on how many times you can try.`) +
            button(`${url}/onboarding`, "Edit my profile"),
        }),
      };

    // ------------------------------------------------------ invitations --
    case "invitation_received": {
      const from = escapeHtml(str(payload, "from_name", "Someone"));
      const hours = num(payload, "expires_hours") ?? 24;
      return {
        subject: `${from} wrote you a love note`,
        html: wrap({
          preheader: `${from} would like you to be their date. You have ${hours} hours to answer.`,
          eyebrow: "Someone Asked You",
          heading: `${from} wrote you a`,
          script: "love note",
          event,
          body:
            paragraph(`${name}, somebody would like you at their table.`) +
            quote(str(payload, "note"), from) +
            paragraph(`You have <strong style="color:${BRAND.olive};">${hours} hours</strong> to answer. Saying no is completely private — ${from} would only be told you are no longer available, and we never tell anyone who declined whom.`) +
            button(`${url}/invitations`, "Read and answer"),
        }),
      };
    }

    case "invitation_expiring": {
      const from = escapeHtml(str(payload, "from_name", "Someone"));
      return {
        subject: `${from}'s invitation runs out soon`,
        html: wrap({
          preheader: `A few hours left to answer ${from}.`,
          eyebrow: "Running Out",
          heading: `${from} is still`,
          script: "waiting",
          event,
          body:
            paragraph(`${name}, the love note ${from} wrote you expires in a few hours. After that it closes on its own and you both move on.`) +
            paragraph(`No pressure either way — but it would be a shame to miss it simply because it slipped past.`) +
            button(`${url}/invitations`, "Answer now"),
        }),
      };
    }

    // The single wording rule, in the single place it can be written.
    case "no_longer_available": {
      const other = escapeHtml(str(payload, "other_name", "They"));
      return {
        subject: `${other} is no longer available`,
        html: wrap({
          preheader: "Your slot is free again — you can ask someone else.",
          eyebrow: "An Update",
          heading: `${other} is no longer`,
          script: "available",
          event,
          body:
            paragraph(`${name}, ${other} is no longer available for the dinner. That happens — plenty of people are still looking.`) +
            paragraph(`<strong style="color:${BRAND.olive};">Your slot is free again.</strong> You can write to someone else right away.`) +
            button(`${url}/discover`, "Find someone else") +
            paragraph(`Whoever you ask next has no idea this happened. We do not keep score, and nobody ever sees who asked whom.`),
        }),
      };
    }

    case "invitation_expired": {
      const other = escapeHtml(str(payload, "other_name", "They"));
      return {
        subject: `Your invitation to ${other} ran out`,
        html: wrap({
          preheader: "It expired without an answer, and your invitation is back.",
          eyebrow: "Time's Up",
          heading: "That one ran out of",
          script: "time",
          event,
          body:
            paragraph(`${name}, your love note to ${other} expired without an answer.`) +
            paragraph(`Because it lapsed rather than being turned down, <strong style="color:${BRAND.olive};">you have that invitation back</strong> — it did not cost you one.`) +
            button(`${url}/discover`, "Ask someone else"),
        }),
      };
    }

    // ----------------------------------------------------------- paired --
    case "pair_confirmed": {
      const partner = escapeHtml(str(payload, "partner_name", "your date"));
      return {
        subject: `It's settled — you're going with ${partner}`,
        html: wrap({
          preheader: `You and ${partner} are paired. Your pass is ready.`,
          eyebrow: "Confirmed",
          heading: `You're going with`,
          script: partner,
          event,
          body:
            paragraph(`${name}, it is done. You and ${partner} are paired for the ${escapeHtml(event.eventName)}, and your seat is now genuinely yours.`) +
            details([
              { k: "Your date", v: str(payload, "partner_name", "—") },
              { k: "When", v: event.when },
              { k: "Where", v: event.venue },
              { k: "Pass code", v: str(payload, "code", "—") },
            ]) +
            paragraph(`Three things left, and none of them take long:`) +
            paragraph(`<strong style="color:${BRAND.olive};">Write to them.</strong> One message, just for ${partner}. Private between the two of you unless you both say otherwise.<br><br><strong style="color:${BRAND.olive};">Take your table.</strong> Two seats, together — you are never split up.<br><br><strong style="color:${BRAND.olive};">Make your graphic.</strong> Post it, tag us, and we will repost the good ones.`) +
            button(`${url}/dashboard`, "See everything"),
          footerNote: `You can now see each other's contact details on your date page.`,
        }),
      };
    }

    case "matchmaker_match": {
      const other = escapeHtml(str(payload, "other_name", "someone"));
      const toAnswer = payload.to_answer === true;
      return {
        subject: `The committee has a suggestion for you`,
        html: wrap({
          preheader: `We think you and ${other} would make a great table.`,
          eyebrow: "From The Committee",
          heading: `We think you and ${other} would make a great`,
          script: "table",
          event,
          body:
            paragraph(`${name}, this one is from us rather than from anybody who had to work up the courage.`) +
            quote(str(payload, "note", "The FYB committee thinks you two would make a great table."), "The FYB Committee") +
            paragraph(
              toAnswer
                ? `If it sounds good, say yes and you are both sorted. If not, that is completely fine and nobody is told anything.`
                : `${other} has been asked on your behalf. We will let you know either way — and if it is a no, that is all you will hear.`,
            ) +
            button(`${url}/invitations`, toAnswer ? "Take a look" : "See your invitations"),
        }),
      };
    }

    case "pair_dissolved": {
      const reason = str(payload, "reason");
      return {
        subject: `A change to your dinner booking`,
        html: wrap({
          preheader: "Your pairing has been undone — you can find someone else.",
          eyebrow: "A Change",
          heading: "Your pairing has been",
          script: "undone",
          event,
          body:
            paragraph(`${name}, the committee has undone your pairing for the ${escapeHtml(event.eventName)}.`) +
            (reason ? quote(reason, "The FYB Committee") : "") +
            paragraph(`You are back in the room and can ask someone else. If this was not expected, reply to this email and we will sort it out with you.`) +
            button(`${url}/discover`, "Find another date"),
        }),
      };
    }

    case "table_assigned":
      return {
        subject: `Your table: ${str(payload, "table_label", "assigned")}`,
        html: wrap({
          preheader: `You have been seated at ${str(payload, "table_label", "your table")}.`,
          eyebrow: "Your Seats",
          heading: "You're seated at",
          script: str(payload, "table_label", "your table"),
          event,
          body:
            paragraph(`${name}, you and your date have two seats together at <strong style="color:${BRAND.olive};">${escapeHtml(str(payload, "table_label", "your table"))}</strong>.`) +
            details([
              { k: "Table", v: str(payload, "table_label", "—") },
              { k: "When", v: event.when },
              { k: "Where", v: event.venue },
            ]) +
            paragraph(`It is printed on your pass now. Show the QR at the door — a screenshot works fine.`) +
            button(`${url}/pass`, "Open my pass"),
        }),
      };

    // ------------------------------------------------------ the nudge --
    case "still_looking": {
      const days = num(payload, "days_left");
      const others = num(payload, "others_looking") ?? 0;
      const seeking = payload.seeking_help === true;

      const urgency =
        days === null
          ? "There is still time."
          : days <= 0
            ? "Today is the last day."
            : days === 1
              ? "There is one day left."
              : `There are ${days} days left.`;

      return {
        subject:
          days !== null && days <= 2
            ? `${urgency} You still need a date`
            : `Still looking for a date?`,
        html: wrap({
          preheader: `${urgency} ${others} other people are still looking too.`,
          eyebrow: "A Gentle Nudge",
          heading: "You still need a",
          script: "date",
          event,
          body:
            paragraph(`${name}, you are registered and approved — but your seat is not yours yet. No date, no dinner. That is the whole rule.`) +
            paragraph(`<strong style="color:${BRAND.olive};">${urgency}</strong>${others > 0 ? ` And you are not alone: <strong style="color:${BRAND.olive};">${others} other people</strong> are still looking for someone too.` : ""}`) +
            button(`${url}/discover`, "Find your date") +
            (seeking
              ? paragraph(`You have already asked us for help, and we have you on the list. We will pair you before the deadline — but if you spot someone yourself in the meantime, go ahead and ask.`)
              : paragraph(`Would rather not do the asking? Turn on <strong style="color:${BRAND.olive};">Help me find a date</strong> in your profile. It is completely private — only the committee sees it, it never appears on your profile, and we will pair you ourselves before the deadline.`)),
          footerNote: `Nobody who wants to come gets left out. If you are stuck, just reply to this email.`,
        }),
      };
    }

    case "event_reminder":
      return {
        subject: `Tomorrow: ${event.eventName}`,
        html: wrap({
          preheader: `${event.when} — bring your pass.`,
          eyebrow: "Tomorrow",
          heading: "It's almost",
          script: "time",
          event,
          body:
            paragraph(`${name}, the ${escapeHtml(event.eventName)} is tomorrow.`) +
            details([
              { k: "When", v: event.when },
              { k: "Where", v: event.venue },
              { k: "Your table", v: str(payload, "table_label", "Assigned on arrival") },
            ]) +
            paragraph(`Bring your pass — a screenshot on your phone is perfectly fine. We will scan it at the door.`) +
            button(`${url}/pass`, "Open my pass"),
        }),
      };

    default:
      return null;
  }
}

export const TEMPLATE_NAMES = [
  "profile_approved",
  "profile_rejected",
  "invitation_received",
  "invitation_expiring",
  "no_longer_available",
  "invitation_expired",
  "pair_confirmed",
  "matchmaker_match",
  "pair_dissolved",
  "table_assigned",
  "still_looking",
  "event_reminder",
] as const;
