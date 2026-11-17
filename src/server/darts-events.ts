import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Prisma } from "@/generated/prisma/client";
import { highestCheckoutHolders, type DartsStatLine } from "@/domain/darts/scoring";
import { CARD_TIERS, bandFor, dartsValueGbp, fairStarterPairs, tierFor } from "@/domain/darts/teams";
import { DARTS_BOOSTER_KINDS } from "@/domain/darts/boosters";
import { ensureTemplate, mintInstances } from "./cards";
import type { Tx } from "./db";
import { knockoutRounds, seededPairs, simulateMatch } from "@/domain/darts/simulate";
import { db } from "./db";
import { DomainError } from "./errors";

/** The darts sport (created on first use). */
export async function dartsSport() {
  return db.sport.upsert({ where: { code: "darts" }, create: { code: "darts", name: "Darts" }, update: {} });
}


/**
 * Load the darters from prisma/data/darts-rankings.json (the PDC Order of Merit): each gets their
 * ranking, nationality and ranking prize money, and a card design in their band's tier. Safe to run
 * again: rankings update, nobody is duplicated.
 */
export async function seedDarters(file = join(process.cwd(), "prisma", "data", "darts-rankings.json")) {
  const data = JSON.parse(readFileSync(file, "utf8")) as { darters: Array<{ rank: number; name: string; country: string | null; earningsGbp: number }> };
  const sport = await dartsSport();
  let added = 0;
  for (const d of data.darters) {
    const parts = d.name.trim().split(/\s+/);
    const existing = await db.player.findFirst({ where: { sportId: sport.id, displayName: d.name } });
    const tier = CARD_TIERS[tierFor(d.rank)];
    if (existing) {
      await db.player.update({ where: { id: existing.id }, data: { ranking: d.rank, earningsGbp: d.earningsGbp, nationality: d.country ?? existing.nationality } });
      continue;
    }
    const p = await db.player.create({
      data: {
        sportId: sport.id,
        firstName: parts.length > 1 ? parts[0] : "",
        lastName: parts.length > 1 ? parts.slice(1).join(" ") : parts[0],
        displayName: d.name,
        position: "ATT", // unused for darts (the schema is shared with the football build)
        nationality: d.country ?? "",
        ranking: d.rank,
        earningsGbp: d.earningsGbp,
        rightsStatus: "PENDING",
      },
    });
    await db.$transaction(async (tx) => {
      // The whole circulation is minted into the pack pool now: Legends 10, Tops 40, Tour cards 60.
      const t = await tx.cardTemplate.create({ data: { playerId: p.id, category: tier.category, maxSupply: tier.copies } });
      await mintInstances(tx, { templateId: t.id, count: tier.copies, state: "AVAILABLE" });
    });
    added++;
  }
  await refreshDartsValues();
  return { darters: data.darters.length, added };
}


/** Every darter's card value (≤ £5, by world ranking), recorded when it changes. */
export async function refreshDartsValues() {
  const sport = await dartsSport();
  const players = await db.player.findMany({
    where: { sportId: sport.id },
    select: { id: true, ranking: true, templates: { where: { edition: "STANDARD" }, select: { category: true } }, valuations: { orderBy: { computedAt: "desc" }, take: 1, select: { valueMp: true } } },
  });
  const rows = players.flatMap((p) =>
    p.templates
      .map((t) => ({ playerId: p.id, category: t.category, valueMp: dartsValueGbp(p.ranking), method: "darts-v1", signals: { ranking: p.ranking, capGbp: 5 } }))
      .filter((r) => p.valuations[0]?.valueMp !== r.valueMp),
  );
  if (rows.length) await db.mPValuation.createMany({ data: rows });
  return rows.length;
}

/**
 * The DartsX welcome: a fair stable of 6 — two Contenders (21–25), two Challengers (26–50) and two
 * Outsiders (51+), each pair mirrored so every new manager's stable is equally strong (see
 * fairStarterPairs) — plus one of every booster. Starter cards are their own untradeable edition, so
 * they never eat into the tiny Legend/Top/Tour circulation. Does nothing if the darters aren't
 * loaded yet, or if the manager already had it.
 */
export async function grantDartsStarter(tx: Tx, userId: string, pick: (pairs: number) => number = (n) => Math.floor(Math.random() * n)) {
  if (await tx.dartsBooster.findFirst({ where: { userId, source: "starter" } })) return { cards: [] as string[] };
  const sport = await tx.sport.findUnique({ where: { code: "darts" } });
  if (!sport) return { cards: [] as string[] };
  const ranked = await tx.player.findMany({ where: { sportId: sport.id, active: true, ranking: { gt: 20 } }, select: { id: true, ranking: true } });
  const byRank = new Map(ranked.map((p) => [p.ranking!, p]));
  const cards: string[] = [];
  for (const pair of fairStarterPairs(ranked.map((p) => p.ranking!), pick)) {
    for (const rank of pair) {
      const p = byRank.get(rank)!;
      const t = await ensureTemplate(tx, p.id, CARD_TIERS[tierFor(rank)].category, "STARTER");
      const [id] = await mintInstances(tx, { templateId: t.id, count: 1, state: "HELD", ownerId: userId, tradeStatus: "NON_TRADEABLE" });
      if (!id) continue;
      await tx.cardOwnership.create({ data: { cardId: id, userId, acquiredVia: "STARTER_PACK", acquiredRef: `darts-starter:${userId}` } });
      cards.push(id);
    }
  }
  if (!cards.length) return { cards };
  await tx.dartsBooster.createMany({ data: DARTS_BOOSTER_KINDS.map((kind) => ({ userId, kind, source: "starter" })) });
  return { cards };
}

