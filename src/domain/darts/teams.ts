/**
 * DartsX teams and stables (agreed 17 Nov 2026):
 *  - a stable is 6 darters;
 *  - a team for a competition is 3 darters: one Contender (rankings 1–25), one Challenger (26–50)
 *    and one Outsider (51+);
 *  - packs never contain the top 10 — those come from the Oche Shop, auctions and drops.
 */

export const STABLE_SIZE = 6;
export const TEAM_SIZE = 3;
export const PACK_EXCLUDES_TOP = 10;

export type Band = "CONTENDER" | "CHALLENGER" | "OUTSIDER";
export const BANDS: Record<Band, { label: string; from: number; to: number | null }> = {
  CONTENDER: { label: "Contender", from: 1, to: 25 },
  CHALLENGER: { label: "Challenger", from: 26, to: 50 },
  OUTSIDER: { label: "Outsider", from: 51, to: null },
};

/** A darter's band from their world ranking (unranked = Outsider). */
export function bandFor(ranking: number | null | undefined): Band {
  if (!ranking || ranking > 50) return "OUTSIDER";
  return ranking <= 25 ? "CONTENDER" : "CHALLENGER";
}

/** Can this darter come out of a pack? (Never the top 10.) */
export function packable(ranking: number | null | undefined) {
  return !ranking || ranking > PACK_EXCLUDES_TOP;
}

export interface TeamPick {
  darterId: string;
  ranking: number | null;
  captain?: boolean;
}

/** What's wrong with a team, if anything (empty = valid). If a band has nobody left in the draw, any darter fills its place. */
export function teamIssues(picks: TeamPick[], bandsInDraw: Band[] = ["CONTENDER", "CHALLENGER", "OUTSIDER"]): string[] {
  const issues: string[] = [];
  if (picks.length !== TEAM_SIZE) issues.push(`Pick ${TEAM_SIZE} darters`);
  if (new Set(picks.map((p) => p.darterId)).size !== picks.length) issues.push("Each darter can only be picked once");
  for (const band of Object.keys(BANDS) as Band[]) {
    const n = picks.filter((p) => bandFor(p.ranking) === band).length;
    if (n === 0 && bandsInDraw.includes(band)) issues.push(`Pick a ${BANDS[band].label} (${BANDS[band].to ? `ranked ${BANDS[band].from}–${BANDS[band].to}` : `ranked ${BANDS[band].from}+`})`);
    if (n > 1 && bandsInDraw.length === 3) issues.push(`Only one ${BANDS[band].label}`);
  }
  if (picks.filter((p) => p.captain).length !== 1 && picks.length === TEAM_SIZE) issues.push("Choose one captain");
  return [...new Set(issues)];
}


/** Whole-event games (e.g. the World Championship): a stable of 4 — one from each band plus one wildcard. */
export const EVENT_TEAM_SIZE = 4;
export function eventTeamIssues(picks: TeamPick[]): string[] {
  const issues: string[] = [];
  if (picks.length !== EVENT_TEAM_SIZE) issues.push(`Pick ${EVENT_TEAM_SIZE} darters`);
  if (new Set(picks.map((p) => p.darterId)).size !== picks.length) issues.push("Each darter can only be picked once");
  for (const band of Object.keys(BANDS) as Band[]) {
    if (!picks.some((p) => bandFor(p.ranking) === band)) issues.push(`Include at least one ${BANDS[band].label}`);
  }
  if (picks.filter((p) => bandFor(p.ranking) === "CONTENDER").length > 2) issues.push("No more than two Contenders");
  if (picks.filter((p) => p.captain).length !== 1 && picks.length === EVENT_TEAM_SIZE) issues.push("Choose one captain");
  return [...new Set(issues)];
}

/**
 * A darts card's value in £ — capped at £5 (product rule, 17 Nov 2026). World No. 1 is £5.00,
 * falling 3.5p a ranking place to a 50p floor; unranked darters 50p.
 */
export const DARTS_MAX_VALUE_GBP = 5;
export function dartsValueGbp(ranking: number | null | undefined): number {
  if (!ranking) return 0.5;
  return Math.round(Math.max(0.5, Math.min(DARTS_MAX_VALUE_GBP, DARTS_MAX_VALUE_GBP - (ranking - 1) * 0.035)) * 100) / 100;
}
