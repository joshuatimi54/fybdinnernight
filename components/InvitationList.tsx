"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { avatarUrl, initials, timeLeft } from "@/lib/utils";
import { friendlyError } from "@/lib/errors";
import { respondToInvitation, withdrawInvitation } from "@/app/actions/invitations";

export type FeedItem = {
  id: string;
  direction: "received" | "sent";
  counterpart_id: string;
  first_name: string;
  last_initial: string;
  photo_url: string | null;
  department: string | null;
  note: string;
  status: string;
  source: "user" | "matchmaker";
  expires_at: string;
  created_at: string;
};

/** Wording for a finished invitation, from the perspective of whoever sees it. */
function outcome(item: FeedItem): { label: string; tone: string } {
  if (item.direction === "sent") {
    switch (item.status) {
      case "accepted":
        return { label: "They said yes", tone: "pill-good" };
      case "closed":
        // Declined and voided are indistinguishable by design.
        return { label: "No longer available", tone: "pill-quiet" };
      case "expired":
        return { label: "Ran out of time", tone: "pill-quiet" };
      case "withdrawn":
        return { label: "You withdrew it", tone: "pill-quiet" };
      default:
        return { label: item.status, tone: "pill-quiet" };
    }
  }

  switch (item.status) {
    case "accepted":
      return { label: "You said yes", tone: "pill-good" };
    case "declined":
      return { label: "You passed", tone: "pill-quiet" };
    case "expired":
      return { label: "Expired", tone: "pill-quiet" };
    case "withdrawn":
      return { label: "Withdrawn", tone: "pill-quiet" };
    case "voided":
      return { label: "No longer available", tone: "pill-quiet" };
    default:
      return { label: item.status, tone: "pill-quiet" };
  }
}

function Face({ url, name }: { url: string | null; name: string }) {
  const src = avatarUrl(url, 160);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="w-14 h-14 rounded-full object-cover border border-rule-strong" />
  ) : (
    <div
      className="w-14 h-14 rounded-full grid place-items-center border border-rule-strong font-display text-lg"
      style={{ background: "var(--ivory-warm)", color: "var(--ink-faint)" }}
    >
      {initials(name)}
    </div>
  );
}

