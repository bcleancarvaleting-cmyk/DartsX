import Link from "next/link";
import { Countdown } from "@/components/countdown";
import { EmptyState } from "@/components/page-header";
import { requireUser } from "@/server/auth/session";
import { dartsGamesList } from "@/server/darts-games";
import { fmtGbp } from "@/server/wallet";

export const metadata = { title: "Darts games" };
export const dynamic = "force-dynamic";

export default async function DartsGamesPage() {
  const user = await requireUser();
  const games = await dartsGamesList(user.id);
  if (!games.length) return <EmptyState title="No darts on yet">The next event&apos;s games appear here as soon as the draw is made.</EmptyState>;
  const events = [...new Map(games.map((g) => [g.eventId, g.event])).values()];
  return (
    <div className="space-y-10">
      <div>
        <p className="eyebrow">Live data · powered by SportX</p>
        <h1 className="mt-1 text-4xl leading-none sm:text-5xl">Darts games</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Pick 3 for a round — a Contender (world 1–25), a Challenger (26–50) and an Outsider (51+) — or a stable of 4 for the whole event and watch the points build. £1 entry. <b className="text-fg">Bet X:</b> half of every entry goes into the prize pot, and the top score takes it.
        </p>
      </div>
      {events.map((ev) => (
        <section key={ev.id} className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-2xl">{ev.name}</h2>
            <Link href={`/darts/events/${ev.id}`} className="text-sm text-mint">Draw &amp; results →</Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {games
              .filter((g) => g.eventId === ev.id)
              .map((g) => (
                <Link key={g.id} href={`/darts/games/${g.id}`} className="panel flex flex-col gap-2 p-4 transition hover:border-mint/60">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-faint">{g.kind === "EVENT" ? "Full event · stable of 4" : "Round · team of 3"}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${g.status === "OPEN" ? "bg-mint/15 text-mint" : g.status === "LOCKED" ? "bg-[#ff5d5d]/15 text-[#ff8a8a]" : "bg-ink-800 text-muted"}`}>
                      {g.status === "OPEN" ? "Open" : g.status === "LOCKED" ? "Live" : "Settled"}
                    </span>
                  </div>
                  <p className="text-lg font-semibold">{g.name.replace(`${ev.name} · `, "")}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                    <span>Entry <b className="text-fg">{g.entryFeeMinor ? fmtGbp(g.entryFeeMinor) : "Free"}</b></span>
                    <span>Pot <b className="text-[#f5c451]">{fmtGbp(g.pot)}</b></span>
                    <span>{g._count.entries} entries</span>
                    {g.status === "OPEN" && (
                      <span>
                        Locks in <Countdown to={g.locksAt.toISOString()} className="font-semibold text-fg" />
                      </span>
                    )}
                  </div>
                  {g.mine.length > 0 && (
                    <p className="text-xs text-mint">
                      You&apos;re in · {g.mine.map((m) => `${m.points} pts${m.rank ? ` (#${m.rank})` : ""}`).join(" · ")}
                    </p>
                  )}
                </Link>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
