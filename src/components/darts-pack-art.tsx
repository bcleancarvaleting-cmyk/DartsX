import { Dartboard } from "./dartboard";

const LOOK: Record<string, { label: string; tag: string; bg: string; ink: string }> = {
  "darts-rare": { label: "Rare", tag: "World top 10 · 2 darters", bg: "linear-gradient(140deg,#2a0007,#7a0414 35%,#e8152d 55%,#7a5a12 80%,#f2cf63)", ink: "linear-gradient(180deg,#fff5c4,#f2cf63 45%,#a87a1e)" },
  "darts-contender": { label: "Contender", tag: "Ranked 11–25", bg: "linear-gradient(140deg,#0b0b0b,#3a2a06 45%,#d8a93f 70%,#fff0b3)", ink: "linear-gradient(180deg,#fff5c4,#f2cf63 45%,#a87a1e)" },
  "darts-challenger": { label: "Challenger", tag: "Ranked 26–50", bg: "linear-gradient(140deg,#0b0b0b,#073d1f 45%,#12a150 70%,#c9f5d9)", ink: "linear-gradient(180deg,#fff,#d9dee4 45%,#8d96a1)" },
  "darts-outsider": { label: "Outsider", tag: "Ranked 51+", bg: "linear-gradient(140deg,#0b0b0b,#4a0610 45%,#e8152d 70%,#ffc2c9)", ink: "linear-gradient(180deg,#ffd6b0,#e0a46a 45%,#9a5a2c)" },
};

/** A darts pack front: black stage card, a board rising from the corner, the band in foil. */
export function DartsPackArt({ code, name, small }: { code: string; name?: string; small?: boolean }) {
  const l = LOOK[code] ?? { label: (name ?? "Pack").replace(" Pack", ""), tag: "", bg: "linear-gradient(140deg,#0b0b0b,#4a0610,#12a150)", ink: "linear-gradient(180deg,#fff,#efe6cf)" };
  const rare = code === "darts-rare";
  return (
    <div className={`card-premium ${rare ? "is-gold rainbow-halo" : ""} relative flex shrink-0 overflow-hidden ${small ? "h-14 w-11 rounded-lg" : "h-44 w-full items-end p-5"}`} style={{ background: l.bg }}>
      <Dartboard numbers={false} className={`pointer-events-none absolute opacity-90 drop-shadow-[0_8px_24px_rgba(0,0,0,0.6)] ${small ? "-right-4 -top-3 h-14 w-14" : "-right-10 -top-12 h-56 w-56"}`} title="" />
      <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(160deg,rgba(255,255,255,0.3)_0%,rgba(255,255,255,0.05)_30%,transparent_48%,rgba(0,0,0,0.45)_100%)]" aria-hidden="true" />
      {!small && <span className="pointer-events-none absolute inset-2.5 rounded-xl ring-1 ring-white/30" aria-hidden="true" />}
      <span className="sheen" aria-hidden="true" />
      {rare && <span className="holo" aria-hidden="true" />}
      {!small && (
        <>
          <span className="absolute left-5 top-4 font-display text-xs font-extrabold uppercase italic tracking-[0.2em] text-white/80">DARTSX{rare ? " · Elite" : ""}</span>
          <span className="relative flex flex-col gap-2">
            <span className="self-start rounded-lg bg-black/75 px-3 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-sm">
              <span className="block bg-clip-text font-display text-5xl font-extrabold uppercase italic leading-none text-transparent" style={{ backgroundImage: l.ink }}>
                {l.label}
              </span>
            </span>
            {l.tag && <span className="self-start rounded-sm bg-black/75 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-white">{l.tag}</span>}
          </span>
        </>
      )}
    </div>
  );
}
