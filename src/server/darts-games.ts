import type { DartsGame } from "@/generated/prisma/client";
import { DARTS_BOOSTERS, type DartsBoosterKind, boosterBonus } from "@/domain/darts/boosters";
import { DARTS_SCORING, type DartsStatLine, scoreDarter } from "@/domain/darts/scoring";
import { EVENT_TEAM_SIZE, TEAM_SIZE, bandFor, eventTeamIssues, teamIssues } from "@/domain/darts/teams";
import { audit } from "./audit";
import { type Tx, db } from "./db";
import { DomainError } from "./errors";
import { isEnabled } from "./flags";
import { creditWinnings, debit, fmtMp, lockWallet, release } from "./wallet";

/**
 * DartsX games (Phase 2b, agreed 17 Nov 2026).
 *
 *  - ROUND game — one per round of an event: a team of 3 (one Contender 1–25, one Challenger
 *    26–50, one Outsider 51+) from the darters playing that round; captain scores ×2.
 *  - EVENT game — the whole event (e.g. the World Championship): a stable of 4 picked before the
 *    first throw (one of each band plus a wildcard, max two Contenders); points build up round by
 *    round as long as your darters stay in.
 *
 * Entry starts at £1. Bet X: the prize pot is potPct (50%) of all the entry fees — £100 of
 * entries makes a £50 pot. The top score takes it; ties split it.
 *
 * Cards: a copy can be in one entry at a time (it's locked to that entry until the game settles).
 * So to play Luke Littler in five entries you need five copies of his card.
 */

export const DARTS_ENTRY_FEE_MINOR = 100;
export const DARTS_POT_PCT = 50;
export const DARTS_MAX_ENTRIES = 3;
/** Simulated events: a round is thrown this long after it starts (its game locks at the start). */
export const SIM_PLAY_AFTER_MS = 20 * 60_000;

const roundCost = (g: { entryFeeMinor: number }) => g.entryFeeMinor;
export const potFor = (g: { entryFeeMinor: number; potPct: number | null }, entries: number) =>
  g.potPct && g.entryFeeMinor > 0 ? Math.floor((entries * g.entryFeeMinor * g.potPct) / 100) : 0;

/** Can a game still be entered (open and before the first dart)? */
export const gameOpen = (g: Pick<DartsGame, "status" | "locksAt">, now = Date.now()) => g.status === "OPEN" && g.locksAt.getTime() > now;

/** The games for an event: the whole-event game plus one per round. Safe to call again. */
export async function createGamesForEvent(eventId: string, opts: { entryFeeMinor?: number; potPct?: number | null } = {}) {
  const event = await db.dartsEvent.findUniqueOrThrow({ where: { id: eventId }, include: { rounds: { orderBy: { number: "asc" } } } });
  const fee = opts.entryFeeMinor ?? DARTS_ENTRY_FEE_MINOR;
  const potPct = opts.potPct === undefined ? DARTS_POT_PCT : opts.potPct;
  const made: DartsGame[] = [];
  const want = [
    { roundId: null as string | null, kind: "EVENT" as const, name: `${event.name} · Full event`, teamSize: EVENT_TEAM_SIZE, locksAt: event.startsAt },
    // Round games while 8+ darters are left (a team of 3 needs a real choice); the Semis and Final count in the full-event game.
    ...event.rounds.filter((r) => event.rounds.length - r.number >= 2).map((r) => ({ roundId: r.id as string | null, kind: "ROUND" as const, name: `${event.name} · ${r.name}`, teamSize: TEAM_SIZE, locksAt: r.startsAt })),
  ];
  for (const w of want) {
    const exists = await db.dartsGame.findFirst({ where: { eventId, roundId: w.roundId, kind: w.kind } });
    if (exists) continue;
    made.push(await db.dartsGame.create({ data: { eventId, ...w, entryFeeMinor: fee, potPct, maxEntries: DARTS_MAX_ENTRIES } }));
  }
  return made;
}

/** The darters a game's teams are picked from: the round's draw, or the event's first round. */
async function darterScope(tx: Tx | typeof db, game: Pick<DartsGame, "eventId" | "roundId" | "kind">) {
  const round = game.roundId
    ? await tx.dartsRound.findUniqueOrThrow({ where: { id: game.roundId }, include: { matches: true } })
    : await tx.dartsRound.findFirstOrThrow({ where: { eventId: game.eventId, number: 1 }, include: { matches: true } });
  return new Set(round.matches.flatMap((m) => [m.aId, m.bId]));
}

