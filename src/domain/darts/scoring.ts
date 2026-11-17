/**
 * DartsX scoring (agreed with the product owner, 17 Nov 2026). Points per darter, per match.
 * Every point is explainable: scoreDarter returns the lines that make up the total.
 */

export const DARTS_SCORING = {
  /** The match 3-dart average scores its own value: 99.68 → 99.68 points. */
  averageIsPoints: true,
  oneEighty: 25,
  /** A 170 checkout (the "Big Fish"). */
  oneSeventyCheckout: 20,
  /** Each visit of 140–179 (180s score separately). */
  oneFortyPlus: 10,
  /** The highest checkout of the round (ties all get it). */
  highestCheckoutBonus: 10,
  legWon: 5,
  /** Each checkout of 100–169. */
  tonPlusCheckout: 8,
  matchWon: 15,
  /** Won without dropping a leg. */
  whitewash: 10,
  nineDarter: 100,
  /** Checkout percentage of 40% or better in the match. */
  checkoutPctBonus: 5,
  checkoutPctThreshold: 40,
  /** Winning the match that takes the darter into this stage (or wins the event). */
  progress: { QF: 10, SF: 20, F: 30, WINNER: 50 } as const,
  captainMultiplier: 2,
} as const;

export type Stage = keyof typeof DARTS_SCORING.progress;

/** One darter's line from one match. */
export interface DartsStatLine {
  average: number; // 3-dart average, e.g. 99.68
  legsWon: number;
  legsLost: number;
  oneEighties: number;
  /** Visits of 140–179. */
  oneFortyPlus: number;
  /** Every checkout value hit (e.g. [40, 121, 170]). */
  checkouts: number[];
  /** Checkout % for the match (0–100), if known. */
  checkoutPct?: number | null;
  nineDarters: number;
  won: boolean;
  /** The stage this win takes them into (QF, SF, F) or WINNER for winning the final. */
  reached?: Stage | null;
  /** Hit the highest checkout of the round (worked out across the round's matches). */
  highestCheckoutOfRound?: boolean;
}

export interface DartsScoreItem {
  event: string;
  count: number;
  points: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function scoreDarter(s: DartsStatLine, rules = DARTS_SCORING): { points: number; items: DartsScoreItem[] } {
  const items: DartsScoreItem[] = [];
  const add = (event: string, count: number, each: number) => {
    if (count > 0 && each !== 0) items.push({ event, count, points: round2(count * each) });
  };
  if (rules.averageIsPoints && s.average > 0) items.push({ event: `3-dart average ${s.average.toFixed(2)}`, count: 1, points: round2(s.average) });
  add("180", s.oneEighties, rules.oneEighty);
  add("140+ visit", s.oneFortyPlus, rules.oneFortyPlus);
  add("170 checkout", s.checkouts.filter((c) => c === 170).length, rules.oneSeventyCheckout);
  add("100+ checkout", s.checkouts.filter((c) => c >= 100 && c < 170).length, rules.tonPlusCheckout);
  add("Leg won", s.legsWon, rules.legWon);
  if (s.won) add("Match won", 1, rules.matchWon);
  if (s.won && s.legsLost === 0 && s.legsWon > 0) add("Whitewash", 1, rules.whitewash);
  add("9-dart finish", s.nineDarters, rules.nineDarter);
  if ((s.checkoutPct ?? 0) >= rules.checkoutPctThreshold) add(`Checkout ${rules.checkoutPctThreshold}%+`, 1, rules.checkoutPctBonus);
  if (s.highestCheckoutOfRound) add("Highest checkout of the round", 1, rules.highestCheckoutBonus);
  if (s.won && s.reached) add(s.reached === "WINNER" ? "Won the event" : `Reached the ${s.reached === "QF" ? "quarter-finals" : s.reached === "SF" ? "semi-finals" : "final"}`, 1, rules.progress[s.reached]);
  return { points: round2(items.reduce((t, i) => t + i.points, 0)), items };
}

/** Who hit the highest checkout of a round: every darter tied on the top checkout. */
export function highestCheckoutHolders(lines: Array<{ darterId: string; checkouts: number[] }>): Set<string> {
  const top = Math.max(0, ...lines.flatMap((l) => l.checkouts));
  return new Set(top > 0 ? lines.filter((l) => l.checkouts.includes(top)).map((l) => l.darterId) : []);
}

/** A team's round total: three darters, the captain doubled. */
export function scoreTeam(picks: Array<{ darterId: string; captain: boolean; lines: DartsStatLine[] }>, rules = DARTS_SCORING) {
  let total = 0;
  const rows = picks.map((p) => {
    const pts = round2(p.lines.reduce((t, l) => t + scoreDarter(l, rules).points, 0));
    const counted = p.captain ? round2(pts * rules.captainMultiplier) : pts;
    total += counted;
    return { darterId: p.darterId, points: pts, counted, captain: p.captain };
  });
  return { total: round2(total), rows };
}
