import { beforeEach, describe, expect, it } from "vitest";
import { OCHE_PRIZES, outcomeFor, planDarts } from "@/domain/darts/oche-game";
import { db } from "@/server/db";
import { throwAtOche, todaysThrow } from "@/server/oche-throw";
import { applyPromo, bestClaim, claimPromo } from "@/server/promo";
import { withTx } from "@/server/db";
import { makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
});

/** A fixed sequence of "random" numbers for a throw. */
const seq = (...xs: number[]) => {
  let i = 0;
  return (n: number) => xs[i++ % xs.length] % n;
};

describe("The pack-shop throw", () => {
  it("every outcome wins and the darts add up", () => {
    expect(outcomeFor(0)).toBe("180");
    expect(outcomeFor(499)).toBe("180");
    expect(outcomeFor(500)).toBe("170");
    expect(outcomeFor(1999)).toBe("170");
    expect(outcomeFor(2000)).toBe("D20");
    expect(outcomeFor(9999)).toBe("D20");
    const total = (o: "180" | "170" | "D20") => planDarts(o, () => 0).reduce((s, d) => s + d.score, 0);
    expect(total("180")).toBe(180);
    expect(total("170")).toBe(170);
    for (let k = 0; k < 8; k++) expect(planDarts("D20", () => k).at(-1)!.label).toBe("D20");
    expect(Object.values(OCHE_PRIZES).reduce((s, p) => s + p.chanceBp, 0)).toBe(10_000);
  });

  it("once a day; a 180 is 20% off the next pack, used once, then the welcome code is next", async () => {
    const { userId } = await makeUser("thrower");
    const now = new Date("2026-11-17T12:00:00Z");
    const r = await throwAtOche(userId, seq(100, 0, 0, 0, 0, 0, 0, 0), now); // roll 100 → 180
    expect(r.outcome).toBe("180");
    expect(r.pct).toBe(20);
    expect(r.code).toMatch(/^OCHE20-[A-Z0-9]{6}$/);
    expect(r.darts.map((d) => d.label)).toEqual(["T20", "T20", "T20"]);
    await expect(throwAtOche(userId, seq(9000), now)).rejects.toMatchObject({ code: "THROWN" });
    expect((await todaysThrow(userId, now))?.code).toBe(r.code);

    await claimPromo(userId, "DARTSX"); // 50% welcome code: the bigger discount goes first
    expect((await bestClaim(db, userId))?.def.pct).toBe(50);
    await db.promoClaim.updateMany({ where: { userId, code: "DARTSX" }, data: { usedAt: new Date() } });
    expect((await bestClaim(db, userId))?.c.code).toBe(r.code);
    const p = await withTx((tx) => applyPromo(tx, userId, 1000, "order-1"));
    expect(p).toEqual({ priceMinor: 800, code: r.code });
    const again = await withTx((tx) => applyPromo(tx, userId, 1000, "order-2"));
    expect(again.priceMinor).toBe(1000); // single use

    // The next day: another throw, a Double 20 for 10%.
    const r2 = await throwAtOche(userId, seq(9000, 3, 4), new Date("2026-11-18T12:00:00Z"));
    expect(r2).toMatchObject({ outcome: "D20", pct: 10 });
    expect(r2.darts.at(-1)!.label).toBe("D20");
  });

  it("codes expire after 7 days and can't be used by anyone else", async () => {
    const a = await makeUser("alice");
    const b = await makeUser("bobby");
    const r = await throwAtOche(a.userId, seq(600), new Date(Date.now() - 8 * 86_400_000)); // a 170, eight days ago
    expect(r.pct).toBe(15);
    expect(await bestClaim(db, a.userId)).toBeNull();
    await expect(claimPromo(b.userId, r.code)).rejects.toMatchObject({ code: "CODE" });
  });
});
