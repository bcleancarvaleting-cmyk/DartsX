import Link from "next/link";
import { notFound } from "next/navigation";
import type { DartsStatLine } from "@/domain/darts/scoring";
import { db } from "@/server/db";

export const metadata = { title: "Darts event" };
export const dynamic = "force-dynamic";

export default async function DartsEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await db.dartsEvent.findUnique({ where: { id }, include: { rounds: { orderBy: { number: "asc" }, include: { matches: { orderBy: { order: "asc" } } } } } });
  if (!event) notFound();
  const ids = [...new Set(event.rounds.flatMap((r) => r.matches.flatMap((m) => [m.aId, m.bId])))];
  const darters = new Map((await db.player.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true, ranking: true } })).map((p) => [p.id, p]));
  const line = (s: unknown) => s as DartsStatLine | null;
  return (
    <div className="space-y-8">
      <div>
        <Link href="/darts" className="text-sm text-muted">← Darts games</Link>
        <p className="eyebrow mt-3">{event.tour}{event.simulated ? " · simulated from real rankings" : " · live data powered by SportX"}</p>
        <h1 className="mt-1 text-4xl leading-none">{event.name}</h1>
      </div>
      {event.rounds.map((r) => (
        <section key={r.id} className="space-y-2">
          <h2 className="text-2xl">
            {r.name} <span className="text-sm text-faint">· first to {r.legsToWin} · {r.status === "FINISHED" ? "played" : r.status === "LIVE" ? "on now" : r.startsAt.toUTCString().slice(0, 22)}</span>
          </h2>
          {!r.matches.length ? (
            <p className="text-sm text-muted">The draw is made when the round before finishes.</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {r.matches.map((m) => {
                const sides = [
                  { p: darters.get(m.aId), legs: m.legsA, s: line(m.statsA), won: m.winnerId === m.aId },
                  { p: darters.get(m.bId), legs: m.legsB, s: line(m.statsB), won: m.winnerId === m.bId },
                ];
                return (
                  <div key={m.id} className="panel space-y-1 p-3">
                    {sides.map((x, i) => (
                      <div key={i} className={`flex items-center gap-2 text-sm ${m.winnerId && !x.won ? "text-faint" : ""}`}>
                        <span className="w-9 text-xs text-faint">#{x.p?.ranking ?? "—"}</span>
                        <span className="min-w-0 flex-1 truncate font-semibold">{x.p?.displayName ?? "?"}</span>
                        {x.s && (
                          <span className="text-xs text-muted">
                            {x.s.average.toFixed(2)} avg{x.s.oneEighties ? ` · ${x.s.oneEighties}×180` : ""}{x.s.checkouts.length ? ` · hi ${Math.max(...x.s.checkouts)}` : ""}
                          </span>
                        )}
                        <span className="w-6 text-right font-bold tabular-nums">{m.status === "FINISHED" ? x.legs : ""}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
