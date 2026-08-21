"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  BODY_FONT,
  DISPLAY_FONT,
  PALETTE,
  circularImage,
  downloadCanvas,
  ensureFonts,
  initialsCircle,
  loadImage,
  shareCanvas,
  wrapText,
} from "@/lib/canvas";
import { initials } from "@/lib/utils";

export type GraphicInput = {
  firstName: string;
  photo: string | null;
  partnerName: string | null;
  partnerPhoto: string | null;
  eventName: string;
  hashtag: string;
  handle: string;
  when: string;
};

type Template = "attending" | "found" | "pair";
type Size = "square" | "story";

const SIZES: Record<Size, { w: number; h: number; label: string }> = {
  square: { w: 1080, h: 1080, label: "Feed · 1:1" },
  story: { w: 1080, h: 1920, label: "Story · 9:16" },
};

async function draw(
  canvas: HTMLCanvasElement,
  input: GraphicInput,
  template: Template,
  size: Size,
) {
  const { w, h } = SIZES[size];
  const context = canvas.getContext("2d");
  if (!context) return;
  // Named explicitly so the nested (hoisted) face() keeps the narrowed type.
  const ctx: CanvasRenderingContext2D = context;

  canvas.width = w;
  canvas.height = h;
  await ensureFonts();

  const scale = w / 1080;
  const showsPair = template === "pair" && Boolean(input.partnerName);

  // Ground with a warm pool of candlelight behind the faces.
  ctx.fillStyle = PALETTE.groundDeep;
  ctx.fillRect(0, 0, w, h);

  const glow = ctx.createRadialGradient(w / 2, h * 0.36, 0, w / 2, h * 0.36, w * 0.75);
  glow.addColorStop(0, "rgba(176, 139, 51, 0.30)");
  glow.addColorStop(1, "rgba(28, 35, 24, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  const inset = 44 * scale;
  ctx.strokeStyle = PALETTE.goldDeep;
  ctx.lineWidth = 3 * scale;
  ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);

  ctx.textAlign = "center";

  // ------------------------------------------------------------- faces --
  const faceY = h * 0.3;
  const radius = (showsPair ? 132 : 158) * scale;

  async function face(url: string | null, name: string, cx: number) {
    if (url) {
      try {
        const img = await loadImage(url);
        circularImage(ctx, img, cx, faceY, radius);
      } catch {
        initialsCircle(ctx, initials(name), cx, faceY, radius);
      }
    } else {
      initialsCircle(ctx, initials(name), cx, faceY, radius);
    }

    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 4 * scale;
    ctx.beginPath();
    ctx.arc(cx, faceY, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (showsPair) {
    const gap = radius * 1.12;
    await face(input.photo, input.firstName, w / 2 - gap);
    await face(input.partnerPhoto, input.partnerName ?? "", w / 2 + gap);

    ctx.fillStyle = PALETTE.gold;
    ctx.font = `${76 * scale}px ${DISPLAY_FONT}`;
    ctx.textBaseline = "middle";
    ctx.fillText("&", w / 2, faceY);
    ctx.textBaseline = "alphabetic";
  } else {
    await face(input.photo, input.firstName, w / 2);
  }

  // ----------------------------------------------------------- message --
  const headline =
    template === "attending"
      ? "I'm attending the"
      : template === "found"
        ? "I found my date for the"
        : `${input.firstName} & ${input.partnerName ?? ""}`;

  let y = faceY + radius + 110 * scale;

  if (template === "pair") {
    ctx.fillStyle = PALETTE.ink;
    ctx.font = `${72 * scale}px ${DISPLAY_FONT}`;
    y = wrapText(ctx, headline, w / 2, y, w - 160 * scale, 84 * scale);

    ctx.fillStyle = PALETTE.gold;
    ctx.font = `600 ${26 * scale}px ${BODY_FONT}`;
    ctx.letterSpacing = `${5 * scale}px`;
    ctx.fillText("ARE GOING TOGETHER", w / 2, y + 40 * scale);
    ctx.letterSpacing = "0px";
    y += 100 * scale;
  } else {
    ctx.fillStyle = PALETTE.inkSoft;
    ctx.font = `${44 * scale}px ${BODY_FONT}`;
    ctx.fillText(headline, w / 2, y);
    y += 78 * scale;

    ctx.fillStyle = PALETTE.ink;
    ctx.font = `${92 * scale}px ${DISPLAY_FONT}`;
    y = wrapText(ctx, input.eventName, w / 2, y, w - 150 * scale, 100 * scale);

    if (template === "found") {
      ctx.font = `${64 * scale}px ${BODY_FONT}`;
      ctx.fillText("😂", w / 2, y + 60 * scale);
      y += 110 * scale;
    }
  }

  // -------------------------------------------------------------- foot --
  const footY = h - 110 * scale;

  ctx.strokeStyle = PALETTE.rule;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w * 0.2, footY - 62 * scale);
  ctx.lineTo(w * 0.8, footY - 62 * scale);
  ctx.stroke();

  ctx.fillStyle = PALETTE.gold;
  ctx.font = `600 ${26 * scale}px ${BODY_FONT}`;
  ctx.letterSpacing = `${4 * scale}px`;
  ctx.fillText(input.hashtag.toUpperCase(), w / 2, footY - 14 * scale);
  ctx.letterSpacing = "0px";

  ctx.fillStyle = PALETTE.inkFaint;
  ctx.font = `${24 * scale}px ${BODY_FONT}`;
  ctx.fillText(`${input.handle} · ${input.when}`, w / 2, footY + 28 * scale);
}

export default function GraphicStudio({ input }: { input: GraphicInput }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [template, setTemplate] = useState<Template>(
    input.partnerName ? "pair" : "attending",
  );
  const [size, setSize] = useState<Size>("square");
  const [busy, setBusy] = useState(false);

  const render = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      await draw(canvas, input, template, size);
    } catch {
      toast.error("Couldn't draw the graphic. Try a different template.");
    }
  }, [input, template, size]);

  useEffect(() => {
    void render();
  }, [render]);

  const caption = `${
    template === "found"
      ? "I found my date"
      : template === "pair"
        ? `${input.firstName} & ${input.partnerName}`
        : "I'm attending"
  } — ${input.eventName}. ${input.hashtag} ${input.handle}`;

  const templates: { id: Template; label: string; disabled?: boolean }[] = [
    { id: "attending", label: "I'm attending" },
    { id: "found", label: "I found my date 😂" },
    { id: "pair", label: "The two of us", disabled: !input.partnerName },
  ];

  async function save(mode: "download" | "share") {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setBusy(true);
    try {
      await render();
      const filename = `fyb-dinner-night-${template}-${size}.png`;

      if (mode === "download") {
        downloadCanvas(canvas, filename);
        toast.success("Saved. Post it and tag us.");
      } else {
        const how = await shareCanvas(canvas, filename, caption);
        toast.success(how === "shared" ? "Shared." : "Saved to your device.");
      }
    } catch {
      toast.error("That didn't work. Try downloading instead.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* ---------------------------------------------------- preview */}
        <div
          className="border p-4 grid place-items-center"
          style={{ borderColor: "var(--rule)", background: "var(--paper)" }}
        >
          <canvas
            ref={canvasRef}
            className="max-w-full h-auto"
            style={{ maxHeight: "62vh" }}
            aria-label="Your shareable graphic"
          />
        </div>

        {/* ---------------------------------------------------- controls */}
        <div className="flex flex-col gap-6">
          <fieldset className="flex flex-col gap-3 border-0 p-0 m-0">
            <legend className="label">Template</legend>
            {templates.map((t) => (
              <label
                key={t.id}
                className="flex items-center gap-3 px-4 py-3 border text-[14px] transition-colors"
                style={{
                  borderColor: template === t.id ? "var(--gold)" : "var(--rule-strong)",
                  background: template === t.id ? "var(--gold-wash)" : "var(--paper)",
                  opacity: t.disabled ? 0.4 : 1,
                  cursor: t.disabled ? "not-allowed" : "pointer",
                }}
              >
                <input
                  type="radio"
                  name="template"
                  className="sr-only"
                  checked={template === t.id}
                  disabled={t.disabled}
                  onChange={() => setTemplate(t.id)}
                />
                {t.label}
              </label>
            ))}
          </fieldset>

          <fieldset className="flex flex-col gap-3 border-0 p-0 m-0">
            <legend className="label">Size</legend>
            {(Object.keys(SIZES) as Size[]).map((s) => (
              <label
                key={s}
                className="flex items-center gap-3 px-4 py-3 border text-[14px] cursor-pointer transition-colors"
                style={{
                  borderColor: size === s ? "var(--gold)" : "var(--rule-strong)",
                  background: size === s ? "var(--gold-wash)" : "var(--paper)",
                }}
              >
                <input
                  type="radio"
                  name="size"
                  className="sr-only"
                  checked={size === s}
                  onChange={() => setSize(s)}
                />
                {SIZES[s].label}
              </label>
            ))}
          </fieldset>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => save("share")}
            >
              {busy ? "Building…" : "Share"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => save("download")}
            >
              Download
            </button>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------- caption */}
      <div className="flex flex-col gap-3 border-t border-rule pt-7">
        <span className="eyebrow">Caption, ready to paste</span>
        <div
          className="p-4 border text-[15px] leading-relaxed"
          style={{ borderColor: "var(--rule-strong)", background: "var(--paper)" }}
        >
          {caption}
        </div>
        <button
          type="button"
          className="btn btn-ghost self-start"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(caption);
              toast.success("Caption copied.");
            } catch {
              toast.error("Couldn't copy — select it and copy manually.");
            }
          }}
        >
          Copy caption
        </button>
      </div>
    </div>
  );
}
