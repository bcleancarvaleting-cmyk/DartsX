import Link from "next/link";
import { notFound } from "next/navigation";
import { Countdown } from "@/components/countdown";
import { DartsTeamPicker } from "@/components/darts-team-picker";
import { DARTS_BOOSTERS, type DartsBoosterKind } from "@/domain/darts/boosters";
import { bandFor } from "@/domain/darts/teams";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { gameOpen, potFor } from "@/server/darts-games";
import { fmtGbp } from "@/server/wallet";

export const metadata = { title: "Darts game" };
export const dynamic = "force-dynamic";

export default async function DartsGamePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ entry?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { entry: entryParam } = await searchParams;
  const game = await db.dartsGame.findUnique({ where: { id } });
  if (!game) notFound();
  const event = await db.dartsEvent.findUniqueOrThrow({ where: { id: game.eventId } });
  const round = game.roundId
    ? await db.dartsRound.findUniqueOrThrow({ where: { id: game.roundId }, include: { matches: true } })
    : await db.dartsRound.findFirst({ where: { eventId: game.eventId, number: 1 }, include: { matches: true } });
  const scope = new Set(round?.matches.flatMap((m) => [m.aId, m.bId]) ?? []);

  const entries = await db.dartsEntry.findMany({ where: { gameId: id }, orderBy: [{ points: "desc" }, { createdAt: "asc" }], include: { picks: true } });
  const users = new Map((await db.user.findMany({ where: { id: { in: entries.map((e) => e.userId) } }, select: { id: true, displayName: true, clubName: true } })).map((u) => [u.id, u]));
  const darters = new Map((await db.player.findMany({ where: { id: { in: [...new Set(entries.flatMap((e) => e.picks.map((p) => p.playerId)))] } }, select: { id: true, displayName: true } })).map((p) => [p.id, p.displayName]));
  const mine = entries.filter((e) => e.userId === user.id).sort((a, b) => a.entryNo - b.entryNo);
  const editing = mine.find((e) => e.entryNo === Number(entryParam)) ?? (entryParam === "new" ? undefined : mine[0]);
  const nextNo = editing ? editing.entryNo : mine.length + 1;
  const open = gameOpen(game);
  const pot = game.potMinor ?? potFor(game, entries.length);

  // Your stable for this draw.
  const cards = open
    ? await db.cardInstance.findMany({
        where: { ownerId: user.id, supplyState: "HELD", template: { playerId: { in: [...scope] } } },
        include: { template: { include: { player: { select: { id: true, displayName: true, ranking: true } } } } },
        orderBy: [{ template: { player: { ranking: "asc" } } }, { serial: "asc" }],
      })
    : [];
  const boosters = open ? await db.dartsBooster.findMany({ where: { userId: user.id, OR: [{ usedEntryId: null }, ...(editing ? [{ usedEntryId: editing.id }] : [])] } }) : [];
  const seen = new Set<string>();
  const boosterChoices = boosters
    .filter((b) => b.kind in DARTS_BOOSTERS && (b.usedEntryId || !seen.has(b.kind)) && seen.add(b.kind))
    .map((b) => ({ id: b.id, kind: b.kind, ...DARTS_BOOSTERS[b.kind as DartsBoosterKind] }));

  return (
    <div className="space-y-8">
      <div>
        <Link href="/darts" className="text-sm text-muted">← Darts games</Link>
        <p className="eyebrow mt-3">{event.name}{event.simulated ? " · simulated from real rankings" : " · live data powered by SportX"}</p>
        <h1 className="mt-1 text-4xl leading-none">{game.name.replace(`${event.name} · `, "")}</h1>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <span className="rounded-lg border border-ink-700 px-3 py-1.5">Entry <b>{game.entryFeeMinor ? fmtGbp(game.entryFeeMinor) : "Free"}</b></span>
          <span className="rounded-lg border border-[#f5c451]/50 px-3 py-1.5">Bet X pot <b className="text-[#f5c451]">{fmtGbp(pot)}</b> <span className="text-faint">· {game.potPct ?? 0}% of entries</span></span>
          <span className="rounded-lg border border-ink-700 px-3 py-1.5">{entries.length} entries · up to {game.maxEntries} each</span>
          {open && <span className="rounded-lg border border-ink-700 px-3 py-1.5">Locks in <Countdown to={game.locksAt.toISOString()} className="font-semibold" /></span>}
        </div>
      </div>

      {open && (
        <section className="panel space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-2xl">{editing ? `Your entry ${editing.entryNo}` : mine.length ? `Entry ${nextNo}` : "Pick your team"}</h2>
            <div className="flex gap-2 text-xs">
              {mine.map((e) => (
                <Link key={e.id} href={`?entry=${e.entryNo}`} className={`rounded-lg border px-2 py-1 ${editing?.id === e.id ? "border-mint" : "border-ink-700"}`}>Entry {e.entryNo}</Link>
              ))}
              {mine.length > 0 && mine.length < game.maxEntries && game.entryFeeMinor > 0 && <Link href="?entry=new" className="rounded-lg border border-ink-700 px-2 py-1">+ Another entry</Link>}
            </div>
          </div>
          <DartsTeamPicker
            key={editing?.id ?? `new-${nextNo}`}
            gameId={game.id}
            teamSize={game.teamSize}
            entryNo={nextNo}
            entryId={editing?.id}
            feeLabel={game.entryFeeMinor ? fmtGbp(game.entryFeeMinor) : "free"}
            rule={
              game.kind === "EVENT"
                ? "A stable of 4 for the whole event: at least one Contender, one Challenger and one Outsider, plus a wildcard (no more than two Contenders). Points build every round your darters stay in. Captain ×2."
                : "A team of 3: one Contender, one Challenger and one Outsider from this round's draw. Captain ×2. Each card copy plays in one game at a time."
            }
            initial={editing ? { cards: editing.picks.map((p) => p.cardId), captain: editing.picks.find((p) => p.captain)?.cardId, boosterId: editing.boosterId ?? undefined, boostOn: editing.picks.find((p) => p.boosted)?.cardId } : undefined}
            cards={cards.map((c) => ({
              id: c.id,
              name: c.template.player.displayName,
              ranking: c.template.player.ranking,
              band: bandFor(c.template.player.ranking),
              serial: c.serial,
              inThisEntry: !!editing && c.lockRef === editing.id,
              busy: c.lock !== "NONE" && !(editing && c.lock === "COMPETITION" && c.lockRef === editing.id),
            }))}
            boosters={boosterChoices}
          />
        </section>
      )}

      <section className="panel p-5">
        <h2 className="mb-3 text-2xl">Leaderboard</h2>
        {!entries.length ? (
          <p className="text-sm text-muted">No entries yet — be the first on the oche.</p>
        ) : (
          <ol className="divide-y divide-ink-800">
            {entries.map((e, i) => {
              const u = users.get(e.userId);
              return (
                <li key={e.id} className={`flex items-center gap-3 py-2.5 ${e.userId === user.id ? "text-mint" : ""}`}>
                  <span className="w-8 text-right font-bold tabular-nums">{e.rank ?? i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{u?.clubName ?? u?.displayName ?? "Manager"}{e.entryNo > 1 ? ` (${e.entryNo})` : ""}</span>
                    <span className="block truncate text-xs text-faint">
                      {e.picks.map((p) => `${darters.get(p.playerId) ?? "?"}${p.captain ? " (C)" : ""}${p.boosted ? " ⚡" : ""} ${p.points}`).join(" · ")}
                    </span>
                  </span>
                  {e.prizeMinor > 0 && <span className="rounded-full bg-[#f5c451]/15 px-2 py-0.5 text-xs font-bold text-[#f5c451]">{fmtGbp(e.prizeMinor)}</span>}
                  <span className="w-20 text-right font-bold tabular-nums">{e.points.toFixed(2)}</span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
