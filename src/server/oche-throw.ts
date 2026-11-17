import { randomInt } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { OCHE_PRIZES, type OcheDart, type OcheOutcome, outcomeFor, planDarts } from "@/domain/darts/oche-game";
import { db } from "./db";
import { DomainError, isUniqueViolation } from "./errors";
import { OCHE_CODE_DAYS } from "./promo";

/**
 * The pack-shop throw: three darts once a UK day. Every throw wins: a 180 is 20% off a pack, a 170
 * 15%, a Double 20 finish 10%. The result is decided here with a secure random number; the page
 * only plays it out. The code is the manager's own, claimed straight away and used on their next
 * pack within 7 days.
 */
export const ukDay = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });

export interface OcheResult {
  outcome: OcheOutcome;
  darts: OcheDart[];
  pct: number;
  code: string;
  label: string;
  expiresAt: string;
  used: boolean;
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = (pct: number, r: (n: number) => number) => `OCHE${pct}-${Array.from({ length: 6 }, () => CODE_CHARS[r(CODE_CHARS.length)]).join("")}`;

async function view(t: { outcome: string; darts: unknown; pct: number; code: string; createdAt: Date }, userId: string): Promise<OcheResult> {
  const claim = await db.promoClaim.findUnique({ where: { userId_code: { userId, code: t.code } } });
  return {
    outcome: t.outcome as OcheOutcome,
    darts: t.darts as OcheDart[],
    pct: t.pct,
    code: t.code,
    label: OCHE_PRIZES[t.outcome as OcheOutcome].label,
    expiresAt: new Date(t.createdAt.getTime() + OCHE_CODE_DAYS * 86_400_000).toISOString(),
    used: !!claim?.usedAt,
  };
}

/** Today's throw, if the manager has had it. */
export async function todaysThrow(userId: string, now = new Date()) {
  const t = await db.ocheThrow.findUnique({ where: { userId_day: { userId, day: ukDay(now) } } });
  return t ? view(t, userId) : null;
}

/** Throw today's three darts. */
export async function throwAtOche(userId: string, r: (n: number) => number = (n) => randomInt(n), now = new Date()): Promise<OcheResult> {
  const day = ukDay(now);
  const done = await db.ocheThrow.findUnique({ where: { userId_day: { userId, day } } });
  if (done) throw new DomainError("THROWN", "You've had today's throw — come back tomorrow for three more darts.");
  const outcome = outcomeFor(r(10_000));
  const darts = planDarts(outcome, r);
  const pct = OCHE_PRIZES[outcome].pct;
  try {
    const t = await db.$transaction(async (tx) => {
      const code = newCode(pct, r);
      const row = await tx.ocheThrow.create({ data: { userId, day, outcome, darts: darts as unknown as Prisma.InputJsonValue, pct, code, createdAt: now } });
      await tx.promoClaim.create({ data: { userId, code, claimedAt: now } });
      return row;
    });
    return view(t, userId);
  } catch (e) {
    if (isUniqueViolation(e)) throw new DomainError("THROWN", "You've had today's throw — come back tomorrow for three more darts.");
    throw e;
  }
}
