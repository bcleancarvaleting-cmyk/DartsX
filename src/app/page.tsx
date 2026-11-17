import Link from "next/link";
import { DartsPackArt } from "@/components/darts-pack-art";
import { LaunchPage, type LaunchParams } from "@/components/launch-page";
import { OcheHero } from "@/components/oche-hero";
import { DARTS_PACKS } from "@/config/packs";
import { DARTS_BOOSTERS } from "@/domain/darts/boosters";
import { DARTS_SCORING } from "@/domain/darts/scoring";
import { BANDS, bandFor } from "@/domain/darts/teams";
import { getCurrentUser } from "@/server/auth/session";
import { dartsGamesList } from "@/server/darts-games";
import { db } from "@/server/db";
import { isEnabled } from "@/server/flags";
import { fmtGbp } from "@/server/wallet";

export const dynamic = "force-dynamic";

const BAND_TONE = { CONTENDER: "text-[#f2cf63] border-[#f2cf63]/50", CHALLENGER: "text-[#5ee69a] border-[#12a150]/60", OUTSIDER: "text-[#ff6b7d] border-[#e8152d]/60" } as const;

export default async function Home({ searchParams }: { searchParams: Promise<LaunchParams> }) {
  const user = await getCurrentUser();
  // Pre-launch: logged-out visitors get the waitlist page.
  if (!user && (await isEnabled("PRELAUNCH"))) return <LaunchPage sp={await searchParams} />;

  const [games, elite, stable] = await Promise.all([
    dartsGamesList(user?.id),
    db.player.findMany({ where: { sport: { code: "darts" }, ranking: { lte: 10 } }, orderBy: { ranking: "asc" }, select: { id: true, displayName: true, ranking: true, nationality: true } }),
    user
      ? db.cardInstance.findMany({
          where: { ownerId: user.id, supplyState: "HELD", template: { player: { sport: { code: "darts" } } } },
          include: { template: { include: { player: { select: { displayName: true, ranking: true } } } } },
          orderBy: { template: { player: { ranking: "asc" } } },
          take: 12,
        })
      : Promise.resolve([]),
  ]);
  const open = games.filter((g) => g.status === "OPEN");
  const liveGame = games.find((g) => g.status === "LOCKED");
  const next = open[0] ?? null;
  const skus = await db.packSku.findMany({ where: { code: { in: DARTS_PACKS.map((p) => p.code) }, active: true }, distinct: ["code"], orderBy: [{ code: "asc" }, { version: "desc" }] });
  const packs = DARTS_PACKS.map((p) => ({ ...p, priceMinor: skus.find((s) => s.code === p.code)?.priceMinor ?? p.priceMinor })).sort((a, b) => b.priceMinor - a.priceMinor);
  const s = DARTS_SCORING;

  return (
    <div className="space-y-14">
      <OcheHero
        signedIn={!!user}
        live={liveGame ? { name: liveGame.event.name, href: `/darts/games/${liveGame.id}` } : null}
        next={next ? { id: next.id, name: next.name.replace(`${next.event.name} · `, ""), eventName: next.event.name, locksAt: next.locksAt.toISOString(), potLabel: fmtGbp(next.pot), feeLabel: next.entryFeeMinor ? fmtGbp(next.entryFeeMinor) : "Free", entries: next._count.entries } : null}
      />

      {/* On the oche: the games */}
      <section>
        <Head eyebrow="On the oche" title="Games open now" href="/darts" cta="All games" />
        {open.length === 0 ? (
          <p className="panel p-5 text-sm text-muted">The next draw is being made — games open as soon as it&apos;s out.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {open.slice(0, 6).map((g) => (
              <Link key={g.id} href={`/darts/games/${g.id}`} className="panel group relative overflow-hidden p-4 transition hover:border-accent/70">
                <span className={`absolute inset-x-0 top-0 h-1 ${g.kind === "EVENT" ? "bg-gradient-to-r from-[#e8152d] via-[#f2cf63] to-[#12a150]" : "bg-[#e8152d]"}`} aria-hidden="true" />
                <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-faint">{g.event.name}</p>
                <p className="mt-1 font-display text-2xl font-bold uppercase italic">{g.name.replace(`${g.event.name} · `, "")}</p>
                <p className="text-xs text-muted">{g.kind === "EVENT" ? "Stable of 4 · points build all event" : "Team of 3 · one from each band"}</p>
                <div className="mt-3 flex items-end justify-between">
                  <span className="text-sm text-muted">
                    {g.entryFeeMinor ? fmtGbp(g.entryFeeMinor) : "Free"} · {g._count.entries} in
                  </span>
                  <span className="text-right">
                    <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-faint">Pot</span>
                    <span className="font-display text-2xl font-black italic text-[#f2cf63]">{fmtGbp(g.pot)}</span>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Your stable */}
      {user && (
        <section>
          <Head eyebrow="Your stable" title={`${stable.length ? stable.length : "No"} darter${stable.length === 1 ? "" : "s"}`} href="/packs" cta="Add to it" />
          {stable.length === 0 ? (
            <p className="panel p-5 text-sm text-muted">Open a pack to sign your first darters.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {stable.map((c) => {
                const band = bandFor(c.template.player.ranking);
                return (
                  <div key={c.id} className={`rounded-xl border bg-ink-900 p-3 ${BAND_TONE[band]}`}>
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.14em]">{BANDS[band].label}</p>
                    <p className="mt-1 truncate font-semibold text-fg">{c.template.player.displayName}</p>
                    <p className="text-xs text-faint">World #{c.template.player.ranking ?? "—"} · #{c.serial}{c.lock === "COMPETITION" ? " · in a game" : ""}</p>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Packs */}
      <section>
        <Head eyebrow="Packs" title="Sign the world's best" href="/packs" cta="Pack shop" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {packs.map((p) => (
            <Link key={p.code} href="/packs" className="panel overflow-hidden transition hover:border-accent/70">
              <DartsPackArt code={p.code} name={p.name} />
              <div className="flex items-baseline justify-between gap-2 p-4">
                <span className="text-sm text-muted">{p.blurb}</span>
                <b className="shrink-0 tabular-nums">{fmtGbp(p.priceMinor)}</b>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* The elite */}
      {elite.length > 0 && (
        <section className="relative overflow-hidden rounded-3xl border border-[#f2cf63]/40 bg-[radial-gradient(80%_120%_at_100%_0%,rgb(232_21_45/0.25),transparent_60%),#0a0a0a] p-6">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#f2cf63]">The world&apos;s top 10 · only in the £10 Rare pack</p>
          <h2 className="mt-1 text-4xl">The elite</h2>
          <ol className="mt-4 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {elite.map((p) => (
              <li key={p.id} className="flex items-baseline gap-3 border-b border-white/5 py-1.5">
                <span className="w-6 text-right font-display text-xl font-black italic text-[#e8152d]">{p.ranking}</span>
                <span className="flex-1 font-semibold">{p.displayName}</span>
                <span className="text-xs text-faint">{p.nationality}</span>
              </li>
            ))}
          </ol>
          <Link href="/packs" className="btn-primary mt-5 px-5 py-3 text-sm">Open a Rare pack · £10</Link>
        </section>
      )}

      {/* How you score */}
      <section>
        <Head eyebrow="Scoring" title="Every dart counts" href="/how-it-works" cta="Full rules" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {[
            ["3-dart avg", "= points", "99.68 avg scores 99.68"],
            ["180", `+${s.oneEighty}`, "every maximum"],
            ["170 finish", `+${s.oneSeventyCheckout}`, "the big fish"],
            ["140+", `+${s.oneFortyPlus}`, "every visit"],
            ["100+ finish", `+${s.tonPlusCheckout}`, "ton-plus checkout"],
            ["Top checkout", `+${s.highestCheckoutBonus}`, "of the round"],
            ["Leg won", `+${s.legWon}`, "each one"],
            ["Match won", `+${s.matchWon}`, `whitewash +${s.whitewash}`],
            ["9-darter", `+${s.nineDarter}`, "perfection"],
            ["Checkout ≥40%", `+${s.checkoutPctBonus}`, "deadly on the doubles"],
            ["Progress", `+${s.progress.QF}…+${s.progress.WINNER}`, "QF, SF, Final, title"],
            ["Captain", `×${s.captainMultiplier}`, "everything doubled"],
          ].map(([what, pts, note]) => (
            <div key={what} className="rounded-xl border border-ink-700 bg-ink-900 p-3">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-faint">{what}</p>
              <p className="font-display text-3xl font-black italic text-lime">{pts}</p>
              <p className="text-xs text-muted">{note}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {Object.values(DARTS_BOOSTERS).map((b) => (
            <span key={b.name} title={b.description} className="rounded-full border border-ink-700 bg-ink-900 px-3 py-1 text-xs">
              {b.icon} {b.name}
            </span>
          ))}
          <span className="px-2 py-1 text-xs text-faint">— boosters: new managers get one of each</span>
        </div>
      </section>
    </div>
  );
}

function Head({ eyebrow, title, href, cta }: { eyebrow: string; title: string; href: string; cta: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div>
        <p className="eyebrow text-lime">{eyebrow}</p>
        <h2 className="mt-1 text-3xl sm:text-4xl">{title}</h2>
      </div>
      <Link href={href} className="text-sm font-bold text-lime">
        {cta} →
      </Link>
    </div>
  );
}
