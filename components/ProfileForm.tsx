"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveProfile, submitProfile } from "@/app/actions/profile";
import PhotoUpload from "@/components/PhotoUpload";
import { PROMPT_QUESTIONS, type Profile } from "@/lib/types";

type PromptRow = { q: string; a: string };

export default function ProfileForm({
  profile,
  requirePhoto,
}: {
  profile: Profile;
  requirePhoto: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [firstName, setFirstName] = useState(profile.first_name);
  const [lastName, setLastName] = useState(profile.last_name);
  const [gender, setGender] = useState<"male" | "female" | "">(profile.gender ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [photo, setPhoto] = useState<string | null>(profile.photo_url);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [department, setDepartment] = useState(profile.department ?? "");
  const [level, setLevel] = useState(profile.level ?? "");

  const [prompts, setPrompts] = useState<PromptRow[]>(() => {
    const existing = Array.isArray(profile.prompts) ? profile.prompts : [];
    return [0, 1, 2].map((i) => ({
      q: existing[i]?.q ?? PROMPT_QUESTIONS[i],
      a: existing[i]?.a ?? "",
    }));
  });

  // Gender decides who sees whom, so it is fixed once the committee has
  // approved the profile as reviewed.
  const genderLocked = profile.review_status === "approved";

  function payload() {
    return {
      first_name: firstName,
      last_name: lastName,
      gender: gender || undefined,
      phone,
      photo_url: photo ?? "",
      bio,
      department,
      level,
      prompts: prompts.filter((p) => p.a.trim().length > 0),
    };
  }

  function handleSave(then?: "submit") {
    if (!gender) {
      toast.error("Select whether you're attending as a gentleman or a lady.");
      return;
    }

    startTransition(async () => {
      const saved = await saveProfile(payload());
      if (!saved.ok) {
        toast.error(saved.error);
        return;
      }

      if (then !== "submit") {
        toast.success("Saved.");
        router.refresh();
        return;
      }

      const submitted = await submitProfile();
      if (!submitted.ok) {
        toast.error(submitted.error);
        return;
      }

      router.push("/pending");
      router.refresh();
    });
  }

  const missing: string[] = [];
  if (!firstName.trim()) missing.push("first name");
  if (!lastName.trim()) missing.push("surname");
  if (!gender) missing.push("gender");
  if (phone.trim().length < 7) missing.push("phone number");
  if (requirePhoto && !photo) missing.push("photo");

  return (
    <form
      className="flex flex-col gap-10"
      onSubmit={(e) => {
        e.preventDefault();
        handleSave("submit");
      }}
    >
      {/* -------------------------------------------------------- basics */}
      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <span className="eyebrow">The basics</span>
          <h2 className="text-2xl">Who&apos;s coming</h2>
        </div>

        <PhotoUpload value={photo} onChange={setPhoto} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="first">First name</label>
            <input
              id="first" className="field" required maxLength={40}
              value={firstName} onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
            />
          </div>
          <div>
            <label className="label" htmlFor="last">Surname</label>
            <input
              id="last" className="field" required maxLength={40}
              value={lastName} onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
            />
          </div>
        </div>

        <fieldset className="flex flex-col gap-2 border-0 p-0 m-0">
          <legend className="label">I&apos;m attending as</legend>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                { v: "male", l: "A gentleman" },
                { v: "female", l: "A lady" },
              ] as const
            ).map((o) => (
              <label
                key={o.v}
                className="flex items-center gap-3 px-4 py-3 border cursor-pointer transition-colors"
                style={{
                  borderColor: gender === o.v ? "var(--gold)" : "var(--rule-strong)",
                  background: gender === o.v ? "var(--gold-wash)" : "var(--paper)",
                  opacity: genderLocked && gender !== o.v ? 0.4 : 1,
                  cursor: genderLocked ? "not-allowed" : "pointer",
                }}
              >
                <input
                  type="radio" name="gender" value={o.v} className="sr-only"
                  checked={gender === o.v}
                  disabled={genderLocked}
                  onChange={() => setGender(o.v)}
                />
                <span className="text-[15px]">{o.l}</span>
              </label>
            ))}
          </div>
          <p className="text-[12px] text-ink-faint">
            {genderLocked
              ? "This is locked now that your profile is approved."
              : "Pairs for this event are a gentleman and a lady. You'll only see the opposite gender when you browse."}
          </p>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="phone">Phone number</label>
            <input
              id="phone" className="field" type="tel" required maxLength={24}
              value={phone} onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel" placeholder="0800 000 0000"
            />
            <p className="text-[12px] text-ink-faint mt-1.5">
              Only the committee and your date — once you have one — can see this.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="dept">Department</label>
              <input
                id="dept" className="field" maxLength={60}
                value={department} onChange={(e) => setDepartment(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="label" htmlFor="level">Level</label>
              <input
                id="level" className="field" maxLength={20}
                value={level} onChange={(e) => setLevel(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- prompts */}
      <section className="flex flex-col gap-6 border-t border-rule pt-9">
        <div className="flex flex-col gap-2">
          <span className="eyebrow">In your words</span>
          <h2 className="text-2xl">Give people something to reply to</h2>
          <p className="text-[15px] text-ink-soft max-w-[52ch]">
            This is what people actually read before they invite someone. A
            good answer gets you asked far more than a good photo does.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="bio">One line about you</label>
          <input
            id="bio" className="field" maxLength={140}
            value={bio} onChange={(e) => setBio(e.target.value)}
            placeholder="Optional, 140 characters"
          />
          <p className="text-[12px] text-ink-faint mt-1.5 numeric">
            {bio.length}/140
          </p>
        </div>

        <div className="flex flex-col gap-5">
          {prompts.map((row, i) => (
            <div key={i} className="flex flex-col gap-2">
              <label className="label" htmlFor={`prompt-${i}`}>
                Prompt {i + 1}
              </label>
              <select
                className="field"
                value={row.q}
                aria-label={`Question for prompt ${i + 1}`}
                onChange={(e) => {
                  const next = [...prompts];
                  next[i] = { ...next[i], q: e.target.value };
                  setPrompts(next);
                }}
              >
                {PROMPT_QUESTIONS.map((q) => (
                  <option key={q} value={q}>{q}</option>
                ))}
              </select>
              <textarea
                id={`prompt-${i}`}
                className="field resize-y min-h-[72px]"
                maxLength={160}
                rows={2}
                value={row.a}
                placeholder="Your answer"
                onChange={(e) => {
                  const next = [...prompts];
                  next[i] = { ...next[i], a: e.target.value };
                  setPrompts(next);
                }}
              />
              <span className="text-[12px] text-ink-faint numeric self-end">
                {row.a.length}/160
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* -------------------------------------------------------- submit */}
      <section className="flex flex-col gap-4 border-t border-rule pt-8">
        {missing.length > 0 ? (
          <p className="text-[13px]" style={{ color: "var(--gold)" }}>
            Still needed: {missing.join(", ")}.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={pending || missing.length > 0}
          >
            {pending ? "Sending…" : "Send for review"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={pending}
            onClick={() => handleSave()}
          >
            Save and finish later
          </button>
        </div>

        <p className="text-[13px] text-ink-faint max-w-[56ch]">
          The committee reviews every profile before it appears to anyone else.
          It usually takes a few hours.
        </p>
      </section>
    </form>
  );
}