export default function InvitationList({ items }: { items: FeedItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<FeedItem | null>(null);

  const live = items.filter((i) => i.status === "pending");
  const received = live.filter((i) => i.direction === "received");
  const sent = live.filter((i) => i.direction === "sent");
  const history = items.filter((i) => i.status !== "pending");

  function respond(item: FeedItem, accept: boolean) {
    startTransition(async () => {
      const res = await respondToInvitation(item.id, accept);

      if (!res.ok) {
        toast.error(res.error);
        return;
      }

      if (res.accepted) {
        toast.success(`You and ${item.first_name} are paired.`);
        router.push("/pair");
        router.refresh();
        return;
      }

      if (res.reason === "DECLINED") {
        toast.success("Passed. They're only told you're no longer available.");
      } else {
        toast.message(friendlyError(res.reason));
      }
      setConfirming(null);
      router.refresh();
    });
  }

  function withdraw(item: FeedItem) {
    startTransition(async () => {
      const res = await withdrawInvitation(item.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Withdrawn. Your slot is free again.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-12">
      {/* ------------------------------------------------------- received */}
      <section className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <span className="eyebrow">Waiting on you</span>
          <h2 className="text-3xl">
            {received.length === 0
              ? "Nothing to answer"
              : received.length === 1
                ? "Someone asked you"
                : `${received.length} people asked you`}
          </h2>
        </div>

        {received.length === 0 ? (
          <p className="text-ink-soft text-[15px] max-w-[52ch]">
            When somebody invites you, it lands here. You can take as long as
            you like within the window — and saying no costs you nothing.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {received.map((item) => (
              <li key={item.id} className="card p-5 flex flex-col gap-4">
                <div className="flex items-start gap-4">
                  <Face url={item.photo_url} name={item.first_name} />
                  <div className="flex flex-col gap-1 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-2xl leading-none">
                        {item.first_name} {item.last_initial}
                      </h3>
                      {item.source === "matchmaker" ? (
                        <span className="pill pill-gold">Committee suggestion</span>
                      ) : null}
                    </div>
                    {item.department ? (
                      <p className="text-[12px] text-ink-faint">{item.department}</p>
                    ) : null}
                    <p className="text-[12px] numeric" style={{ color: "var(--gold)" }}>
                      {timeLeft(item.expires_at)}
                    </p>
                  </div>
                </div>

                <blockquote
                  className="text-[15px] leading-relaxed pl-4 border-l-2"
                  style={{ borderColor: "var(--olive)" }}
                >
                  {item.note}
                </blockquote>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={pending}
                    onClick={() => setConfirming(item)}
                  >
                    Yes, be my date
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={pending}
                    onClick={() => respond(item, false)}
                  >
                    Not this time
                  </button>
                </div>

                <p className="text-[12px] text-ink-faint">
                  If you pass, {item.first_name} is only told you&apos;re no
                  longer available. We never say who declined whom.
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ----------------------------------------------------------- sent */}
      {sent.length > 0 ? (
        <section className="flex flex-col gap-5 border-t border-rule pt-10">
          <div className="flex flex-col gap-2">
            <span className="eyebrow">Waiting on them</span>
            <h2 className="text-3xl">You asked</h2>
          </div>

          <ul className="flex flex-col gap-4">
            {sent.map((item) => (
              <li key={item.id} className="card p-5 flex flex-col gap-4">
                <div className="flex items-start gap-4">
                  <Face url={item.photo_url} name={item.first_name} />
                  <div className="flex flex-col gap-1 flex-1">
                    <h3 className="font-display text-2xl leading-none">
                      {item.first_name} {item.last_initial}
                    </h3>
                    <p className="text-[12px] numeric" style={{ color: "var(--gold)" }}>
                      {timeLeft(item.expires_at)}
                    </p>
                  </div>
                </div>

                <blockquote className="text-[14px] text-ink-soft leading-relaxed pl-4 border-l-2 border-rule">
                  {item.note}
                </blockquote>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={pending}
                    onClick={() => withdraw(item)}
                  >
                    Withdraw
                  </button>
                  <p className="text-[12px] text-ink-faint">
                    Frees your slot to ask someone else — but it doesn&apos;t
                    give the invitation back.
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* -------------------------------------------------------- history */}
      {history.length > 0 ? (
        <section className="flex flex-col gap-5 border-t border-rule pt-10">
          <span className="eyebrow">Earlier</span>
          <ul className="flex flex-col gap-px bg-rule border border-rule">
            {history.map((item) => {
              const o = outcome(item);
              return (
                <li
                  key={item.id}
                  className="bg-ivory p-4 flex flex-wrap items-center gap-3 justify-between"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-[14px] truncate">
                      {item.direction === "sent" ? "You asked" : "Asked you"} ·{" "}
                      {item.first_name} {item.last_initial}
                    </span>
                  </div>
                  <span className={`pill ${o.tone}`}>{o.label}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* ------------------------------------------------------- confirm */}
      {confirming ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center p-5"
          style={{ background: "color-mix(in srgb, var(--olive-deep) 85%, transparent)" }}
          role="dialog"
          aria-modal="true"
          aria-label="Confirm your date"
        >
          <div className="card p-6 w-full max-w-[400px] flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <span className="eyebrow">This is the moment</span>
              <h3 className="text-3xl">
                {confirming.first_name} is your date?
              </h3>
              <p className="text-[14px] text-ink-soft leading-relaxed">
                Saying yes pairs you for the night. Every other invitation
                waiting for you closes, and your pass unlocks straight away.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                className="btn btn-primary"
                disabled={pending}
                onClick={() => respond(confirming, true)}
              >
                {pending ? "Confirming…" : "Yes — pair us"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={pending}
                onClick={() => setConfirming(null)}
              >
                Wait
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