export interface DartsEntryInput {
  entryNo?: number;
  picks: Array<{ cardId: string; captain?: boolean }>;
  /** One booster, on one of the picked cards. */
  booster?: { id: string; cardId: string } | null;
}

/**
 * Enter (or change) a team. Charged on the first save of each entry; cards are locked to the
 * entry so the same copy can't play twice at once.
 */
export async function enterDartsGame(userId: string, gameId: string, input: DartsEntryInput) {
  const entryNo = input.entryNo ?? 1;
  return db.$transaction(async (tx) => {
    const [game] = await tx.$queryRaw<DartsGame[]>`SELECT * FROM "DartsGame" WHERE id = ${gameId}::uuid FOR UPDATE`;
    if (!game) throw new DomainError("NOT_FOUND", "That game doesn't exist.");
    if (game.status !== "OPEN" || game.locksAt.getTime() <= Date.now()) throw new DomainError("LOCKED", "This game has locked — the darts have started.");
    if (entryNo < 1 || entryNo > game.maxEntries) throw new DomainError("ENTRIES", `Up to ${game.maxEntries} entries in this game.`);
    if (entryNo > 1 && game.entryFeeMinor === 0) throw new DomainError("ENTRIES", "Free games are one entry each.");
    if (entryNo > 1 && !(await tx.dartsEntry.findFirst({ where: { gameId, userId, entryNo: entryNo - 1 } }))) {
      throw new DomainError("ENTRIES", "Save your earlier entry first.");
    }
    const existing = await tx.dartsEntry.findUnique({ where: { gameId_userId_entryNo: { gameId, userId, entryNo } } });

    // The cards: yours, held, and not in another entry.
    const cardIds = input.picks.map((p) => p.cardId);
    if (new Set(cardIds).size !== cardIds.length) throw new DomainError("TEAM", "Each card can only be picked once.");
    const rows = cardIds.length
      ? await tx.$queryRaw<Array<{ id: string; ownerId: string | null; supplyState: string; lock: string; lockRef: string | null; playerId: string; ranking: number | null; name: string }>>`
          SELECT ci.id, ci."ownerId", ci."supplyState"::text AS "supplyState", ci."lock"::text AS "lock", ci."lockRef", p.id AS "playerId", p.ranking, p."displayName" AS name
          FROM "CardInstance" ci JOIN "CardTemplate" t ON t.id = ci."templateId" JOIN "Player" p ON p.id = t."playerId"
          WHERE ci.id = ANY(${cardIds}::uuid[]) FOR UPDATE OF ci`
      : [];
    const byId = new Map(rows.map((r) => [r.id, r]));
    const scope = await darterScope(tx, game);
    for (const id of cardIds) {
      const r = byId.get(id);
      if (!r || r.ownerId !== userId || r.supplyState !== "HELD") throw new DomainError("NOT_OWNER", "You don't own one of those cards.");
      const mine = existing && r.lock === "COMPETITION" && r.lockRef === existing.id;
      if (r.lock !== "NONE" && !mine) {
        throw new DomainError("CARD_IN_USE", `That ${r.name} card is already in another game (or on the Oche Shop). Use another copy, or wait for that game to finish.`);
      }
      if (!scope.has(r.playerId)) throw new DomainError("NOT_PLAYING", `${r.name} isn't in this draw.`);
    }
    const team = input.picks.map((p) => ({ darterId: byId.get(p.cardId)!.playerId, ranking: byId.get(p.cardId)!.ranking, captain: !!p.captain }));
    const inDraw = [...new Set([...(await tx.player.findMany({ where: { id: { in: [...scope] } }, select: { ranking: true } }))].map((p) => bandFor(p.ranking)))];
    const issues = game.kind === "EVENT" ? eventTeamIssues(team) : teamIssues(team, inDraw);
    if (issues.length) throw new DomainError("TEAM", issues.join(". ") + ".");

    // The booster: yours, unused (or already on this entry), and allowed on that darter.
    let boostCard: string | null = null;
    let booster: { id: string; kind: string } | null = null;
    if (input.booster) {
      const b = await tx.dartsBooster.findFirst({ where: { id: input.booster.id, userId } });
      if (!b || (b.usedEntryId && b.usedEntryId !== existing?.id)) throw new DomainError("BOOSTER", "That booster has been used.");
      if (!(b.kind in DARTS_BOOSTERS)) throw new DomainError("BOOSTER", "Unknown booster.");
      const on = byId.get(input.booster.cardId);
      if (!on || !cardIds.includes(input.booster.cardId)) throw new DomainError("BOOSTER", "Put the booster on one of your picks.");
      if (b.kind === "LUCKY_ARROWS" && bandFor(on.ranking) !== "OUTSIDER") throw new DomainError("BOOSTER", "Lucky Arrows only goes on your Outsider.");
      if (b.kind === "GIANT_KILLER" && bandFor(on.ranking) === "CONTENDER") throw new DomainError("BOOSTER", "Giant Killer goes on a Challenger or an Outsider.");
      boostCard = on.id;
      booster = b;
    }

    let entry = existing;
    if (!entry) {
      entry = await tx.dartsEntry.create({ data: { gameId, userId, entryNo } });
      if (game.entryFeeMinor > 0) {
        if (!(await isEnabled("PAID_ENTRY"))) throw new DomainError("FEATURE_DISABLED", "Paid games open once our legal review is complete.");
        await lockWallet(tx, userId);
        await debit(tx, { userId, amountMinor: roundCost(game), kind: "ENTRY_FEE", refId: `darts-entry:${entry.id}`, note: `${game.name}: ${fmtMp(game.entryFeeMinor)}` });
      }
    }

    // Swap the cards and booster over.
    await tx.cardInstance.updateMany({ where: { lock: "COMPETITION", lockRef: entry.id, id: { notIn: cardIds } }, data: { lock: "NONE", lockRef: null } });
    await tx.cardInstance.updateMany({ where: { id: { in: cardIds } }, data: { lock: "COMPETITION", lockRef: entry.id } });
    await tx.dartsPick.deleteMany({ where: { entryId: entry.id } });
    await tx.dartsPick.createMany({
      data: input.picks.map((p) => ({ entryId: entry!.id, cardId: p.cardId, playerId: byId.get(p.cardId)!.playerId, captain: !!p.captain, boosted: p.cardId === boostCard })),
    });
    await tx.dartsBooster.updateMany({ where: { usedEntryId: entry.id, id: { not: booster?.id ?? "00000000-0000-0000-0000-000000000000" } }, data: { usedEntryId: null } });
    if (booster) await tx.dartsBooster.update({ where: { id: booster.id }, data: { usedEntryId: entry.id } });
    await tx.dartsEntry.update({ where: { id: entry.id }, data: { boosterId: booster?.id ?? null } });
    return tx.dartsEntry.findUniqueOrThrow({ where: { id: entry.id }, include: { picks: true } });
  });
}

