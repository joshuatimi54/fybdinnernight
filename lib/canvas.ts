/**
 * Client-side canvas drawing shared by the dinner pass and the social graphic.
 *
 * Both are rendered in the browser rather than on a server: it costs nothing
 * to run, works instantly, and keeps guests' photos off our own infrastructure.
 */

/**
 * The graphics follow the printed invitation rather than the website: a deep
 * olive card with cream and gold lettering. That reads far better in a feed
 * than the site's ivory would, and keeps the pass and the share card looking
 * like the same stationery.
 */
export const PALETTE = {
  ground: "#2B3425",
  groundDeep: "#1C2318",
  surface: "#333D2C",
  ink: "#F7F2E7",
  inkSoft: "#C6CFB8",
  inkFaint: "#93A189",
  rule: "#4C5842",
  gold: "#E8CF8F",
  goldDeep: "#B08B33",
  sage: "#93A189",
};

export const DISPLAY_FONT = '"Cormorant Garamond", Georgia, serif';
export const SCRIPT_FONT = '"Italianno", "Apple Chancery", cursive';
export const BODY_FONT = '"Jost", Arial, sans-serif';
export const MONO_FONT = '"IBM Plex Mono", monospace';

/** Waits for webfonts so canvas text doesn't silently fall back to Times. */
export async function ensureFonts(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    await document.fonts.ready;
  } catch {
    // Non-fatal: the fallback stack still renders.
  }
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${src}`));
    img.src = src;
  });
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draws an image cropped to a circle — used for every face on both graphics. */
export function circularImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  cy: number,
  radius: number,
) {
  const size = Math.min(img.width, img.height);
  const sx = (img.width - size) / 2;
  const sy = (img.height - size) / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, sx, sy, size, size, cx - radius, cy - radius, radius * 2, radius * 2);
  ctx.restore();
}

export function initialsCircle(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  radius: number,
) {
  ctx.save();
  ctx.fillStyle = PALETTE.surface;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = PALETTE.inkFaint;
  ctx.font = `${radius * 0.7}px ${DISPLAY_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, cy);
  ctx.restore();
}

/** Word-wraps text and returns the y coordinate after the final line. */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const words = text.split(/\s+/).filter(Boolean);
  let line = "";
  let cursor = y;

  for (const word of words) {
    const attempt = line ? `${line} ${word}` : word;
    if (ctx.measureText(attempt).width > maxWidth && line) {
      ctx.fillText(line, x, cursor);
      cursor += lineHeight;
      line = word;
    } else {
      line = attempt;
    }
  }

  if (line) {
    ctx.fillText(line, x, cursor);
    cursor += lineHeight;
  }

  return cursor;
}

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoked on the next tick so Safari has time to start the download.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}

/** Native share sheet where it exists, with a download as the fallback. */
export async function shareCanvas(
  canvas: HTMLCanvasElement,
  filename: string,
  text: string,
): Promise<"shared" | "downloaded"> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );

  if (blob && typeof navigator !== "undefined" && navigator.canShare) {
    const file = new File([blob], filename, { type: "image/png" });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text });
        return "shared";
      } catch {
        // User dismissed the sheet, or the platform refused. Fall through.
      }
    }
  }

  downloadCanvas(canvas, filename);
  return "downloaded";
}
