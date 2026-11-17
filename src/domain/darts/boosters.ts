import { DARTS_SCORING, type DartsStatLine } from "./scoring";
import type { Band } from "./teams";

/**
 * Darts boosters — every new manager starts with one of each. One booster per entry, on one darter;
 * it adds its own line to that darter's points so every point stays explainable.
 */
export const DARTS_BOOSTERS = {
  TREBLE_TOP: { name: "Treble Top", icon: "🎯", description: "That darter's 180s score ×3 (75 pts each)." },
  DOUBLE_TROUBLE: { name: "Double Trouble", icon: "✌️", description: "Checkout points ×2 — 170s, 100+ finishes and the highest checkout." },
  BULLSEYE: { name: "Bullseye", icon: "🔴", description: "+15 if they hit a 170 or the round's highest checkout." },
  LUCKY_ARROWS: { name: "Lucky Arrows", icon: "🍀", description: "Outsider only: +10 for every match they win." },
  HOT_HAND: { name: "Hot Hand", icon: "🔥", description: "Their 3-dart average counts ×1.25 (a 100 average scores 125)." },
  GIANT_KILLER: { name: "Giant Killer", icon: "🪓", description: "+25 if your Challenger or Outsider beats a Contender." },
} as const;
export type DartsBoosterKind = keyof typeof DARTS_BOOSTERS;
export const DARTS_BOOSTER_KINDS = Object.keys(DARTS_BOOSTERS) as DartsBoosterKind[];

/** Extra points a booster adds to one match line. */
export function boosterBonus(kind: DartsBoosterKind, s: DartsStatLine, ctx: { band: Band; opponentBand: Band }): number {
  const r = DARTS_SCORING;
  const n170 = s.checkouts.filter((c) => c === 170).length;
  const nTon = s.checkouts.filter((c) => c >= 100 && c < 170).length;
  switch (kind) {
    case "TREBLE_TOP":
      return s.oneEighties * r.oneEighty * 2;
    case "DOUBLE_TROUBLE":
      return n170 * r.oneSeventyCheckout + nTon * r.tonPlusCheckout + (s.highestCheckoutOfRound ? r.highestCheckoutBonus : 0);
    case "BULLSEYE":
      return n170 > 0 || s.highestCheckoutOfRound ? 15 : 0;
    case "LUCKY_ARROWS":
      return ctx.band === "OUTSIDER" && s.won ? 10 : 0;
    case "HOT_HAND":
      return Math.round(s.average * 0.25 * 100) / 100;
    case "GIANT_KILLER":
      return ctx.band !== "CONTENDER" && ctx.opponentBand === "CONTENDER" && s.won ? 25 : 0;
  }
}
