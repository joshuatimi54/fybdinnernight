"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  BODY_FONT,
  DISPLAY_FONT,
  MONO_FONT,
  PALETTE,
  downloadCanvas,
  ensureFonts,
  loadImage,
} from "@/lib/canvas";

export type PassData = {
  code: string;
  qrDataUrl: string;
  nameA: string;
  nameB: string;
  table: string | null;
  eventName: string;
  when: string;
  venue: string | null;
};

const W = 1000;
const H = 1500;

/**
 * The pass is drawn rather than screenshotted so it comes out crisp at print
 * size, and so the QR sits at an exact pixel size scanners can read reliably.
 */
async function drawPass(canvas: HTMLCanvasElement, pass: PassData) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvas.width = W;
  canvas.height = H;

  await ensureFonts();

  ctx.fillStyle = PALETTE.groundDeep;
  ctx.fillRect(0, 0, W, H);

  // Border
  ctx.strokeStyle = PALETTE.goldDeep;
  ctx.lineWidth = 3;
  ctx.strokeRect(40, 40, W - 80, H - 80);

  ctx.textAlign = "center";

  ctx.fillStyle = PALETTE.gold;
  ctx.font = `600 22px ${BODY_FONT}`;
  ctx.letterSpacing = "6px";
  ctx.fillText("CACCF PRESENTS", W / 2, 140);
  ctx.letterSpacing = "0px";

  ctx.fillStyle = PALETTE.ink;
  ctx.font = `74px ${DISPLAY_FONT}`;
  ctx.fillText(pass.eventName, W / 2, 235);

  ctx.strokeStyle = PALETTE.rule;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(120, 290);
  ctx.lineTo(W - 120, 290);
  ctx.stroke();

  // The pair
  ctx.fillStyle = PALETTE.inkFaint;
  ctx.font = `600 18px ${BODY_FONT}`;
  ctx.letterSpacing = "4px";
  ctx.fillText("ADMITS TWO", W / 2, 350);
  ctx.letterSpacing = "0px";

  ctx.fillStyle = PALETTE.ink;
  ctx.font = `56px ${DISPLAY_FONT}`;
  ctx.fillText(pass.nameA, W / 2, 430);

  ctx.fillStyle = PALETTE.gold;
  ctx.font = `44px ${DISPLAY_FONT}`;
  ctx.fillText("&", W / 2, 495);

  ctx.fillStyle = PALETTE.ink;
  ctx.font = `56px ${DISPLAY_FONT}`;
  ctx.fillText(pass.nameB, W / 2, 560);

  // Details
  const rows: [string, string][] = [
    ["WHEN", pass.when],
    ["WHERE", pass.venue ?? "To be announced"],
    ["TABLE", pass.table ?? "Assigned on arrival"],
  ];

  let y = 660;
  for (const [label, value] of rows) {
    ctx.fillStyle = PALETTE.inkFaint;
    ctx.font = `600 16px ${BODY_FONT}`;
    ctx.letterSpacing = "4px";
    ctx.fillText(label, W / 2, y);
    ctx.letterSpacing = "0px";

    ctx.fillStyle = PALETTE.ink;
    ctx.font = `28px ${BODY_FONT}`;
    ctx.fillText(value, W / 2, y + 40);
    y += 100;
  }

  // QR — white quiet zone, because scanners need the contrast.
  const qrSize = 300;
  const qrX = (W - qrSize) / 2;
  const qrY = 990;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(qrX - 18, qrY - 18, qrSize + 36, qrSize + 36);

  try {
    const qr = await loadImage(pass.qrDataUrl);
    ctx.drawImage(qr, qrX, qrY, qrSize, qrSize);
  } catch {
    // Leave the quiet zone blank rather than drawing a broken pass.
  }

  ctx.fillStyle = PALETTE.gold;
  ctx.font = `500 30px ${MONO_FONT}`;
  ctx.letterSpacing = "5px";
  ctx.fillText(pass.code, W / 2, qrY + qrSize + 80);
  ctx.letterSpacing = "0px";

  ctx.fillStyle = PALETTE.inkFaint;
  ctx.font = `18px ${BODY_FONT}`;
  ctx.fillText("Show this at the door. No date, no dinner.", W / 2, H - 90);
}

export default function PassActions({ pass }: { pass: PassData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [busy, setBusy] = useState(false);

  async function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setBusy(true);
    try {
      await drawPass(canvas, pass);
      downloadCanvas(canvas, `fyb-dinner-pass-${pass.code}.png`);
      toast.success("Pass saved.");
    } catch {
      toast.error("Couldn't build the image. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function print() {
    window.print();
  }

  return (
    <div className="flex flex-wrap gap-3 print:hidden">
      <button type="button" className="btn btn-primary" onClick={download} disabled={busy}>
        {busy ? "Building…" : "Download pass"}
      </button>
      <button type="button" className="btn btn-ghost" onClick={print}>
        Print
      </button>
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
    </div>
  );
}
