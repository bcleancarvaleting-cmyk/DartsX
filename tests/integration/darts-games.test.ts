import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, withTx } from "@/server/db";
import { mintInstances } from "@/server/cards";
import { createSimEvent, playSimRound, seedDarters } from "@/server/darts-events";
import { createGamesForEvent, enterDartsGame, potFor, refreshGamePoints, runDartsJobs, settleDartsGame, withdrawDartsEntry } from "@/server/darts-games";
import { ensurePublished, grantPack, openPack } from "@/server/packs";
import { balancesFor, credit } from "@/server/wallet";
import { makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await seedDarters();
  process.env.LEGAL_GATES_CLEARED = "PAID_ENTRY";
  process.env.FLAG_PAID_ENTRY = "true";
});
afterEach(() => {
  delete process.env.LEGAL_GATES_CLEARED;
  delete process.env.FLAG_PAID_ENTRY;
});

/** A held copy of a darter's card for this manager. */
async function give(userId: string, playerId: string) {
  return withTx(async (tx) => {
    const t = await tx.cardTemplate.findFirstOrThrow({ where: { playerId } });
    const [id] = await mintInstances(tx, { templateId: t.id, count: 1, state: "HELD", ownerId: userId });
    return id;
  });
}
const fund = (userId: string, pence: number, ref: string) => withTx((tx) => credit(tx, { userId, amountMinor: pence, kind: "DEPOSIT", bucket: "CASH", refId: ref }));

/** One darter of each band from a round's draw. */
async function drawByBand(roundId: string) {
  const m = await db.dartsMatch.findMany({ where: { roundId } });
  const ps = await db.player.findMany({ where: { id: { in: m.flatMap((x) => [x.aId, x.bId]) } }, orderBy: { ranking: "asc" } });
  return {
    contenders: ps.filter((p) => p.ranking! <= 25),
    challengers: ps.filter((p) => p.ranking! > 25 && p.ranking! <= 50),
    outsiders: ps.filter((p) => p.ranking! > 50),
  };
}

