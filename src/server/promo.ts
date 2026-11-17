import { db, type Tx } from "./db";
import { DomainError } from "./errors";

/**
 * Promo codes. DARTSX: 50% off three packs, for every manager. Claim it (type it or tap
 * "Use code") and your next three packs — paid by card or with your balance — are half price. The
 * offer keeps showing until all three are used; then it's gone for good.
 */
export const PROMOS = {
  DARTSX: { pct: 50, uses: 3, headline: "50% off 3 packs", detail: "Half price on three packs — paid by card or with your balance. Once per manager." },
} as const;
export type PromoCode = keyof typeof PROMOS;
export const WELCOME_PROMO: PromoCode = "DARTSX";

const normalise = (code: string) => code.trim().toUpperCase() as PromoCode;

/** Oche-throw codes: OCHE20-XXXXXX (20% off one pack), OCHE15-…, OCHE10-… — personal, 7 days. */
export const OCHE_CODE = /^OCHE(20|15|10)-[A-Z0-9]{6}$/;
export const OCHE_CODE_DAYS = 7;
export interface PromoDef {
  pct: number;
  uses: number;
  headline: string;
  detail: string;
  expiresDays?: number;
}
export function promoDef(code: string): PromoDef | null {
  if (code in PROMOS) return PROMOS[code as PromoCode];
  const m = OCHE_CODE.exec(code);
  if (m) return { pct: Number(m[1]), uses: 1, headline: `${m[1]}% off a pack`, detail: "Won on the oche — off your next pack, within 7 days.", expiresDays: OCHE_CODE_DAYS };
  return null;
}
const expired = (def: PromoDef, claimedAt: Date, now = Date.now()) => !!def.expiresDays && now > claimedAt.getTime() + def.expiresDays * 86_400_000;

/** The best unused, unexpired code a manager holds (the biggest discount comes off first). */
export async function bestClaim(tx: Tx | typeof db, userId: string) {
  const claims = await tx.promoClaim.findMany({ where: { userId, usedAt: null } });
  return (
    claims
      .map((c) => ({ c, def: promoDef(c.code) }))
      .filter((x): x is { c: (typeof claims)[number]; def: PromoDef } => !!x.def && !expired(x.def, x.c.claimedAt) && x.c.uses < x.def.uses)
      .sort((a, b) => b.def.pct - a.def.pct)[0] ?? null
  );
}

export async function promoState(userId: string, code: PromoCode = WELCOME_PROMO) {
  const c = await db.promoClaim.findUnique({ where: { userId_code: { userId, code } } });
  const left = PROMOS[code].uses - (c?.uses ?? 0);
  return { code, ...PROMOS[code], left, status: !c ? ("none" as const) : c.usedAt || left <= 0 ? ("used" as const) : ("claimed" as const) };
}

/** Claim a code: it then comes off the next pack. */
export async function claimPromo(userId: string, raw: string) {
  const code = normalise(raw);
  if (OCHE_CODE.test(code)) {
    // Oche codes are already yours the moment you win them.
    const mine = await db.promoClaim.findUnique({ where: { userId_code: { userId, code } } });
    if (!mine) throw new DomainError("CODE", "That oche code belongs to another manager.");
    if (mine.usedAt) throw new DomainError("USED", `You've already used ${code}.`);
    return { code, ...promoDef(code)! };
  }
  if (!(code in PROMOS)) throw new DomainError("CODE", "That code isn't valid.");
  const existing = await db.promoClaim.findUnique({ where: { userId_code: { userId, code } } });
  if (existing?.usedAt) throw new DomainError("USED", `You've already used ${code}.`);
  if (!existing) await db.promoClaim.create({ data: { userId, code } }).catch(() => null);
  return { code, ...PROMOS[code] };
}

/** The price after an unused claimed code, and a way to mark it used in the same transaction. */
export async function applyPromo(tx: Tx, userId: string, priceMinor: number, ref: string) {
  const best = await bestClaim(tx, userId);
  if (!best) return { priceMinor, code: null as string | null };
  const { c: claim, def } = best;
  const { pct, uses } = def;
  const n = claim.uses + 1;
  const used = await tx.promoClaim.updateMany({ where: { id: claim.id, usedAt: null, uses: claim.uses }, data: { uses: n, usedRefs: { push: ref }, usedRef: ref, usedAt: n >= uses ? new Date() : null } });
  if (!used.count) return { priceMinor, code: null };
  return { priceMinor: Math.max(1, Math.round((priceMinor * (100 - pct)) / 100)), code: claim.code };
}

/** A card payment that failed or was refunded gives that use back. */
export async function releasePromo(tx: Tx, ref: string) {
  const claims = await tx.promoClaim.findMany({ where: { OR: [{ usedRefs: { has: ref } }, { usedRef: ref }] } });
  for (const c of claims) {
    await tx.promoClaim.update({
      where: { id: c.id },
      data: { uses: Math.max(0, c.uses - 1), usedRefs: c.usedRefs.filter((r) => r !== ref), usedRef: c.usedRef === ref ? null : c.usedRef, usedAt: null },
    });
  }
}

/** The price a manager would pay for a pack right now (for showing on the shop). */
export async function promoPrice(userId: string, priceMinor: number) {
  return (await promoQuote(userId, priceMinor))?.priceMinor ?? null;
}

/** The discounted price and the code it comes from (for card payments, used once the order exists). */
export async function promoQuote(userId: string, priceMinor: number) {
  const best = await bestClaim(db, userId);
  if (!best) return null;
  return { priceMinor: Math.max(1, Math.round((priceMinor * (100 - best.def.pct)) / 100)), claimId: best.c.id, code: best.c.code, pct: best.def.pct, uses: best.def.uses };
}

/** Count one use of a code against an order (card payments); releasePromo gives it back if the payment fails. */
export async function usePromo(claimId: string, uses: number, ref: string) {
  const c = await db.promoClaim.findUniqueOrThrow({ where: { id: claimId } });
  const n = c.uses + 1;
  await db.promoClaim.update({ where: { id: claimId }, data: { uses: n, usedRefs: { push: ref }, usedRef: ref, usedAt: n >= uses ? new Date() : null } });
}