/**
 * A simulated event's field, so every band is in it: the top 5/8 of the field by ranking, then
 * qualifiers drawn at random — 3/16 Challengers (26–50) and 3/16 Outsiders (51+) — seeded by ranking.
 */
async function simField(sportId: string, size: number) {
  const ranked = await db.player.findMany({ where: { sportId, active: true, ranking: { not: null } }, orderBy: { ranking: "asc" }, select: { id: true, ranking: true } });
  // A 128 field is everyone: every card in every stable can play.
  if (ranked.length >= size && ranked.length < size * 2) return ranked.slice(0, size);
  if (ranked.length < size * 2) throw new DomainError("FIELD", `Need ${size * 2} ranked darters — load the rankings first.`);
  const qual = Math.floor((size * 3) / 16);
  const top = ranked.slice(0, size - 2 * qual);
  const draw = (from: typeof ranked, n: number) => [...from].sort(() => Math.random() - 0.5).slice(0, n);
  const left = ranked.slice(top.length);
  const mid = draw(left.filter((p) => bandFor(p.ranking) === "CHALLENGER"), qual);
  const out = draw(left.filter((p) => bandFor(p.ranking) === "OUTSIDER"), qual);
  const all = [...top, ...mid, ...out];
  if (all.length < size) throw new DomainError("FIELD", "Not enough darters in every band for a field.");
  return all.sort((a, b) => a.ranking! - b.ranking!);
}

/** A simulated knockout event from the top of the rankings (seeded 1 v 32 …). */
export async function createSimEvent(input: { name: string; tour?: string; startsAt: Date; fieldSize?: 16 | 32 | 64 | 128; roundGapMinutes?: number }) {
  const sport = await dartsSport();
  const size = input.fieldSize ?? 32;
  const field = await simField(sport.id, size);
  const ladder = knockoutRounds(size);
  const gap = (input.roundGapMinutes ?? 60) * 60_000;
  return db.$transaction(async (tx) => {
    const event = await tx.dartsEvent.create({
      data: { name: input.name, tour: input.tour ?? "DartsX Tour", startsAt: input.startsAt, endsAt: new Date(input.startsAt.getTime() + ladder.length * gap), simulated: true },
    });
    for (const [i, r] of ladder.entries()) {
      await tx.dartsRound.create({ data: { eventId: event.id, number: i + 1, name: r.name, stage: r.stage, legsToWin: r.legsToWin, startsAt: new Date(input.startsAt.getTime() + i * gap) } });
    }
    const first = await tx.dartsRound.findFirstOrThrow({ where: { eventId: event.id, number: 1 } });
    await tx.dartsMatch.createMany({ data: seededPairs(field).map(([a, b], i) => ({ roundId: first.id, order: i + 1, aId: a.id, bId: b.id, startsAt: first.startsAt })) });
    return event;
  });
}

/**
 * Play a simulated round: every match gets its result and stats, the highest checkout of the round is
 * marked, and the winners go through to the next round (bracket order kept). The last round ends
 * the event.
 */
export async function playSimRound(roundId: string) {
  const round = await db.dartsRound.findUniqueOrThrow({ where: { id: roundId }, include: { matches: { orderBy: { order: "asc" } }, event: true } });
  if (round.status === "FINISHED") return round;
  const ids = [...new Set(round.matches.flatMap((m) => [m.aId, m.bId]))];
  const rank = new Map((await db.player.findMany({ where: { id: { in: ids } }, select: { id: true, ranking: true } })).map((p) => [p.id, p.ranking]));
  const played = round.matches.map((m) => ({ m, r: simulateMatch(rank.get(m.aId) ?? null, rank.get(m.bId) ?? null, round.legsToWin, `${round.id}:${m.id}`) }));
  const top = highestCheckoutHolders(played.flatMap(({ m, r }) => [{ darterId: m.aId, checkouts: r.a.checkouts }, { darterId: m.bId, checkouts: r.b.checkouts }]));
  const stage = (round.stage ?? null) as DartsStatLine["reached"];
  return db.$transaction(async (tx) => {
    for (const { m, r } of played) {
      const a: DartsStatLine = { ...r.a, reached: r.a.won ? stage : null, highestCheckoutOfRound: top.has(m.aId) };
      const b: DartsStatLine = { ...r.b, reached: r.b.won ? stage : null, highestCheckoutOfRound: top.has(m.bId) };
      await tx.dartsMatch.update({
        where: { id: m.id },
        data: { legsA: r.legsA, legsB: r.legsB, winnerId: r.a.won ? m.aId : m.bId, status: "FINISHED", statsA: a as unknown as Prisma.InputJsonValue, statsB: b as unknown as Prisma.InputJsonValue },
      });
    }
    await tx.dartsRound.update({ where: { id: round.id }, data: { status: "FINISHED" } });
    const next = await tx.dartsRound.findFirst({ where: { eventId: round.eventId, number: round.number + 1 } });
    if (next) {
      const winners = played.map(({ m, r }) => (r.a.won ? m.aId : m.bId));
      const pairs: Array<[string, string]> = [];
      for (let i = 0; i < winners.length; i += 2) pairs.push([winners[i], winners[i + 1]]);
      await tx.dartsMatch.createMany({ data: pairs.map(([a, b], i) => ({ roundId: next.id, order: i + 1, aId: a, bId: b, startsAt: next.startsAt })) });
      await tx.dartsEvent.update({ where: { id: round.eventId }, data: { status: "LIVE" } });
    } else {
      await tx.dartsEvent.update({ where: { id: round.eventId }, data: { status: "FINISHED" } });
    }
    return tx.dartsRound.findUniqueOrThrow({ where: { id: round.id }, include: { matches: true } });
  });
}