describe("DartsX games", () => {
  it("cards are worth £5 at most, and packs never hold the top 10", async () => {
    const vals = await db.mPValuation.findMany({ where: { method: "darts-v1" } });
    expect(vals.length).toBe(128);
    expect(Math.max(...vals.map((v) => v.valueMp))).toBeLessThanOrEqual(5);
    const { userId } = await makeUser("packer");
    for (let i = 0; i < 4; i++) {
      const e = await withTx(async (tx) => {
        await ensurePublished(tx, "darts-contender");
        return grantPack(tx, { userId, skuCode: "darts-contender", source: "STARTER", sourceRef: `t${i}` });
      });
      await openPack(userId, e.id);
    }
    const got = await db.cardInstance.findMany({ where: { ownerId: userId, template: { player: { sport: { code: "darts" } } } }, include: { template: { include: { player: true } } } });
    expect(got.length).toBeGreaterThanOrEqual(26); // 6 starter + 4 × 5
    expect(got.every((c) => c.template.player.ranking! > 10)).toBe(true);
  });

  it("the £10 Rare pack gives 2 random darters from the world's top 10", async () => {
    const { userId } = await makeUser("rare");
    const sku = await withTx(async (tx) => {
      await ensurePublished(tx, "darts-rare");
      return tx.packSku.findFirstOrThrow({ where: { code: "darts-rare" } });
    });
    expect(sku.priceMinor).toBe(1000);
    const e = await withTx((tx) => grantPack(tx, { userId, skuCode: "darts-rare", source: "STARTER", sourceRef: "rare1" }));
    await openPack(userId, e.id);
    // The starter stable never has the top 10, so every top-10 card came from the Rare pack.
    const all = await db.cardInstance.findMany({ where: { ownerId: userId }, include: { template: { include: { player: true } } } });
    expect(all).toHaveLength(8); // 6 starter + 2
    const got = all.filter((c) => c.template.player.ranking! <= 10);
    expect(got).toHaveLength(2);
    expect(new Set(got.map((c) => c.template.playerId)).size).toBe(2);
  });

  it("new managers get a stable of 6 (2 per band, never the top 10) and one of each booster", async () => {
    const { userId } = await makeUser("rookie");
    const cards = await db.cardInstance.findMany({ where: { ownerId: userId }, include: { template: { include: { player: true } } } });
    expect(cards).toHaveLength(6);
    const r = cards.map((c) => c.template.player.ranking!);
    expect(r.every((x) => x > 10)).toBe(true);
    expect(r.filter((x) => x <= 25)).toHaveLength(2);
    expect(r.filter((x) => x > 25 && x <= 50)).toHaveLength(2);
    expect(r.filter((x) => x > 50)).toHaveLength(2);
    expect(cards.every((c) => c.tradeStatus === "NON_TRADEABLE")).toBe(true);
    expect(await db.dartsBooster.count({ where: { userId } })).toBe(6);
  });

  it("£1 round game: a copy plays once at a time, boosters count, Bet X pays 50% of entries to the winner", async () => {
    const ev = await createSimEvent({ name: "Test Open", startsAt: new Date(Date.now() + 3600_000) });
    const made = await createGamesForEvent(ev.id);
    expect(made.map((g) => g.kind).sort()).toEqual(["EVENT", "ROUND", "ROUND", "ROUND"]); // R32, L16, QF + full event
    const r1 = await db.dartsRound.findFirstOrThrow({ where: { eventId: ev.id, number: 1 } });
    const game = await db.dartsGame.findFirstOrThrow({ where: { roundId: r1.id } });
    expect(game.entryFeeMinor).toBe(100);
    const { contenders, challengers, outsiders } = await drawByBand(r1.id);
    expect(outsiders.length).toBeGreaterThan(0);

    const players = [];
    for (const name of ["ann", "bob", "cat", "dan"]) {
      const { userId } = await makeUser(name);
      await fund(userId, 500, `fund-${name}`);
      const cards = [await give(userId, contenders[0].id), await give(userId, challengers[0].id), await give(userId, outsiders[0].id)];
      players.push({ userId, cards });
    }
    const [a, b, c, d] = players;
    // A team breaking the bands is refused.
    const two = await give(a.userId, contenders[1].id);
    await expect(enterDartsGame(a.userId, game.id, { picks: [{ cardId: a.cards[0], captain: true }, { cardId: two }, { cardId: a.cards[2] }] })).rejects.toMatchObject({ code: "TEAM" });

    const booster = await db.dartsBooster.findFirstOrThrow({ where: { userId: a.userId, kind: "HOT_HAND" } });
    const entryA = await enterDartsGame(a.userId, game.id, { picks: [{ cardId: a.cards[0], captain: true }, { cardId: a.cards[1] }, { cardId: a.cards[2] }], booster: { id: booster.id, cardId: a.cards[0] } });
    expect((await balancesFor(a.userId)).cash).toBe(400); // £1 entry
    // The same copy can't go in a second entry…
    await expect(enterDartsGame(a.userId, game.id, { entryNo: 2, picks: [{ cardId: a.cards[0], captain: true }, { cardId: a.cards[1] }, { cardId: a.cards[2] }] })).rejects.toMatchObject({ code: "CARD_IN_USE" });
    // …or another game, until this one finishes.
    const evGame = await db.dartsGame.findFirstOrThrow({ where: { eventId: ev.id, kind: "EVENT" } });
    await expect(enterDartsGame(a.userId, evGame.id, { picks: [{ cardId: a.cards[0], captain: true }, { cardId: a.cards[1] }, { cardId: a.cards[2] }, { cardId: two }] })).rejects.toMatchObject({ code: "CARD_IN_USE" });
    // The booster is used up.
    expect((await db.dartsBooster.findUniqueOrThrow({ where: { id: booster.id } })).usedEntryId).toBe(entryA.id);

    for (const p of [b, c, d]) await enterDartsGame(p.userId, game.id, { picks: [{ cardId: p.cards[0] }, { cardId: p.cards[1], captain: true }, { cardId: p.cards[2] }] });
    // Withdraw: £1 back, cards and booster free.
    const dEntry = await db.dartsEntry.findFirstOrThrow({ where: { userId: d.userId } });
    await withdrawDartsEntry(d.userId, dEntry.id);
    expect((await balancesFor(d.userId)).cash).toBe(500);
    expect((await db.cardInstance.findUniqueOrThrow({ where: { id: d.cards[0] } })).lock).toBe("NONE");

    // Lock, throw, settle.
    await db.dartsGame.update({ where: { id: game.id }, data: { locksAt: new Date(), status: "LOCKED" } });
    await playSimRound(r1.id);
    const totals = await refreshGamePoints(game.id);
    // Ann (captain on the Contender, with Hot Hand) beats Bob & Cat, who picked the same darters without the boost.
    expect(totals[0].id).toBe(entryA.id);
    const res = await settleDartsGame(game.id);
    expect(res!.pot).toBe(potFor({ entryFeeMinor: 100, potPct: 50 }, 3)); // 3 × £1 × 50% = £1.50
    expect(res!.pot).toBe(150);
    expect((await balancesFor(a.userId)).winnings).toBe(150);
    expect((await db.cardInstance.findUniqueOrThrow({ where: { id: a.cards[0] } })).lock).toBe("NONE"); // free for the next game
    expect((await db.dartsGame.findUniqueOrThrow({ where: { id: game.id } })).status).toBe("SETTLED");
  });

  it("the full-event game: a stable of 4, points build up round by round, settled when the event ends", async () => {
    const ev = await createSimEvent({ name: "World Championship", startsAt: new Date(Date.now() + 3600_000), roundGapMinutes: 60 });
    await createGamesForEvent(ev.id);
    const game = await db.dartsGame.findFirstOrThrow({ where: { eventId: ev.id, kind: "EVENT" } });
    expect(game.teamSize).toBe(4);
    const r1 = await db.dartsRound.findFirstOrThrow({ where: { eventId: ev.id, number: 1 } });
    const { contenders, challengers, outsiders } = await drawByBand(r1.id);
    const { userId } = await makeUser("eve");
    await fund(userId, 300, "fund-eve");
    const cards = [await give(userId, contenders[0].id), await give(userId, contenders[1].id), await give(userId, challengers[0].id), await give(userId, outsiders[0].id)];
    // Three Contenders is too many.
    const third = await give(userId, contenders[2].id);
    await expect(enterDartsGame(userId, game.id, { picks: [cards[0], cards[1], third, cards[3]].map((cardId, i) => ({ cardId, captain: i === 0 })) })).rejects.toMatchObject({ code: "TEAM" });
    await enterDartsGame(userId, game.id, { picks: cards.map((cardId, i) => ({ cardId, captain: i === 0 })) });

    // The jobs: lock at the start, throw each round, build points, settle at the end.
    const rounds = await db.dartsRound.findMany({ where: { eventId: ev.id }, orderBy: { number: "asc" } });
    let last = 0;
    for (const r of rounds) {
      await runDartsJobs(new Date(r.startsAt.getTime() + 21 * 60_000), { autoSchedule: false });
      const e = await db.dartsEntry.findFirstOrThrow({ where: { gameId: game.id } });
      expect(e.points).toBeGreaterThanOrEqual(last); // only ever builds up
      last = e.points;
    }
    expect(last).toBeGreaterThan(0);
    const done = await db.dartsGame.findUniqueOrThrow({ where: { id: game.id } });
    expect(done.status).toBe("SETTLED");
    expect(done.potMinor).toBe(50); // one £1 entry → 50p
    expect((await balancesFor(userId)).winnings).toBe(50);
  });
});
