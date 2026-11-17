import { PARALLELS, PARALLEL_ORDER, type ParallelKind, parallelFor } from "@/domain/darts/cards";
import type { Tx } from "./db";

/**
 * Rare packs: roll each card for a parallel. A roll landing on a run that's sold out for that
 * player drops to the next, more common one; Silver /99 sold out means a plain card. The Pink Laser
 * is unnumbered. Returns the parallel given, or null.
 */
export async function rollDartsParallel(tx: Tx, rng: { int(n: number): number }, card: { cardId: string; playerId: string }) {
  const first = parallelFor(rng.int(10_000));
  // A copy that's already a parallel (e.g. handed back into the pool) keeps the one it has.
  const had = await tx.dartsParallel.findUnique({ where: { cardId: card.cardId } });
  if (had) return { kind: had.kind as ParallelKind, serial: had.serial, of: had.of };
  if (!first) return null;
  for (const kind of PARALLEL_ORDER.slice(PARALLEL_ORDER.indexOf(first))) {
    const got = await claimParallel(tx, kind, card);
    if (got) return got;
  }
  return null;
}

export async function claimParallel(tx: Tx, kind: ParallelKind, card: { cardId: string; playerId: string }) {
  const of = PARALLELS[kind].of;
  if (of === null) {
    await tx.dartsParallel.create({ data: { cardId: card.cardId, playerId: card.playerId, kind } });
    return { kind, serial: null, of: null };
  }
  const taken = await tx.dartsParallel.count({ where: { playerId: card.playerId, kind } });
  if (taken >= of) return null;
  const made = await tx.dartsParallel.createMany({ data: [{ cardId: card.cardId, playerId: card.playerId, kind, serial: taken + 1, of }], skipDuplicates: true });
  return made.count === 1 ? { kind, serial: taken + 1, of } : null;
}
