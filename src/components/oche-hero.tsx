import Link from "next/link";
import { Countdown } from "./countdown";
import { Dartboard } from "./dartboard";

export interface OcheNext {
  id: string;
  name: string;
  eventName: string;
  locksAt: string;
  potLabel: string;
  feeLabel: string;
  entries: number;
}

/**
 * The homepage hero: a world-championship stage — a huge lit board, sweeping red and green stage
 * lights, the LED oche line — and the next game on the board.
 */
export function OcheHero({ next, live, signedIn }: { next: OcheNext | null; live?: { name: string; href: string } | null; signedIn: boolean }) {
  return (
    <section className="theme-dark oche-stage relative -mx-4 overflow-hidden border-b border-ink-700 sm:mx-0 sm:rounded-3xl sm:border">
      {/* stage lights */}
      <span className="oche-beam red left-[8%]" aria-hidden="true" />
      <span className="oche-beam left-[40%]" aria-hidden="true" />
      <span className="oche-beam green left-[70%]" aria-hidden="true" />

      <div className="relative grid min-h-[560px] items-center gap-6 px-5 pb-28 pt-10 sm:px-10 md:min-h-[620px] md:grid-cols-[1.05fr_1fr] md:pb-32">
        <div className="relative z-10 max-w-xl">
          <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.22em] text-lime">
            {live ? <span className="live-dot" aria-hidden="true" /> : <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />}
            {live ? `Live now · ${live.name}` : "Fantasy darts · Live data powered by SportX"}
          </p>
          <h1 className="mt-3 text-6xl leading-[0.85] sm:text-7xl md:text-8xl">
            Step up to
            <br />
            <span className="bg-gradient-to-r from-[#ff3b52] via-[#e8152d] to-[#ff7a3d] bg-clip-text text-transparent">the oche</span>
          </h1>
          <p className="mt-5 max-w-md text-base text-muted sm:text-lg">
            Collect the world&apos;s darters, pick a Contender, a Challenger and an Outsider, and score off every 180, ton-plus finish and leg they win. <b className="text-fg">£1 a game — half of every entry goes in the pot.</b>
          </p>

          {next && (
            <Link href={`/darts/games/${next.id}`} className="mt-6 flex max-w-md items-center gap-4 rounded-2xl border border-accent/50 bg-black/60 p-4 backdrop-blur-sm transition hover:border-accent">
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-extrabold uppercase tracking-[0.18em] text-faint">{next.eventName}</span>
                <span className="block truncate font-display text-xl font-bold uppercase italic">{next.name}</span>
                <span className="mt-1 block text-xs text-muted">
                  {next.feeLabel} entry · {next.entries} in · locks in <Countdown to={next.locksAt} className="font-semibold text-fg" />
                </span>
              </span>
              <span className="text-right">
                <span className="block text-[10px] font-extrabold uppercase tracking-[0.18em] text-faint">Bet X pot</span>
                <span className="block font-display text-3xl font-black italic text-[#f2cf63]">{next.potLabel}</span>
              </span>
            </Link>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={signedIn ? (next ? `/darts/games/${next.id}` : "/darts") : "/register"} className="btn-primary px-6 py-3.5 text-sm shadow-[0_0_30px_-6px_rgb(232_21_45/0.8)]">
              {signedIn ? "Pick your team" : "Get your free stable"}
            </Link>
            <Link href={signedIn ? "/packs" : "/how-it-works"} className="btn border border-[#12a150] px-6 py-3.5 text-sm text-[#5ee69a] hover:bg-[#12a150]/15">
              {signedIn ? "Open packs" : "How it works"}
            </Link>
          </div>
        </div>

        {/* The board, huge, on its stage. */}
        <div className="pointer-events-none relative flex justify-center md:justify-end">
          <div className="absolute -bottom-6 left-1/2 h-10 w-3/4 -translate-x-1/2 rounded-[50%] bg-black/80 blur-xl" aria-hidden="true" />
          <Dartboard dart className="oche-board relative w-[min(92vw,560px)] md:w-[min(48vw,620px)]" title="The world-stage board" />
        </div>
      </div>

      {/* the stage floor and the oche */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28" aria-hidden="true">
        <div className="oche-floor absolute inset-x-0 top-6 h-40" />
        <div className="oche-led absolute inset-x-0 top-6 h-[3px] opacity-80" />
        <div className="absolute left-1/2 top-12 flex -translate-x-1/2 flex-col items-center">
          <div className="h-2.5 w-64 rounded-sm bg-gradient-to-b from-[#f4f4f4] to-[#9a9a9a] shadow-[0_0_24px_rgb(255_255_255/0.35)] sm:w-96" />
          <span className="mt-2 text-[10px] font-extrabold uppercase tracking-[0.4em] text-white/50">The oche · 7ft 9¼in</span>
        </div>
      </div>
    </section>
  );
}
