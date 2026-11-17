import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Prisma } from "@/generated/prisma/client";
import { MAX_SUPPLY } from "@/config/tiers";
import { highestCheckoutHolders, type DartsStatLine } from "@/domain/darts/scoring";
import { bandFor } from "@/domain/darts/teams";
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
    await db.cardTemplate.create({ data: { playerId: p.id, category: tier, maxSupply: MAX_SUPPLY[tier] } });
    added++;
  }
  return { darters: data.darters.length, added };
}

/** A simulated knockout event from the top of the rankings (seeded 1 v 32 …). */
export async function createSimEvent(input: { name: string; tour?: string; startsAt: Date; fieldSize?: 16 | 32 | 64; roundGapMinutes?: number }) {
  const sport = await dartsSport();
  const size = input.fieldSize ?? 32;
  const field = await db.player.findMany({ where: { sportId: sport.id, active: true, ranking: { not: null } }, orderBy: { ranking: "asc" }, take: size, select: { id: true, ranking: true } });
  if (field.length < size) throw new DomainError("FIELD", `Need ${size} ranked darters — load the rankings first.`);
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
