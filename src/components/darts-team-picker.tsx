"use client";

import { useActionState, useMemo, useState } from "react";
import { enterDartsAction, withdrawDartsAction } from "@/app/actions/darts";
import { ResultText } from "./action-button";

export interface PickerCard {
  id: string;
  name: string;
  ranking: number | null;
  band: "CONTENDER" | "CHALLENGER" | "OUTSIDER";
  serial: number;
  inThisEntry: boolean;
  busy: boolean; // in another game
}
export interface PickerBooster {
  id: string;
  kind: string;
  name: string;
  icon: string;
  description: string;
}

const BAND_STYLE = {
  CONTENDER: { label: "Contender · 1–25", cls: "border-[#f5c451]/60 text-[#f5c451]" },
  CHALLENGER: { label: "Challenger · 26–50", cls: "border-[#c9d3e0]/60 text-[#c9d3e0]" },
  OUTSIDER: { label: "Outsider · 51+", cls: "border-[#d08a52]/60 text-[#d08a52]" },
} as const;

/** Pick a team from your stable: tap darters, tap ★ for captain, add one booster. */
export function DartsTeamPicker({
  gameId,
  teamSize,
  rule,
  cards,
  boosters,
  entryNo,
  entryId,
  initial,
  feeLabel,
}: {
  gameId: string;
  teamSize: number;
  rule: string;
  cards: PickerCard[];
  boosters: PickerBooster[];
  entryNo: number;
  entryId?: string;
  initial?: { cards: string[]; captain?: string; boosterId?: string; boostOn?: string };
  feeLabel: string;
}) {
  const [picked, setPicked] = useState<string[]>(initial?.cards ?? []);
  const [captain, setCaptain] = useState(initial?.captain ?? "");
  const [boosterId, setBoosterId] = useState(initial?.boosterId ?? "");
  const [boostOn, setBoostOn] = useState(initial?.boostOn ?? "");
  const [state, run, pending] = useActionState(enterDartsAction, null);
  const [wState, withdraw, wPending] = useActionState(withdrawDartsAction, null);
  const byBand = useMemo(() => {
    const m = new Map<string, PickerCard[]>();
    for (const c of cards) m.set(c.band, [...(m.get(c.band) ?? []), c]);
    return m;
  }, [cards]);
  const toggle = (id: string) => {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= teamSize ? p : [...p, id]));
    if (captain === id) setCaptain("");
    if (boostOn === id) setBoostOn("");
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">{rule}</p>
      {(["CONTENDER", "CHALLENGER", "OUTSIDER"] as const).map((band) => (
        <div key={band}>
          <p className={`mb-2 inline-block rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${BAND_STYLE[band].cls}`}>{BAND_STYLE[band].label}</p>
          {!(byBand.get(band)?.length) ? (
            <p className="text-xs text-faint">No {band.toLowerCase()} cards in this draw — get some from packs or the Oche Shop.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {byBand.get(band)!.map((c) => {
                const on = picked.includes(c.id);
                return (
                  <div key={c.id} className={`flex items-center gap-2 rounded-xl border p-2.5 transition ${on ? "border-mint bg-mint/10" : "border-ink-700"} ${c.busy ? "opacity-50" : ""}`}>
                    <button type="button" disabled={c.busy} onClick={() => toggle(c.id)} className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-sm font-semibold">{c.name}</span>
                      <span className="text-[11px] text-faint">
                        World #{c.ranking ?? "—"} · copy #{c.serial}
                        {c.busy ? " · in another game" : ""}
                      </span>
                    </button>
                    {on && (
                      <button type="button" onClick={() => setCaptain(c.id)} title="Captain (×2)" className={`rounded-lg px-2 py-1 text-xs font-bold ${captain === c.id ? "bg-[#f5c451] text-ink-950" : "border border-ink-700 text-muted"}`}>
                        C
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {boosters.length > 0 && (
        <div className="rounded-xl border border-ink-700 p-3">
          <p className="eyebrow mb-2">Booster (optional, one per entry)</p>
          <div className="flex flex-wrap gap-2">
            {boosters.map((b) => (
              <button key={b.id} type="button" title={b.description} onClick={() => setBoosterId(boosterId === b.id ? "" : b.id)} className={`rounded-lg border px-2.5 py-1.5 text-xs ${boosterId === b.id ? "border-mint bg-mint/10" : "border-ink-700"}`}>
                {b.icon} {b.name}
              </button>
            ))}
          </div>
          {boosterId && (
            <>
              <p className="mt-2 text-xs text-muted">{boosters.find((b) => b.id === boosterId)?.description}</p>
              <select value={boostOn} onChange={(e) => setBoostOn(e.target.value)} className="input mt-2">
                <option value="">Put it on…</option>
                {picked.map((id) => (
                  <option key={id} value={id}>{cards.find((c) => c.id === id)?.name}</option>
                ))}
              </select>
            </>
          )}
        </div>
      )}

      <form action={run} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="gameId" value={gameId} />
        <input type="hidden" name="entryNo" value={entryNo} />
        {picked.map((id) => (
          <input key={id} type="hidden" name="card" value={id} />
        ))}
        <input type="hidden" name="captain" value={captain} />
        <input type="hidden" name="boosterId" value={boosterId && boostOn ? boosterId : ""} />
        <input type="hidden" name="boostOn" value={boosterId ? boostOn : ""} />
        <button className="btn-primary px-5 py-2.5" disabled={pending || picked.length !== teamSize || !captain}>
          {pending ? "Saving…" : entryId ? "Save changes" : `Enter · ${feeLabel}`}
        </button>
        <span className="text-xs text-faint">
          {picked.length}/{teamSize} picked{captain ? " · captain set" : " · tap C for your captain"}
        </span>
        {state && <ResultText result={state} />}
      </form>
      {entryId && (
        <form action={withdraw} className="flex items-center gap-3">
          <input type="hidden" name="gameId" value={gameId} />
          <input type="hidden" name="entryId" value={entryId} />
          <button className="btn-ghost px-3 py-1.5 text-xs" disabled={wPending}>Withdraw entry</button>
          {wState && <ResultText result={wState} />}
        </form>
      )}
    </div>
  );
}
