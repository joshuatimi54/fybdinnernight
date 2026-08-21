"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveProfile, submitProfile } from "@/app/actions/profile";
import PhotoUpload from "@/components/PhotoUpload";
import UsernameField from "@/components/UsernameField";
import type { Profile } from "@/lib/types";


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
  const [username, setUsername] = useState(profile.username ?? "");
  const [photo, setPhoto] = useState<string | null>(profile.photo_url);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [department, setDepartment] = useState(profile.department ?? "");
  const [level, setLevel] = useState(profile.level ?? "");


  // Gender decides who sees whom, so it is fixed once the committee has
  // approved the profile as reviewed.
  const genderLocked = profile.review_status === "approved";

  function payload() {
    return {
      first_name: firstName,
      last_name: lastName,
      gender: gender || undefined,
      phone,
      username,
      photo_url: photo ?? "",
      bio,
      department,
      level,
      prompts: [],
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

      router.push("/onboarding?step=date");
      router.refresh();
    });
  }

  const missing: string[] = [];
  if (!firstName.trim()) missing.push("first name");
  if (!lastName.trim()) missing.push("surname");
  if (!gender) missing.push("gender");
  if (phone.trim().length < 7) missing.push("phone number");
  if (!/^[a-z][a-z0-9_]{2,19}$/.test(username.trim())) missing.push("username");
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

        <UsernameField
          value={username}
          onChange={setUsername}
          locked={profile.review_status === "approved"}
        />

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

      {/* ----------------------------------------------------------- bio */}
      <section className="flex flex-col gap-5 pt-9" style={{ borderTop: "1px solid var(--rule)" }}>
        <div className="flex flex-col gap-2">
          <span className="eyebrow">In your words</span>
          <h2 className="text-2xl">One line about you</h2>
          <p className="text-[14.5px] max-w-[52ch]" style={{ color: "var(--ink-soft)" }}>
            Optional, and worth doing. It is the only thing on your card that
            sounds like a person rather than a form.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="bio">About you</label>
          <input
            id="bio" className="field" maxLength={140}
            value={bio} onChange={(e) => setBio(e.target.value)}
            placeholder="Final year, tired, but showing up anyway."
          />
          <p className="text-[12px] mt-1.5 numeric" style={{ color: "var(--ink-faint)" }}>
            {bio.length}/140
          </p>
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
            {pending ? "Saving…" : "Save and continue"}
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

        <p className="text-[13px] max-w-[56ch]" style={{ color: "var(--ink-faint)" }}>
          You are in as soon as you save. Next comes the part that actually
          reserves your seat — your date.
        </p>
      </section>
    </form>
  );
}
