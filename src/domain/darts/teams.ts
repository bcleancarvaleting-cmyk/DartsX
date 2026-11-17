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

/** What's wrong with a team, if anything (empty = valid). */
export function teamIssues(picks: TeamPick[]): string[] {
  const issues: string[] = [];
  if (picks.length !== TEAM_SIZE) issues.push(`Pick ${TEAM_SIZE} darters`);
  if (new Set(picks.map((p) => p.darterId)).size !== picks.length) issues.push("Each darter can only be picked once");
  for (const band of Object.keys(BANDS) as Band[]) {
    const n = picks.filter((p) => bandFor(p.ranking) === band).length;
    if (n === 0) issues.push(`Pick a ${BANDS[band].label} (${BANDS[band].to ? `ranked ${BANDS[band].from}–${BANDS[band].to}` : `ranked ${BANDS[band].from}+`})`);
    if (n > 1) issues.push(`Only one ${BANDS[band].label}`);
  }
  if (picks.filter((p) => p.captain).length !== 1 && picks.length === TEAM_SIZE) issues.push("Choose one captain");
  return [...new Set(issues)];
}