/** Withdraw before the game locks: fee back, cards and booster freed. */
export async function withdrawDartsEntry(userId: string, entryId: string) {
  return db.$transaction(async (tx) => {
    const entry = await tx.dartsEntry.findUnique({ where: { id: entryId }, include: { game: true } });
    if (!entry || entry.userId !== userId) throw new DomainError("NOT_FOUND", "That entry isn't yours.");
    if (entry.game.status !== "OPEN" || entry.game.locksAt.getTime() <= Date.now()) throw new DomainError("LOCKED", "This game has locked.");
    const later = await tx.dartsEntry.findFirst({ where: { gameId: entry.gameId, userId, entryNo: { gt: entry.entryNo } } });
    if (later) throw new DomainError("ENTRIES", "Withdraw your later entries first.");
    if (entry.game.entryFeeMinor > 0) {
      await lockWallet(tx, userId);
      await release(tx, { userId, refId: `darts-entry:${entry.id}`, kind: "ENTRY_REFUND", note: `Withdrawn: ${entry.game.name}` });
    }
    await tx.cardInstance.updateMany({ where: { lock: "COMPETITION", lockRef: entry.id }, data: { lock: "NONE", lockRef: null } });
    await tx.dartsBooster.updateMany({ where: { usedEntryId: entry.id }, data: { usedEntryId: null } });
    await tx.dartsEntry.delete({ where: { id: entry.id } });
  });
}

/** The finished matches a game counts. */
async function gameMatches(game: Pick<DartsGame, "eventId" | "roundId">) {
  return db.dartsMatch.findMany({
    where: { status: "FINISHED", ...(game.roundId ? { roundId: game.roundId } : { round: { eventId: game.eventId } }) },
    select: { aId: true, bId: true, statsA: true, statsB: true },
  });
}

