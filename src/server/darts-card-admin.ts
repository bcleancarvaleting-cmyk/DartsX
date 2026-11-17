import { isHex } from "@/domain/darts/cards";
import { audit } from "./audit";
import { db } from "./db";
import { DomainError } from "./errors";

/** Admin → Darts cards: set a player's shirt colours (and pattern) and nickname for their base card. */
export async function setDarterLook(adminId: string, playerId: string, input: { c1: string; c2: string; c3: string; pattern: string; nickname: string; reset?: boolean }) {
  const before = await db.player.findUniqueOrThrow({ where: { id: playerId }, select: { colours: true, nickname: true, sport: { select: { code: true } } } });
  if (before.sport.code !== "darts") throw new DomainError("NOT_DARTS", "That isn't a darts player.");
  if (input.reset) {
    await db.$executeRaw`UPDATE "Player" SET colours = NULL WHERE id = ${playerId}::uuid`;
  } else {
    for (const c of [input.c1, input.c2, input.c3]) if (!isHex(c)) throw new DomainError("COLOUR", "Pick each colour with the colour picker.");
    const pattern = ["fractured", "chequer"].includes(input.pattern) ? input.pattern : null;
    const nickname = input.nickname.trim().slice(0, 40) || null;
    await db.player.update({ where: { id: playerId }, data: { colours: { c1: input.c1, c2: input.c2, c3: input.c3, pattern }, nickname } });
  }
  const after = await db.player.findUniqueOrThrow({ where: { id: playerId }, select: { colours: true, nickname: true } });
  await audit(db, { actorId: adminId, action: "darts.card.look", entityType: "Player", entityId: playerId, before: { colours: before.colours, nickname: before.nickname } as never, after: after as never });
}
