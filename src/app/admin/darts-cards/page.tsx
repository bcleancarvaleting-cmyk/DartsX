import { DarterLookForm } from "@/components/darter-look-form";
import { coloursFor } from "@/domain/darts/cards";
import { db } from "@/server/db";
import { AdminTitle } from "../_parts/title";

export const metadata = { title: "Admin · Darts cards" };
export const dynamic = "force-dynamic";

export default async function DartsCardsAdmin() {
  const players = await db.player.findMany({
    where: { sport: { code: "darts" } },
    orderBy: [{ icon: "asc" }, { ranking: { sort: "asc", nulls: "last" } }, { displayName: "asc" }],
    select: { id: true, displayName: true, ranking: true, icon: true, nickname: true, colours: true, nationality: true },
  });
  const set = players.filter((p) => coloursFor(p.colours, p.nationality).set).length;
  return (
    <>
      <AdminTitle
        title="Darts cards"
        intro={`Each base card wears the player's shirt colours: main, trim and shade, plus an optional pattern. Until you set them, a player's card uses their country's colours. ${set} of ${players.length} set. Changes show on every copy straight away.`}
      />
      <section className="panel p-5">
        {players.map((p) => {
          const c = coloursFor(p.colours, p.nationality);
          return (
            <DarterLookForm
              key={p.id}
              p={{ id: p.id, name: p.displayName, rank: p.icon ? "Icon" : `World #${p.ranking ?? "—"}`, nickname: p.nickname ?? "", c1: c.c1, c2: c.c2, c3: c.c3 ?? c.c1, pattern: c.pattern ?? "", set: c.set }}
            />
          );
        })}
      </section>
    </>
  );
}
