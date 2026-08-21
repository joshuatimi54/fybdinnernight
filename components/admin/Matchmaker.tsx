"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { proposeMatch } from "@/app/actions/admin";
import { avatarUrl, fullName, initials } from "@/lib/utils";
import type { Profile } from "@/lib/types";

const DEFAULT_NOTE =
  "The FYB committee thinks you two would make a great table.";

function Row({
  p,
  selected,
  onSelect,
}: {
  p: Profile;
  selected: boolean;
  onSelect: () => void;
}) {
  const photo = avatarUrl(p.photo_url, 96);

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="w-full text-left p-3 flex items-center gap-3 border transition-colors"
        style={{
          borderColor: selected ? "var(--gold)" : "transparent",
          background: selected ? "var(--gold-wash)" : "transparent",
        }}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
        ) : (
          <span
            className="w-10 h-10 rounded-full grid place-items-center text-[11px] shrink-0"
            style={{ background: "var(--mist)", color: "var(--ink-faint)" }}
          >
            {initials(p.first_name, p.last_name)}
          </span>
        )}

        <span className="flex flex-col min-w-0 gap-0.5">
          <span className="text-[14px] truncate">
            {fullName(p.first_name, p.last_name)}
          </span>
          <span className="text-[11px] text-ink-faint truncate">
            {[p.department, p.level].filter(Boolean).join(" · ") || "—"}
          </span>
        </span>

        {p.seeking_help ? (
          <span className="pill pill-gold ml-auto shrink-0">Asked</span>
        ) : null}
      </button>
    </li>
  );
}

export default function Matchmaker({
  men,
  women,
}: {
  men: Profile[];
  women: Profile[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [man, setMan] = useState<Profile | null>(null);
  const [woman, setWoman] = useState<Profile | null>(null);
  const [note, setNote] = useState(DEFAULT_NOTE);

  function propose() {
    if (!man || !woman) return;

    startTransition(async () => {
      // Sent from the gentleman so the lady answers — but the wording makes it
      // the committee's suggestion, so neither of them had to do the asking.
      const res = await proposeMatch(man.id, woman.id, note.trim() || DEFAULT_NOTE);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Suggested ${woman.first_name} to ${man.first_name}.`);
      setMan(null);
      setWoman(null);
      setNote(DEFAULT_NOTE);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-5 lg:grid-cols-2">
        {(
          [
            { title: "Gentlemen", list: men, sel: man, set: setMan },
            { title: "Ladies", list: women, sel: woman, set: setWoman },
          ] as const
        ).map((col) => (
          <section key={col.title} className="card flex flex-col">
            <header className="p-4 border-b border-rule flex items-center justify-between">
              <h3 className="text-xl font-body font-bold tracking-normal">
                {col.title}
              </h3>
              <span className="numeric text-[12px] text-ink-faint">
                {col.list.length}
              </span>
            </header>
            <ul className="flex flex-col p-1 max-h-[420px] overflow-y-auto">
              {col.list.length === 0 ? (
                <li className="p-6 text-center text-ink-soft text-[14px]">
                  Nobody unpaired here.
                </li>
              ) : (
                col.list.map((p) => (
                  <Row
                    key={p.id}
                    p={p}
                    selected={col.sel?.id === p.id}
                    onSelect={() => col.set(col.sel?.id === p.id ? null : p)}
                  />
                ))
              )}
            </ul>
          </section>
        ))}
      </div>

      <div
        className="border p-5 flex flex-col gap-4"
        style={{
          borderColor: man && woman ? "var(--gold)" : "var(--rule-strong)",
          background: "var(--paper)",
        }}
      >
        <div className="flex flex-col gap-1">
          <span className="eyebrow">Propose</span>
          <p className="text-[15px]">
            {man && woman
              ? `${man.first_name} and ${woman.first_name}`
              : "Pick one from each column."}
          </p>
        </div>

        <div>
          <label className="label" htmlFor="mm-note">
            How it will read to both of them
          </label>
          <textarea
            id="mm-note"
            className="field resize-y min-h-[70px]"
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <p className="text-[12px] text-ink-faint mt-1.5">
            Keep it as the committee&apos;s suggestion. Neither of them should
            feel like they were the one who had to ask.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-primary self-start"
          disabled={pending || !man || !woman}
          onClick={propose}
        >
          {pending ? "Sending…" : "Send the suggestion"}
        </button>
      </div>
    </div>
  );
}
