"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { avatarUrl } from "@/lib/utils";

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export default function PhotoUpload({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const preset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

  async function upload(file: File) {
    if (!cloud || !preset) {
      toast.error("Photo uploads aren't configured yet. Tell the committee.");
      return;
    }
    if (!ACCEPTED.includes(file.type)) {
      toast.error("Use a JPG, PNG or WEBP image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("That photo is over 8MB. Try a smaller one.");
      return;
    }

    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("upload_preset", preset);

      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${cloud}/image/upload`,
        { method: "POST", body: form },
      );

      const json = (await res.json().catch(() => null)) as {
        secure_url?: string;
        error?: { message?: string };
      } | null;

      if (!res.ok || !json?.secure_url) {
        // Cloudinary explains itself in the body. Swallowing that message is
        // why a misconfigured preset looks identical to a dropped connection
        // — the guest sees "try again" and tries again forever.
        const detail = json?.error?.message ?? `HTTP ${res.status}`;
        console.error("Cloudinary upload failed:", detail);

        // A missing or signed-only preset is our fault, not the guest's, so
        // it must not read as "your photo was no good".
        toast.error(
          /preset/i.test(detail)
            ? "Photo uploads aren't set up correctly yet. Please tell the committee."
            : `That upload didn't work — ${detail}`,
        );
        return;
      }

      onChange(json.secure_url);
      toast.success("Photo added.");
    } catch (err) {
      console.error("Cloudinary upload failed:", err);
      toast.error("That upload didn't work. Check your connection and try again.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const preview = avatarUrl(value, 320);

  return (
    <div className="flex items-center gap-5">
      <div
        className="w-24 h-24 shrink-0 rounded-full overflow-hidden border grid place-items-center"
        style={{ borderColor: "var(--rule-strong)", background: "var(--ivory-warm)" }}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Your profile photo" className="w-full h-full object-cover" />
        ) : (
          <span className="text-[10px] uppercase tracking-[0.14em] text-ink-faint text-center px-2">
            No photo
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2 items-start">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(",")}
          className="sr-only"
          id="photo-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
          disabled={busy}
        />
        <label htmlFor="photo-input" className="btn btn-ghost cursor-pointer">
          {busy ? "Uploading…" : value ? "Change photo" : "Upload a photo"}
        </label>

        {value ? (
          <button
            type="button"
            className="btn btn-quiet text-[13px]"
            onClick={() => onChange(null)}
            disabled={busy}
          >
            Remove
          </button>
        ) : null}

        <p className="text-[12px] text-ink-faint max-w-[30ch] leading-snug">
          A clear photo of your face. The committee reviews every photo before
          anyone else sees it.
        </p>
      </div>
    </div>
  );
}
