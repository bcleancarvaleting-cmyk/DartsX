import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Prisma } from "@/generated/prisma/client";
import { MAX_SUPPLY } from "@/config/tiers";
import { highestCheckoutHolders, type DartsStatLine } from "@/domain/darts/scoring";
import { BANDS, bandFor, dartsValueGbp } from "@/domain/darts/teams";
import { DARTS_BOOSTER_KINDS } from "@/domain/darts/boosters";
import { mintInstances } from "./cards";
import type { Tx } from "./db";
import { knockoutRounds, seededPairs, simulateMatch } from "@/domain/darts/simulate";
import { db } from "./db";
import { DomainError } from "./errors";

/** The darts sport (created on first use). */
export async function dartsSport() {
  return db.sport.upsert({ where: { code: "darts" }, create: { code: "darts", name: "Darts" }, update: {} });
}

/** Card tier by ranking band: Contenders (1–25) Gold, Challengers (26–50) Silver, Outsiders Bronze. */
export const TIER_FOR_BAND = { CONTENDER: "GOLD", CHALLENGER: "SILVER", OUTSIDER: "BRONZE" } as const;

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
    const tier = TIER_FOR_BAND[bandFor(d.rank)];
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
      const t = await tx.cardTemplate.create({ data: { playerId: p.id, category: tier, maxSupply: MAX_SUPPLY[tier] } });
      // The first release: copies in the pack pool (packs skip the top 10 by ranking).
      await mintInstances(tx, { templateId: t.id, count: FIRST_RELEASE[tier], state: "AVAILABLE" });
    });
    added++;
  }
  await refreshDartsValues();
  return { darters: data.darters.length, added };
}

/** Copies of each darter put into the pack pool when they're first loaded. */
export const FIRST_RELEASE = { GOLD: 50, SILVER: 100, BRONZE: 150 } as const;

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
 * The DartsX welcome: a stable of 6 (2 Contenders ranked 11–25, 2 Challengers, 2 Outsiders —
 * never the top 10), untradeable, plus one of every booster. Does nothing if the darters
 * aren't loaded yet, or if the manager already had it.
 */
export async function grantDartsStarter(tx: Tx, userId: string) {
  if (await tx.dartsBooster.findFirst({ where: { userId, source: "starter" } })) return { cards: [] as string[] };
  const sport = await tx.sport.findUnique({ where: { code: "darts" } });
  if (!sport) return { cards: [] as string[] };
  const picks: Array<{ from: number; to: number }> = [
    { from: 11, to: BANDS.CONTENDER.to! },
    { from: BANDS.CHALLENGER.from, to: BANDS.CHALLENGER.to! },
    { from: BANDS.OUTSIDER.from, to: 10_000 },
  ];
  const cards: string[] = [];
  for (const band of picks) {
    const pool = await tx.player.findMany({ where: { sportId: sport.id, active: true, ranking: { gte: band.from, lte: band.to } }, select: { id: true, templates: { where: { edition: "STANDARD", active: true }, select: { id: true } } } });
    const shuffled = pool.filter((p) => p.templates[0]).sort(() => Math.random() - 0.5).slice(0, 2);
    for (const p of shuffled) {
      const [id] = await mintInstances(tx, { templateId: p.templates[0].id, count: 1, state: "HELD", ownerId: userId, tradeStatus: "NON_TRADEABLE" });
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
export async function createSimEvent(input: { name: string; tour?: string; startsAt: Date; fieldSize?: 16 | 32 | 64; roundGapMinutes?: number }) {
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
