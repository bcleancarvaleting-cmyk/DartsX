import { describe, expect, it } from "vitest";
import { highestCheckoutHolders, scoreDarter, scoreTeam, type DartsStatLine } from "@/domain/darts/scoring";
import { bandFor, packable, teamIssues } from "@/domain/darts/teams";

const line = (s: Partial<DartsStatLine>): DartsStatLine => ({ average: 0, legsWon: 0, legsLost: 0, oneEighties: 0, oneFortyPlus: 0, checkouts: [], nineDarters: 0, won: false, ...s });

describe("DartsX scoring", () => {
  it("the 3-dart average scores its own value; 180s, 140+, 170s, legs as agreed", () => {
    const r = scoreDarter(line({ average: 99.68, oneEighties: 3, oneFortyPlus: 4, checkouts: [170, 121, 40], legsWon: 6, legsLost: 3, won: true, checkoutPct: 42 }));
    // 99.68 + 75 + 40 + 20 + 8 + 30 + 15 + 5
    expect(r.points).toBe(292.68);
    expect(r.items.find((i) => i.event.startsWith("3-dart average"))?.points).toBe(99.68);
  });
  it("whitewash, 9-darter, highest checkout of the round and progress bonuses", () => {
    expect(scoreDarter(line({ average: 101, legsWon: 6, won: true, nineDarters: 1, highestCheckoutOfRound: true, reached: "WINNER" })).points).toBe(101 + 30 + 15 + 10 + 100 + 10 + 50);
    expect(scoreDarter(line({ average: 88.5, legsWon: 2, legsLost: 6, won: false, reached: "SF" })).points).toBe(88.5 + 10);
  });
  it("highest checkout of the round goes to everyone tied on it", () => {
    expect([...highestCheckoutHolders([{ darterId: "a", checkouts: [120, 160] }, { darterId: "b", checkouts: [160] }, { darterId: "c", checkouts: [100] }])].sort()).toEqual(["a", "b"]);
  });
  it("captain doubles", () => {
    const t = scoreTeam([
      { darterId: "a", captain: true, lines: [line({ average: 100 })] },
      { darterId: "b", captain: false, lines: [line({ average: 90 })] },
    ]);
    expect(t.total).toBe(290);
  });
});

describe("DartsX teams and packs", () => {
  it("bands: 1–25 Contender, 26–50 Challenger, 51+ Outsider", () => {
    expect([bandFor(1), bandFor(25), bandFor(26), bandFor(50), bandFor(51), bandFor(null)]).toEqual(["CONTENDER", "CONTENDER", "CHALLENGER", "CHALLENGER", "OUTSIDER", "OUTSIDER"]);
  });
  it("packs never hold the top 10", () => {
    expect([packable(1), packable(10), packable(11), packable(null)]).toEqual([false, false, true, true]);
  });
  it("a team is one from each band, with one captain", () => {
    expect(teamIssues([{ darterId: "a", ranking: 3, captain: true }, { darterId: "b", ranking: 30 }, { darterId: "c", ranking: 77 }])).toEqual([]);
    expect(teamIssues([{ darterId: "a", ranking: 3, captain: true }, { darterId: "b", ranking: 4 }, { darterId: "c", ranking: 77 }])).toContain("Only one Contender");
  });
});
