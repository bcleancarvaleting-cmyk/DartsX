"use client";

import { useState, useTransition } from "react";
import { throwOcheAction } from "@/app/actions/darts";
import type { OcheDart } from "@/domain/darts/oche-game";
import type { OcheResult } from "@/server/oche-throw";
import { BOARD, BOARD_ORDER, Dartboard } from "./dartboard";

const STEP = (Math.PI * 2) / 20;
const RADIUS = { T: 103, D: 166, S: 136, OB: 11, BULL: 2 } as const;

/** Where a dart lands, in the board's own coordinates (viewBox −235…235), with a little scatter. */
function spot(d: OcheDart, i: number) {
  if (d.ring === "BULL" || d.ring === "OB") {
    const a = i * 2.1;
    return { x: Math.cos(a) * RADIUS[d.ring] * 1.2, y: Math.sin(a) * RADIUS[d.ring] * 1.2 };
  }
  const angle = BOARD_ORDER.indexOf(d.number) * STEP + (i - 1) * STEP * 0.22;
  const r = RADIUS[d.ring] + (i - 1) * 1.5;
  return { x: r * Math.sin(angle), y: -r * Math.cos(angle) };
}

function Dart({ d, i, landed }: { d: OcheDart; i: number; landed: boolean }) {
  const { x, y } = spot(d, i);
  const tilt = -24 + i * 14;
  return (
    <g
      style={{
        transform: landed ? `translate(${x}px, ${y}px) rotate(${tilt}deg) scale(1)` : `translate(${x * 0.3}px, 320px) rotate(${tilt}deg) scale(2.4)`,
        opacity: landed ? 1 : 0,
        transition: "transform 420ms cubic-bezier(.2,.9,.25,1.15), opacity 120ms linear",
      }}
    >
      <line x1="0" y1="0" x2="0" y2="-8" stroke="#d8d8d8" strokeWidth="1.8" />
      <rect x="-3.4" y="-36" width="6.8" height="28" rx="2.6" fill="#a7b0ba" />
      <rect x="-3.4" y="-31" width="6.8" height="2.2" fill="#5b636c" />
      <rect x="-3.4" y="-25" width="6.8" height="2.2" fill="#5b636c" />
      <rect x="-1.5" y="-60" width="3" height="24" fill="#1d2126" />
      <path d="M0 -58 L-12 -82 L0 -75 L12 -82 Z" fill={i === 1 ? BOARD.green : BOARD.red} stroke="#000" strokeWidth="0.6" />
    </g>
  );
}

/**
 * The pack-shop throw: tap the board three times. A 180 wins 20% off a pack, a 170 15%, a Double
 * 20 finish 10% — every throw wins something. One throw a day.
 */
export function OcheThrowGame({ today }: { today: OcheResult | null }) {
  const [result, setResult] = useState<OcheResult | null>(today);
  const [thrown, setThrown] = useState(today ? 3 : 0);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const done = !!result && thrown >= 3;
  const total = result ? result.darts.slice(0, thrown).reduce((s, d) => s + d.score, 0) : 0;

  const throwNext = () => {
    if (pending || done) return;
    setError(null);
    if (!result) {
      start(async () => {
        const res = await throwOcheAction();
        if (!res.ok) return setError(res.error);
        setResult(res.data);
        setThrown(1);
      });
      return;
    }
    setThrown((t) => Math.min(3, t + 1));
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="theme-dark oche-stage relative overflow-hidden rounded-3xl border border-ink-700">
      <span className="oche-beam red left-[4%]" aria-hidden="true" />
      <span className="oche-beam green left-[66%]" aria-hidden="true" />
      <div className="relative grid items-center gap-6 p-5 sm:p-8 md:grid-cols-[1fr_1.1fr]">
        <div className="relative z-10 space-y-4">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-lime">Daily throw · every throw wins</p>
          <h2 className="text-5xl leading-[0.9] sm:text-6xl">
            Three darts.
            <br />
            <span className="text-[#ff3b52]">Money off packs.</span>
          </h2>
          <ul className="grid gap-1.5 text-sm">
            <li className="flex items-center justify-between rounded-lg border border-[#f2cf63]/40 bg-black/50 px-3 py-2"><span><b className="font-display text-xl italic text-[#f2cf63]">180</b> · treble 20 ×3</span><b>20% off</b></li>
            <li className="flex items-center justify-between rounded-lg border border-[#e8152d]/40 bg-black/50 px-3 py-2"><span><b className="font-display text-xl italic text-[#ff6b7d]">170</b> · the big fish</span><b>15% off</b></li>
            <li className="flex items-center justify-between rounded-lg border border-[#12a150]/50 bg-black/50 px-3 py-2"><span><b className="font-display text-xl italic text-[#5ee69a]">D20</b> · game shot on double top</span><b>10% off</b></li>
          </ul>

          {done && result ? (
            <div className="space-y-3 rounded-2xl border border-accent/60 bg-black/70 p-4" role="status">
              <p className="font-display text-3xl font-black uppercase italic leading-none text-[#f2cf63]">{result.label}</p>
              <p className="text-sm text-muted">
                You won <b className="text-fg">{result.pct}% off your next pack</b>. It comes off automatically — or share the code below. Valid until{" "}
                {new Date(result.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="select-all rounded-lg border border-ink-600 bg-ink-950 px-3 py-2 font-mono text-base font-bold tracking-wider">{result.code}</code>
                <button type="button" onClick={copy} className="btn-ghost px-3 py-2 text-xs">{copied ? "Copied" : "Copy code"}</button>
                {result.used && <span className="text-xs text-faint">Used</span>}
              </div>
              <p className="text-xs text-faint">Next three darts tomorrow.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <button type="button" onClick={throwNext} disabled={pending} className="btn-primary px-6 py-3.5 text-sm shadow-[0_0_30px_-6px_rgb(232_21_45/0.8)]">
                {pending ? "Stepping up…" : thrown === 0 ? "Throw dart 1" : `Throw dart ${thrown + 1}`}
              </button>
              <p className="text-xs text-faint">Or tap the board. One throw a day.</p>
              {error && <p className="text-sm text-danger">{error}</p>}
            </div>
          )}
        </div>

        <button type="button" onClick={throwNext} disabled={pending || done} aria-label={done ? "Today's darts" : "Throw a dart at the board"} className="relative mx-auto block w-full max-w-[460px] cursor-crosshair disabled:cursor-default">
          <Dartboard className="oche-board w-full" title="The board" />
          <svg viewBox="-235 -235 470 470" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
            {result?.darts.map((d, i) => <Dart key={i} d={d} i={i} landed={i < thrown} />)}
          </svg>
          {result && thrown > 0 && (
            <span className="absolute right-2 top-2 rounded-xl border border-white/15 bg-black/80 px-3 py-2 text-right">
              <span className="block text-[10px] font-extrabold uppercase tracking-[0.16em] text-faint">{result.darts.slice(0, thrown).map((d) => d.label).join(" · ")}</span>
              <span className="block font-display text-4xl font-black italic leading-none text-[#f2cf63] tabular-nums">{total}</span>
            </span>
          )}
        </button>
      </div>
    </section>
  );
}
