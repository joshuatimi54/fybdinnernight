"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { checkIn } from "@/app/actions/admin";

type Found = {
  code: string;
  nameA: string;
  nameB: string;
  table: string | null;
  aIn: boolean;
  bIn: boolean;
};

/**
 * Door tool. The camera path uses the browser's built-in BarcodeDetector where
 * it exists (Chrome on Android, which is what a door team will have); every
 * other browser falls back to typing the eight-character code, which is
 * printed on the pass for exactly this reason.
 */
export default function CheckInScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [scanning, setScanning] = useState(false);
  const [supported, setSupported] = useState(false);
  const [code, setCode] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "BarcodeDetector" in window);
  }, []);

  const lookup = useCallback(async (raw: string) => {
    const token = raw.trim();
    if (!token) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/pass/lookup?token=${encodeURIComponent(token)}`);
      if (!res.ok) {
        toast.error(
          res.status === 404 ? "No pass matches that." : "That code isn't valid.",
        );
        return;
      }
      const data = (await res.json()) as Found;
      setFound(data);
    } catch {
      toast.error("Lookup failed. Check the connection.");
    } finally {
      setBusy(false);
    }
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  useEffect(() => stop, [stop]);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanning(true);

      // @ts-expect-error - BarcodeDetector is not in the DOM lib yet.
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });

      const tick = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes.length > 0 && codes[0].rawValue) {
            stop();
            await lookup(codes[0].rawValue as string);
            return;
          }
        } catch {
          // A dropped frame is normal; keep going.
        }
        requestAnimationFrame(() => void tick());
      };

      void tick();
    } catch {
      toast.error("Couldn't open the camera. Type the code instead.");
      setScanning(false);
    }
  }

  async function mark(side: "a" | "b" | "both") {
    if (!found) return;
    setBusy(true);
    const res = await checkIn(found.code, side);
    setBusy(false);

    if (!res.ok) {
      toast.error(res.error);
      return;
    }

    toast.success("Checked in. Enjoy the night.");
    setFound({
      ...found,
      aIn: found.aIn || side !== "b",
      bIn: found.bIn || side !== "a",
    });
  }

  return (
    <div className="flex flex-col gap-6 max-w-[520px]">
      {scanning ? (
        <div className="flex flex-col gap-3">
          <div className="border overflow-hidden" style={{ borderColor: "var(--rule-strong)" }}>
            <video ref={videoRef} className="w-full" muted playsInline />
          </div>
          <button type="button" className="btn btn-ghost self-start" onClick={stop}>
            Stop camera
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {supported ? (
            <button type="button" className="btn btn-primary self-start" onClick={start}>
              Scan a pass
            </button>
          ) : (
            <p className="text-[13px] text-ink-faint">
              This browser can&apos;t scan QR codes. Type the code from the pass
              instead — Chrome on Android supports scanning.
            </p>
          )}

          <form
            className="flex gap-2 items-end"
            onSubmit={(e) => {
              e.preventDefault();
              void lookup(code);
            }}
          >
            <div className="flex-1">
              <label className="label" htmlFor="pass-code">Pass code</label>
              <input
                id="pass-code"
                className="field numeric uppercase tracking-[0.2em]"
                maxLength={40}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="A1B2C3D4"
              />
            </div>
            <button type="submit" className="btn btn-ghost" disabled={busy}>
              Find
            </button>
          </form>
        </div>
      )}

      {found ? (
        <div
          className="border p-5 flex flex-col gap-4"
          style={{ borderColor: "var(--gold)", background: "var(--gold-wash)" }}
        >
          <div className="flex flex-col gap-1">
            <span className="eyebrow">Pass {found.code}</span>
            <p className="font-display text-3xl leading-tight">
              {found.nameA} <span style={{ color: "var(--gold)" }}>&amp;</span>{" "}
              {found.nameB}
            </p>
            <p className="text-[14px] text-ink-soft">
              {found.table ? `Table: ${found.table}` : "No table assigned"}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className={`pill ${found.aIn ? "pill-good" : "pill-quiet"}`}>
              {found.nameA.split(" ")[0]} {found.aIn ? "in" : "not in"}
            </span>
            <span className={`pill ${found.bIn ? "pill-good" : "pill-quiet"}`}>
              {found.nameB.split(" ")[0]} {found.bIn ? "in" : "not in"}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {!found.aIn && !found.bIn ? (
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => mark("both")}>
                Check both in
              </button>
            ) : null}
            {!found.aIn ? (
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => mark("a")}>
                Only {found.nameA.split(" ")[0]}
              </button>
            ) : null}
            {!found.bIn ? (
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => mark("b")}>
                Only {found.nameB.split(" ")[0]}
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => {
                setFound(null);
                setCode("");
              }}
            >
              Next guest
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
