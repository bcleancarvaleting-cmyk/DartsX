"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { enterDartsGame, withdrawDartsEntry } from "@/server/darts-games";
import { type ActionResult, attempt } from "./result";

/** Save a darts team: picks as JSON [{cardId, captain}], optional booster on one card. */
export async function enterDartsAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const gameId = String(form.get("gameId") ?? "");
  const cards = form.getAll("card").map(String).filter(Boolean);
  const captain = String(form.get("captain") ?? "");
  const boosterId = String(form.get("boosterId") ?? "");
  const boostOn = String(form.get("boostOn") ?? "");
  const entryNo = Number(form.get("entryNo") ?? 1) || 1;
  const res = await attempt(
    async () => {
      await enterDartsGame(user.id, gameId, {
        entryNo,
        picks: cards.map((cardId) => ({ cardId, captain: cardId === captain })),
        booster: boosterId && boostOn ? { id: boosterId, cardId: boostOn } : null,
      });
    },
    "Team saved — good luck on the oche!",
  );
  revalidatePath(`/darts/games/${gameId}`);
  revalidatePath("/darts");
  return res;
}

export async function withdrawDartsAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const gameId = String(form.get("gameId") ?? "");
  const res = await attempt(() => withdrawDartsEntry(user.id, String(form.get("entryId") ?? "")), "Entry withdrawn — your £ is back.");
  revalidatePath(`/darts/games/${gameId}`);
  revalidatePath("/darts");
  return res;
}

/** The pack-shop throw: three darts, once a day, always a discount. */
export async function throwOcheAction(): Promise<ActionResult<import("@/server/oche-throw").OcheResult>> {
  const user = await requireUser();
  const res = await attempt(async () => (await import("@/server/oche-throw")).throwAtOche(user.id));
  revalidatePath("/packs");
  return res;
}
