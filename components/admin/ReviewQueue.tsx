"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { reviewProfile } from "@/app/actions/admin";
import { avatarUrl, fullName, initials } from "@/lib/utils";
import type { Profile } from "@/lib/types";

const QUICK_REASONS = [
  "We can't see your face clearly — please use a different photo.",
  "Please use a photo of just yourself.",
  "Your name doesn't match our fellowship records.",
  "Please complete your prompt answers.",
];

export default function ReviewQueue({ profiles }: { profiles: Profile[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState<Profile | null>(null);
  const [reason, setReason] = useState("");

  function approve(p: Profile) {
    startTransition(async () => {
      const res = await reviewProfile(p.id, true);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${p.first_name} is approved.`);
      router.refresh();
    });
  }

  function reject() {
    if (!rejecting) return;
    if (!reason.trim()) {
      toast.error("Give them a reason so they know what to fix.");
      return;
    }

    startTransition(async () => {
      const res = await reviewProfile(rejecting.id, false, reason.trim());
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Sent back with your note.");
      setRejecting(null);
      setReason("");
      router.refresh();
    });
  }

  if (profiles.length === 0) {
    return (
      <div className="card p-10 text-center flex flex-col gap-2 items-center">
        <h3 className="text-2xl">Queue is clear</h3>
        <p className="text-ink-soft">Nothing waiting for review.</p>
      </div>
    );
  }

  return (
    <>
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {profiles.map((p) => {
          const photo = avatarUrl(p.photo_url, 480);
          const prompts = Array.isArray(p.prompts) ? p.prompts.filter((x) => x.a) : [];

          return (
            <li key={p.id} className="card flex flex-col overflow-hidden">
              <div className="aspect-[4/5] bg-ivory-warm">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full grid place-items-center font-display text-5xl text-ink-faint">
                    {initials(p.first_name, p.last_name)}
                  </div>
                )}
              </div>

              <div className="p-4 flex flex-col gap-3 flex-1">
                <div className="flex flex-col gap-1">
                  <h3 className="font-display text-2xl leading-none">
                    {fullName(p.first_name, p.last_name)}
                  </h3>
                  <p className="text-[12px] text-ink-faint">
                    {[
                      p.gender === "male" ? "Gentleman" : p.gender === "female" ? "Lady" : "No gender",
                      p.department,
                      p.level,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <p className="text-[12px] numeric text-ink-faint break-all">
                    {p.phone} · {p.email}
                  </p>
                </div>

                {p.bio ? <p className="text-[14px] text-ink-soft">{p.bio}</p> : null}

                {prompts.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {prompts.map((x, i) => (
                      <div key={i} className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">
                          {x.q}
                        </span>
                        <p className="text-[13px]">{x.a}</p>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="flex gap-2 mt-auto pt-2">
                  <button
                    type="button"
                    className="btn btn-primary flex-1"
                    disabled={pending}
                    onClick={() => approve(p)}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={pending}
                    onClick={() => setRejecting(p)}
                  >
                    Send back
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {rejecting ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center p-5"
          style={{ background: "color-mix(in srgb, var(--olive-deep) 85%, transparent)" }}
          role="dialog"
          aria-modal="true"
          aria-label="Send profile back"
        >
          <div className="card p-6 w-full max-w-[460px] flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <span className="eyebrow">Send back</span>
              <h3 className="text-2xl">
                {fullName(rejecting.first_name, rejecting.last_name)}
              </h3>
              <p className="text-[13px] text-ink-soft">
                They see this note and can resubmit as many times as they need.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              {QUICK_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  className="text-left text-[13px] px-3 py-2 border hover:border-gold transition-colors"
                  style={{ borderColor: "var(--rule-strong)", background: "var(--ivory-warm)" }}
                  onClick={() => setReason(r)}
                >
                  {r}
                </button>
              ))}
            </div>

            <textarea
              className="field resize-y min-h-[90px]"
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="What needs to change?"
            />

            <div className="flex gap-3">
              <button type="button" className="btn btn-primary" disabled={pending} onClick={reject}>
                {pending ? "Sending…" : "Send back"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setRejecting(null);
                  setReason("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
