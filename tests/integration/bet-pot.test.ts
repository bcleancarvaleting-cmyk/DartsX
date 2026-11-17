import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { refreshBetPot } from "@/server/competitions";
import { buildWorld, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

describe("Bet X prize pot", () => {
  it("is 50% of all entry fees: £100 of entries makes a £50 pot, winner takes it", async () => {
    const sport = await db.sport.findFirstOrThrow();
    const gw = await db.gameweek.create({ data: { sportId: sport.id, season: "x", number: 1, startsAt: new Date(), endsAt: new Date(Date.now() + 86_400_000), status: "OPEN" } });
    const comp = await db.competition.create({
      data: { sportId: sport.id, gameweekId: gw.id, code: "betx", name: "Bet X Night", format: "OPEN", rosterRules: "football-roster-v4", scoringRules: "football-scoring-v3-draft", entryOpensAt: new Date(), locksAt: new Date(Date.now() + 3_600_000), status: "OPEN", entryFeeMinor: 1000, potPct: 50, rewards: [{ rankFrom: 1, rankTo: 3, packSkuCode: "football-eng-gold" }] },
    });
    // Ten £10 entries.
    for (let i = 0; i < 10; i++) {
      const u = await makeUser(`betx${i}`);
      await db.competitionEntry.create({ data: { competitionId: comp.id, userId: u.userId, formation: "2-2-2" } });
    }
    expect(await db.$transaction((tx) => refreshBetPot(tx, comp.id))).toEqual({ pot: 5000, entries: 10, takenMinor: 10000 });
    const rewards = (await db.competition.findUniqueOrThrow({ where: { id: comp.id } })).rewards;
    expect(rewards).toEqual([{ rankFrom: 1, rankTo: 1, cashMinor: 5000 }, { rankFrom: 1, rankTo: 3, packSkuCode: "football-eng-gold" }]);
    // One withdraws: the pot follows.
    await db.competitionEntry.deleteMany({ where: { competitionId: comp.id, user: { displayName: "betx0" } } });
    expect((await db.$transaction((tx) => refreshBetPot(tx, comp.id)))?.pot).toBe(4500);
  });
});
