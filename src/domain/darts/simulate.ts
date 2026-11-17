import type { DartsStatLine } from "./scoring";

/**
 * Simulated darts (until the live feed is connected): realistic matches from each darter's world
 * ranking. A better-ranked darter averages more and wins more legs; 180s, 140+ visits, checkouts,
 * checkout % and the odd 9-darter come at believable rates for their level. Deterministic for a
 * given seed, so a replay always plays out the same.
 */

export function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353), (h = (h << 13) | (h >>> 19));
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

type Rand = () => number;
const normal = (r: Rand) => Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r());
const poisson = (r: Rand, lambda: number) => {
  const L = Math.exp(-Math.max(0, lambda));
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= r();
  } while (p > L);
  return k - 1;
};

/** A darter's typical 3-dart average from their ranking (No. 1 ≈ 101, No. 50 ≈ 95.6, No. 128 ≈ 87). */
export function expectedAverage(ranking: number | null | undefined) {
  if (!ranking) return 85;
  return Math.max(84, 101.2 - 0.11 * (ranking - 1));
}

function checkout(r: Rand) {
  const x = r();
  if (x < 0.006) return 170;
  if (x < 0.1) return 100 + Math.floor(r() * 70); // 100–169
  if (x < 0.35) return 61 + Math.floor(r() * 39); // 61–99
  return 2 + 2 * Math.floor(r() * 30); // 2–60, mostly doubles
}

export interface SimMatchResult {
  legsA: number;
  legsB: number;
  a: DartsStatLine;
  b: DartsStatLine;
}

export function simulateMatch(rankA: number | null, rankB: number | null, legsToWin: number, seed: string): SimMatchResult {
  const r = rng(seed);
  // Today's form: each darter's average for this match.
  const avgA = Math.round((expectedAverage(rankA) + normal(r) * 3.6) * 100) / 100;
  const avgB = Math.round((expectedAverage(rankB) + normal(r) * 3.6) * 100) / 100;
  const pA = 1 / (1 + Math.exp(-(avgA - avgB) / 5.5));
  let legsA = 0;
  let legsB = 0;
  const co = { a: [] as number[], b: [] as number[] };
  let nineA = 0;
  let nineB = 0;
  let throwA = r() < 0.5;
  while (legsA < legsToWin && legsB < legsToWin) {
    // Throwing first is worth a little.
    const p = Math.min(0.95, Math.max(0.05, pA + (throwA ? 0.06 : -0.06)));
    const aWins = r() < p;
    if (aWins) {
      legsA++;
      co.a.push(checkout(r));
      if (avgA > 95 && r() < 0.0025) nineA++;
    } else {
      legsB++;
      co.b.push(checkout(r));
      if (avgB > 95 && r() < 0.0025) nineB++;
    }
    throwA = !throwA;
  }
  const legs = legsA + legsB;
  const line = (avg: number, won: number, lost: number, checkouts: number[], nine: number): DartsStatLine => {
    const attempts = Math.max(won, Math.round(won / Math.min(0.6, Math.max(0.22, 0.36 + (avg - 95) * 0.008 + normal(r) * 0.05))));
    return {
      average: avg,
      legsWon: won,
      legsLost: lost,
      oneEighties: poisson(r, legs * Math.max(0.03, 0.012 * (avg - 75))),
      oneFortyPlus: poisson(r, legs * Math.max(0.1, 0.03 * (avg - 70))),
      checkouts,
      checkoutPct: attempts ? Math.round((won / attempts) * 1000) / 10 : 0,
      nineDarters: nine,
      won: won === legsToWin,
    };
  };
  return { legsA, legsB, a: line(avgA, legsA, legsB, co.a, nineA), b: line(avgB, legsB, legsA, co.b, nineB) };
}

/** Knockout pairings for a seeded draw: 1 v 32, 16 v 17 … (field sorted by seed). */
export function seededPairs<T>(field: T[]): Array<[T, T]> {
  const n = field.length;
  const out: Array<[T, T]> = [];
  for (let i = 0; i < n / 2; i++) out.push([field[i], field[n - 1 - i]]);
  return out;
}

/** Standard knockout rounds for a field (32 → Round 1, Last 16, QF, SF, Final) with legs to win. */
export function knockoutRounds(fieldSize: 16 | 32 | 64 | 128) {
  const names: Record<number, string> = { 128: "Round 1", 64: "Round 2", 32: "Round of 32", 16: "Last 16", 8: "Quarter-finals", 4: "Semi-finals", 2: "Final" };
  const rounds: Array<{ name: string; legsToWin: number; stage: "QF" | "SF" | "F" | "WINNER" | null; players: number }> = [];
  for (let players: number = fieldSize; players >= 2; players /= 2) {
    const stage = players === 16 ? "QF" : players === 8 ? "SF" : players === 4 ? "F" : players === 2 ? "WINNER" : null;
    const legsToWin = players === 2 ? 8 : players <= 8 ? 7 : 6;
    rounds.push({ name: players === fieldSize && fieldSize > 32 ? `Round 1` : names[players] ?? `Round of ${players}`, legsToWin, stage, players });
  }
  return rounds;
}
