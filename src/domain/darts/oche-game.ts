/**
 * The pack-shop throw: three darts at the board, once a day, and every throw wins a pack discount.
 *  180 (T20 T20 T20) → 20% off · 170 (T20 T20 Bull) → 15% off · finish on double 20 → 10% off.
 * The server decides the result (so it can't be gamed); the page plays it out dart by dart.
 */
export type OcheOutcome = "180" | "170" | "D20";
export const OCHE_PRIZES: Record<OcheOutcome, { pct: number; label: string; chanceBp: number }> = {
  "180": { pct: 20, label: "ONE HUNDRED AND EIGHTY!", chanceBp: 500 },
  "170": { pct: 15, label: "The big fish — 170!", chanceBp: 1500 },
  D20: { pct: 10, label: "Double 20 — game shot!", chanceBp: 8000 },
};

export interface OcheDart {
  /** Board number (20, 1, 18…) or 25 for the bull. */
  number: number;
  ring: "S" | "D" | "T" | "OB" | "BULL";
  label: string;
  score: number;
}

const dart = (number: number, ring: OcheDart["ring"]): OcheDart => {
  if (ring === "BULL") return { number: 25, ring, label: "Bull", score: 50 };
  if (ring === "OB") return { number: 25, ring, label: "25", score: 25 };
  const mult = ring === "T" ? 3 : ring === "D" ? 2 : 1;
  return { number, ring, label: `${ring === "S" ? "" : ring}${number}`, score: number * mult };
};

/** The outcome from a roll in [0, 10000). */
export function outcomeFor(roll: number): OcheOutcome {
  if (roll < OCHE_PRIZES["180"].chanceBp) return "180";
  if (roll < OCHE_PRIZES["180"].chanceBp + OCHE_PRIZES["170"].chanceBp) return "170";
  return "D20";
}

/** Where the three darts land for an outcome. `r` picks the warm-up darts on a Double 20 finish. */
export function planDarts(outcome: OcheOutcome, r: (n: number) => number): OcheDart[] {
  if (outcome === "180") return [dart(20, "T"), dart(20, "T"), dart(20, "T")];
  if (outcome === "170") return [dart(20, "T"), dart(20, "T"), dart(25, "BULL")];
  // Two scoring darts around the top of the board, then the double 20.
  const warm: OcheDart[] = [dart(20, "S"), dart(1, "S"), dart(5, "S"), dart(20, "T"), dart(1, "T"), dart(5, "T"), dart(18, "S"), dart(12, "S")];
  const a = warm[r(warm.length)];
  let b = warm[r(warm.length)];
  if (a.label === "T20" && b.label === "T20") b = dart(1, "S"); // never looks like a 180 or 170 attempt gone right
  return [a, b, dart(20, "D")];
}