/** One pick's points from the matches so far (booster included; the captain doubles the lot). */
export function pickPoints(
  darterId: string,
  matches: Array<{ aId: string; bId: string; statsA: unknown; statsB: unknown }>,
  ranks: Map<string, number | null>,
  opts: { captain: boolean; booster?: DartsBoosterKind | null },
) {
  let total = 0;
  for (const m of matches) {
    const side = m.aId === darterId ? "a" : m.bId === darterId ? "b" : null;
    if (!side) continue;
    const s = (side === "a" ? m.statsA : m.statsB) as DartsStatLine | null;
    if (!s) continue;
    const opp = side === "a" ? m.bId : m.aId;
    total += scoreDarter(s).points;
    if (opts.booster) total += boosterBonus(opts.booster, s, { band: bandFor(ranks.get(darterId)), opponentBand: bandFor(ranks.get(opp)) });
  }
  if (opts.captain) total *= DARTS_SCORING.captainMultiplier;
  return Math.round(total * 100) / 100;
}

/** Recount every entry's points and the leaderboard positions (ties share a place). */
export async function refreshGamePoints(gameId: string) {
  const game = await db.dartsGame.findUniqueOrThrow({ where: { id: gameId } });
  const matches = await gameMatches(game);
  const entries = await db.dartsEntry.findMany({ where: { gameId }, include: { picks: true } });
  const boosters = new Map(
    (await db.dartsBooster.findMany({ where: { id: { in: entries.map((e) => e.boosterId).filter((x): x is string => !!x) } } })).map((b) => [b.id, b.kind as DartsBoosterKind]),
  );
  const ids = [...new Set(matches.flatMap((m) => [m.aId, m.bId]))];
  const ranks = new Map((await db.player.findMany({ where: { id: { in: ids } }, select: { id: true, ranking: true } })).map((p) => [p.id, p.ranking]));
  const totals: Array<{ id: string; points: number }> = [];
  await db.$transaction(async (tx) => {
    for (const e of entries) {
      let sum = 0;
      for (const p of e.picks) {
        const pts = pickPoints(p.playerId, matches, ranks, { captain: p.captain, booster: p.boosted && e.boosterId ? boosters.get(e.boosterId) : null });
        sum += pts;
        if (pts !== p.points) await tx.dartsPick.update({ where: { id: p.id }, data: { points: pts } });
      }
      totals.push({ id: e.id, points: Math.round(sum * 100) / 100 });
    }
    totals.sort((a, b) => b.points - a.points);
    let rank = 0;
    for (const [i, t] of totals.entries()) {
      if (i === 0 || totals[i - 1].points !== t.points) rank = i + 1;
      await tx.dartsEntry.update({ where: { id: t.id }, data: { points: t.points, rank } });
    }
  });
  return totals;
}

/** Lock games whose darts have started. */
export async function lockDueGames(now = new Date()) {
  return (await db.dartsGame.updateMany({ where: { status: "OPEN", locksAt: { lte: now } }, data: { status: "LOCKED" } })).count;
}

/**
 * Settle a game once its round (or the whole event) is over: final points, then the Bet X pot
 * to the top score (ties split it; any odd penny stays with the house). Admins play for bragging
 * rights only. Cards are freed for the next game.
 */
export async function settleDartsGame(gameId: string) {
  await refreshGamePoints(gameId);
  return db.$transaction(async (tx) => {
    const [game] = await tx.$queryRaw<DartsGame[]>`SELECT * FROM "DartsGame" WHERE id = ${gameId}::uuid FOR UPDATE`;
    if (!game || game.status === "SETTLED" || game.status === "CANCELLED") return null;
    const entries = await tx.dartsEntry.findMany({ where: { gameId }, orderBy: { points: "desc" } });
    const pot = potFor(game, entries.length);
    const house = new Set((await tx.user.findMany({ where: { id: { in: entries.map((e) => e.userId) }, role: "ADMIN" }, select: { id: true } })).map((u) => u.id));
    const eligible = entries.filter((e) => !house.has(e.userId));
    const best = eligible[0]?.points;
    const winners = best === undefined ? [] : eligible.filter((e) => e.points === best);
    const share = winners.length ? Math.floor(pot / winners.length) : 0;
    if (share > 0) {
      for (const w of winners) {
        await lockWallet(tx, w.userId);
        await creditWinnings(tx, { userId: w.userId, amountMinor: share, refId: `darts-prize:${game.id}:${w.id}`, note: `Won ${game.name}${winners.length > 1 ? ` (shared ${winners.length} ways)` : ""}` });
        await tx.dartsEntry.update({ where: { id: w.id }, data: { prizeMinor: share } });
      }
    }
    await tx.cardInstance.updateMany({ where: { lock: "COMPETITION", lockRef: { in: entries.map((e) => e.id) } }, data: { lock: "NONE", lockRef: null } });
    await tx.dartsGame.update({ where: { id: game.id }, data: { status: "SETTLED", potMinor: pot, settledAt: new Date() } });
    await audit(tx, { actorId: null, action: "darts.game.settled", entityType: "DartsGame", entityId: game.id, after: { entries: entries.length, pot, winners: winners.map((w) => w.userId), share } });
    return { pot, winners: winners.map((w) => w.id), share };
  });
}

