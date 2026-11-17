import { beforeEach, describe, expect, it } from "vitest";
import { scoreDarter, type DartsStatLine } from "@/domain/darts/scoring";
import { db } from "@/server/db";
import { createSimEvent, playSimRound, seedDarters } from "@/server/darts-events";
import { resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
});

describe("DartsX events", () => {
  it("loads the Order of Merit with cards by band, then plays a 32-darter event to a champion", async () => {
    const s = await seedDarters();
    expect(s.added).toBe(128);
    expect((await seedDarters()).added).toBe(0); // safe to run again
    const no1 = await db.player.findFirstOrThrow({ where: { ranking: 1 }, include: { templates: true } });
    expect(no1.templates[0].category).toBe("GOLD");
    const out = await db.player.findFirstOrThrow({ where: { ranking: { gt: 50 } }, include: { templates: true } });
    expect(out.templates[0].category).toBe("BRONZE");

    const ev = await createSimEvent({ name: "DartsX Open", startsAt: new Date() });
    const rounds = await db.dartsRound.findMany({ where: { eventId: ev.id }, orderBy: { number: "asc" } });
    expect(rounds.map((r) => r.name)).toEqual(["Round of 32", "Last 16", "Quarter-finals", "Semi-finals", "Final"]);
    for (const r of rounds) await playSimRound(r.id);
    const final = await db.dartsMatch.findFirstOrThrow({ where: { round: { eventId: ev.id, number: 5 } } });
    expect(final.winnerId).toBeTruthy();
    expect((await db.dartsEvent.findUniqueOrThrow({ where: { id: ev.id } })).status).toBe("FINISHED");
    // The champion's final line scores the event-win bonus.
    const line = (final.winnerId === final.aId ? final.statsA : final.statsB) as unknown as DartsStatLine;
    expect(line.reached).toBe("WINNER");
    expect(scoreDarter(line).items.map((i) => i.event)).toContain("Won the event");
    // Exactly the round's top checkout(s) got the bonus.
    const r1 = await db.dartsMatch.findMany({ where: { roundId: rounds[0].id } });
    const lines = r1.flatMap((m) => [m.statsA, m.statsB]) as unknown as DartsStatLine[];
    const top = Math.max(...lines.flatMap((l) => l.checkouts));
    expect(lines.filter((l) => l.highestCheckoutOfRound).every((l) => l.checkouts.includes(top))).toBe(true);
  });
});
