/**
 * The DartsX card set (agreed 18 Nov 2026).
 *  - Base cards for every ranked player, each in the player's own shirt colours, plus Icons: retired
 *    greats who don't play in games but complete the set.
 *  - Parallels: foil versions that only come from Rare packs. Six numbered runs, from Silver /99 down
 *    to a single Black 1/1, plus the unnumbered Pink Laser. No autograph cards.
 *  - Values start at no more than £10, with only a handful near the top; the market moves them after.
 */

export type ParallelKind = "SILVER" | "BLUE" | "RED" | "GREEN" | "GOLD" | "BLACK" | "PINK";
export const PARALLELS: Record<ParallelKind, { label: string; of: number | null; chanceBp: number; valueX: number; colour: string }> = {
  BLACK: { label: "Black", of: 1, chanceBp: 20, valueX: 10, colour: "#000000" },
  GOLD: { label: "Gold", of: 5, chanceBp: 100, valueX: 6, colour: "#f2cf63" },
  GREEN: { label: "Green", of: 10, chanceBp: 250, valueX: 4, colour: "#2bd47a" },
  RED: { label: "Red", of: 25, chanceBp: 600, valueX: 3, colour: "#ff3b52" },
  BLUE: { label: "Blue", of: 49, chanceBp: 1200, valueX: 2, colour: "#3f8cff" },
  PINK: { label: "Pink Laser", of: null, chanceBp: 800, valueX: 2.5, colour: "#ff6fc0" },
  SILVER: { label: "Silver Laser", of: 99, chanceBp: 2000, valueX: 1.5, colour: "#dfe6ec" },
};
/** Rarest first: a roll that lands on a sold-out run drops to the next one down. */
export const PARALLEL_ORDER: ParallelKind[] = ["BLACK", "GOLD", "GREEN", "RED", "BLUE", "PINK", "SILVER"];

/** Which parallel a roll in [0, 10000) gives (null = a plain card). ~50% of Rare-pack cards are parallels. */
export function parallelFor(roll: number): ParallelKind | null {
  let acc = 0;
  for (const k of PARALLEL_ORDER) {
    acc += PARALLELS[k].chanceBp;
    if (roll < acc) return k;
  }
  return null;
}

/** Card values start at no more than £10. */
export const DARTS_VALUE_CAP_GBP = 10;
/**
 * The starting value of a base card from the world ranking: No. 1 £10, falling away quickly so only
 * a handful sit near the top (No. 10 ~£6, No. 20 ~£3.50, No. 50 ~65p), with a 30p floor. Icons £5.
 * A fair starter stable (two each of 21–25, 26–50, 51+) comes to about £10.
 */
export function startingValueGbp(ranking: number | null | undefined, icon = false): number {
  if (icon) return 5;
  if (!ranking) return 0.3;
  return Math.round(Math.max(0.3, Math.min(DARTS_VALUE_CAP_GBP, DARTS_VALUE_CAP_GBP * Math.exp(-(ranking - 1) / 18))) * 100) / 100;
}
/** A parallel's value: the base value × its multiplier, within the cap. */
export const parallelValueGbp = (base: number, kind: ParallelKind | null) =>
  Math.round(Math.min(DARTS_VALUE_CAP_GBP, base * (kind ? PARALLELS[kind].valueX : 1)) * 100) / 100;

/**
 * Market-led value: once a card has traded, its value follows what people actually pay — the median
 * of the recent sales, blended with the previous value so one odd sale can't swing it. Within the cap.
 */
export function marketValueGbp(previous: number, recentSalesGbp: number[]): number {
  if (!recentSalesGbp.length) return previous;
  const s = [...recentSalesGbp].sort((a, b) => a - b);
  const mid = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  const weight = Math.min(0.8, 0.3 + 0.1 * s.length); // more sales, more trust in the market
  return Math.round(Math.max(0.1, Math.min(DARTS_VALUE_CAP_GBP, previous * (1 - weight) + mid * weight)) * 100) / 100;
}

/** A player's card colours: main, trim, shade, and an optional shirt pattern. */
export interface DarterColours {
  c1: string;
  c2: string;
  c3?: string;
  pattern?: "fractured" | "chequer" | null;
}
/** Until a player's real colours are set: their country's colours. */
const COUNTRY: Record<string, DarterColours> = {
  England: { c1: "#1d2a5c", c2: "#e8152d", c3: "#0d1430" },
  Scotland: { c1: "#0b3d91", c2: "#ffffff", c3: "#06204d" },
  Wales: { c1: "#c8102e", c2: "#00a650", c3: "#5c0715" },
  "Northern Ireland": { c1: "#0b6b3a", c2: "#ffffff", c3: "#053a1f" },
  "Republic of Ireland": { c1: "#169b62", c2: "#ff883e", c3: "#0a4d31" },
  Ireland: { c1: "#169b62", c2: "#ff883e", c3: "#0a4d31" },
  Netherlands: { c1: "#ff6a00", c2: "#111111", c3: "#7a3300" },
  Belgium: { c1: "#1a1a1a", c2: "#fdda24", c3: "#000000" },
  Germany: { c1: "#1a1a1a", c2: "#dd0000", c3: "#000000" },
  Austria: { c1: "#ed2939", c2: "#ffffff", c3: "#6b0f18" },
  Poland: { c1: "#dc143c", c2: "#ffffff", c3: "#5e0718" },
  Australia: { c1: "#00205b", c2: "#ffcd00", c3: "#00102e" },
  "New Zealand": { c1: "#111111", c2: "#ffffff", c3: "#000000" },
  Canada: { c1: "#d52b1e", c2: "#ffffff", c3: "#5e120c" },
  Portugal: { c1: "#006600", c2: "#ff0000", c3: "#003300" },
  Latvia: { c1: "#9e3039", c2: "#ffffff", c3: "#4a161a" },
  "Czech Republic": { c1: "#11457e", c2: "#d7141a", c3: "#08223f" },
};
export const DEFAULT_COLOURS: DarterColours = { c1: "#1d1d22", c2: "#e8152d", c3: "#0a0a0c" };
export function coloursFor(stored: unknown, country: string | null | undefined): DarterColours & { set: boolean } {
  const s = stored as Partial<DarterColours> | null;
  if (s?.c1 && s?.c2) return { c1: s.c1, c2: s.c2, c3: s.c3 ?? s.c1, pattern: s.pattern ?? null, set: true };
  return { ...(COUNTRY[country ?? ""] ?? DEFAULT_COLOURS), set: false };
}
export const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v);