/** Has a game's darts finished? (Its round, or the whole event.) */
async function gameFinished(game: DartsGame) {
  if (game.roundId) return (await db.dartsRound.findUniqueOrThrow({ where: { id: game.roundId } })).status === "FINISHED";
  return (await db.dartsEvent.findUniqueOrThrow({ where: { id: game.eventId } })).status === "FINISHED";
}

/**
 * The every-5-minutes darts job: lock started games, throw due simulated rounds, keep a
 * simulated event on the calendar, make every event's games, update live points and settle.
 */
export async function runDartsJobs(now = new Date(), opts: { autoSchedule?: boolean } = {}) {
  const out = { locked: 0, played: 0, created: 0, refreshed: 0, settled: 0, scheduled: false };
  out.locked = await lockDueGames(now);

  // Simulated events: rounds go live at their start, and are thrown a little after.
  const { playSimRound, createSimEvent } = await import("./darts-events");
  await db.dartsRound.updateMany({ where: { status: "UPCOMING", startsAt: { lte: now }, event: { simulated: true } }, data: { status: "LIVE" } });
  const due = await db.dartsRound.findMany({
    where: { status: { not: "FINISHED" }, startsAt: { lte: new Date(now.getTime() - SIM_PLAY_AFTER_MS) }, event: { simulated: true }, matches: { some: {} } },
    orderBy: [{ startsAt: "asc" }, { number: "asc" }],
  });
  for (const r of due) {
    await playSimRound(r.id);
    out.played++;
  }

  // Always something to play: a simulated event tomorrow evening if nothing's on.
  if (opts.autoSchedule ?? true) {
    const on = await db.dartsEvent.count({ where: { status: { in: ["UPCOMING", "LIVE"] } } });
    const ranked = await db.player.count({ where: { sport: { code: "darts" }, ranking: { not: null } } });
    if (!on && ranked >= 32) {
      const n = (await db.dartsEvent.count()) + 1;
      const start = new Date(now);
      start.setUTCDate(start.getUTCDate() + 1);
      start.setUTCHours(19, 0, 0, 0);
      await createSimEvent({ name: `DartsX Open ${n}`, startsAt: start, fieldSize: 32, roundGapMinutes: 60 });
      out.scheduled = true;
    }
  }

  for (const e of await db.dartsEvent.findMany({ where: { status: { not: "FINISHED" } }, select: { id: true } })) {
    out.created += (await createGamesForEvent(e.id)).length;
  }
  for (const g of await db.dartsGame.findMany({ where: { status: "LOCKED" } })) {
    if (await gameFinished(g)) {
      await settleDartsGame(g.id);
      out.settled++;
    } else if (await db.dartsEntry.count({ where: { gameId: g.id } })) {
      await refreshGamePoints(g.id);
      out.refreshed++;
    }
  }
  return out;
}

/** For the games list: each game with its entries count and the pot so far. */
export async function dartsGamesList(userId?: string | null) {
  const games = await db.dartsGame.findMany({
    where: { status: { in: ["OPEN", "LOCKED", "SETTLED"] } },
    orderBy: [{ locksAt: "asc" }],
    take: 60,
    include: { _count: { select: { entries: true } }, entries: userId ? { where: { userId }, select: { id: true, points: true, rank: true, entryNo: true } } : false },
  });
  const events = new Map((await db.dartsEvent.findMany({ where: { id: { in: [...new Set(games.map((g) => g.eventId))] } } })).map((e) => [e.id, e]));
  return games.map((g) => ({ ...g, event: events.get(g.eventId)!, pot: g.potMinor ?? potFor(g, g._count.entries), mine: (g as { entries?: Array<{ id: string; points: number; rank: number | null; entryNo: number }> }).entries ?? [] }));
}
