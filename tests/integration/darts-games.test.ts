import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, withTx } from "@/server/db";
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
  // Hand over a copy from the pack pool (the whole circulation is minted up front).
  return withTx(async (tx) => {
    const c = await tx.cardInstance.findFirstOrThrow({ where: { supplyState: "AVAILABLE", template: { playerId, edition: "STANDARD" } } });
    await tx.cardInstance.update({ where: { id: c.id }, data: { supplyState: "HELD", ownerId: userId } });
    return c.id;
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
  it("a small circulation: Legends 10 each (top 20), Tops 40 (21–50), Tour 60 (51+); values ≤ £5", async () => {
    const vals = await db.mPValuation.findMany({ where: { method: "darts-v1" } });
    expect(vals.length).toBe(128);
    expect(Math.max(...vals.map((v) => v.valueMp))).toBeLessThanOrEqual(5);
    const count = async (where: object) => db.cardInstance.count({ where: { template: { edition: "STANDARD", player: where } } });
    expect(await count({ ranking: 1 })).toBe(10);
    // The rankings skip a few places, so count darters rather than assume 20 / 30 / 78.
    const darters = async (ranking: object) => db.player.count({ where: { sport: { code: "darts" }, ranking } });
    expect(await count({ ranking: { lte: 20 } })).toBe((await darters({ lte: 20 })) * 10);
    expect(await count({ ranking: { gt: 20, lte: 50 } })).toBe((await darters({ gt: 20, lte: 50 })) * 40);
    expect(await count({ ranking: { gt: 50 } })).toBe((await darters({ gt: 50 })) * 60);
    const no1 = await db.cardTemplate.findFirstOrThrow({ where: { edition: "STANDARD", player: { ranking: 1 } } });
    expect(no1).toMatchObject({ category: "GOLD", maxSupply: 10 });
  });

  it("regular packs never hold a Legend", async () => {
    const { userId } = await makeUser("packer");
    for (const [i, code] of ["darts-contender", "darts-challenger", "darts-outsider", "darts-contender"].entries()) {
      const e = await withTx(async (tx) => {
        await ensurePublished(tx, code);
        return grantPack(tx, { userId, skuCode: code, source: "STARTER", sourceRef: `t${i}` });
      });
      await openPack(userId, e.id);
    }
    const got = await db.cardInstance.findMany({ where: { ownerId: userId, template: { edition: "STANDARD" } }, include: { template: { include: { player: true } } } });
    expect(got).toHaveLength(20);
    expect(got.every((c) => c.template.player.ranking! > 20)).toBe(true);
    // The Contender pack's Contender is a Top ranked 21–25.
    expect(got.some((c) => c.template.player.ranking! <= 25)).toBe(true);
  });

  it("the £10 Rare pack gives 2 random Legends (top 20)", async () => {
    const { userId } = await makeUser("rare");
    const sku = await withTx(async (tx) => {
      await ensurePublished(tx, "darts-rare");
      return tx.packSku.findFirstOrThrow({ where: { code: "darts-rare" }, orderBy: { version: "desc" } });
    });
    expect(sku.priceMinor).toBe(1000);
    const e = await withTx((tx) => grantPack(tx, { userId, skuCode: "darts-rare", source: "STARTER", sourceRef: "rare1" }));
    await openPack(userId, e.id);
    const got = await db.cardInstance.findMany({ where: { ownerId: userId, template: { edition: "STANDARD" } }, include: { template: { include: { player: true } } } });
    expect(got).toHaveLength(2);
    expect(got.every((c) => c.template.player.ranking! <= 20 && c.template.category === "GOLD")).toBe(true);
    expect(new Set(got.map((c) => c.template.playerId)).size).toBe(2);
  });

  it("new managers get a fair stable of 6 (mirrored pairs per band, no Legends), untradeable, plus every booster", async () => {
    const sums: number[] = [];
    for (const name of ["rookie1", "rookie2", "rookie3"]) {
      const { userId } = await makeUser(name);
      const cards = await db.cardInstance.findMany({ where: { ownerId: userId }, include: { template: { include: { player: true } } } });
      expect(cards).toHaveLength(6);
      expect(cards.every((c) => c.template.edition === "STARTER" && c.tradeStatus === "NON_TRADEABLE")).toBe(true);
      const r = cards.map((c) => c.template.player.ranking!).sort((a, b) => a - b);
      expect(r.filter((x) => x >= 21 && x <= 25)).toHaveLength(2);
      expect(r.filter((x) => x > 25 && x <= 50)).toHaveLength(2);
      expect(r.filter((x) => x > 50)).toHaveLength(2);
      // Each band's pair mirrors: 21+25, 22+24 … 26+50, 27+49 … (± a place where the rankings skip one).
      expect(Math.abs(r[0] + r[1] - 46)).toBeLessThanOrEqual(2);
      expect(Math.abs(r[2] + r[3] - 76)).toBeLessThanOrEqual(2);
      sums.push(r[0] + r[1] + r[2] + r[3]);
      expect(await db.dartsBooster.count({ where: { userId } })).toBe(6);
    }
    expect(Math.max(...sums) - Math.min(...sums)).toBeLessThanOrEqual(3); // every stable as strong as the next
    // Starter cards don't come out of the circulation.
    expect(await db.cardInstance.count({ where: { supplyState: "HELD", template: { edition: "STANDARD" } } })).toBe(0);
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
