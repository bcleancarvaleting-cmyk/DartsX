"use client";

import { useActionState, useState } from "react";
import { darterLookAction } from "@/app/actions/darts-cards";
import { ResultText } from "./action-button";

/** One player's card look: three colours, an optional shirt pattern and the nickname. */
export function DarterLookForm({ p }: { p: { id: string; name: string; rank: string; nickname: string; c1: string; c2: string; c3: string; pattern: string; set: boolean } }) {
  const [state, run, pending] = useActionState(darterLookAction, null);
  const [c, setC] = useState({ c1: p.c1, c2: p.c2, c3: p.c3 });
  return (
    <form action={run} className="flex flex-wrap items-end gap-3 border-t border-ink-800 py-3 first:border-0">
      <input type="hidden" name="playerId" value={p.id} />
      <span className="h-12 w-9 shrink-0 rounded-md border-2" style={{ background: `linear-gradient(160deg, ${c.c1}, ${c.c3})`, borderColor: c.c2 }} aria-hidden="true" />
      <div className="min-w-0 basis-44">
        <p className="truncate font-semibold">{p.name}</p>
        <p className="text-xs text-faint">
          {p.rank} · {p.set ? "colours set" : "country colours"}
        </p>
      </div>
      {(["c1", "c2", "c3"] as const).map((k) => (
        <label key={k} className="grid text-[10px] font-bold uppercase tracking-wider text-faint">
          {k === "c1" ? "Main" : k === "c2" ? "Trim" : "Shade"}
          <input type="color" name={k} value={c[k]} onChange={(e) => setC({ ...c, [k]: e.target.value })} className="h-9 w-12 cursor-pointer rounded border border-ink-700 bg-transparent" />
        </label>
      ))}
      <label className="grid text-[10px] font-bold uppercase tracking-wider text-faint">
        Pattern
        <select name="pattern" defaultValue={p.pattern} className="input py-1.5 text-sm">
          <option value="">Plain</option>
          <option value="fractured">Fractured</option>
          <option value="chequer">Chequered sleeve</option>
        </select>
      </label>
      <label className="grid min-w-0 basis-40 text-[10px] font-bold uppercase tracking-wider text-faint">
        Nickname
        <input name="nickname" defaultValue={p.nickname} className="input py-1.5 text-sm normal-case tracking-normal" placeholder="The Nuke" />
      </label>
      <button className="btn-primary px-3 py-2 text-xs" disabled={pending}>{pending ? "…" : "Save"}</button>
      {p.set && (
        <button name="reset" value="1" className="btn-ghost px-3 py-2 text-xs" disabled={pending}>
          Reset
        </button>
      )}
      {state && <ResultText result={state} />}
    </form>
  );
}
