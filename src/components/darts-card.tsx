import { PARALLELS } from "@/domain/darts/cards";
import type { CardView } from "@/lib/view";
import { BOARD_ORDER } from "./dartboard";

const COUNTRY_CODE: Record<string, string> = {
  England: "ENG", Scotland: "SCO", Wales: "WAL", "Northern Ireland": "NIR", "Republic of Ireland": "IRL", Ireland: "IRL",
  Netherlands: "NED", Belgium: "BEL", Germany: "GER", Austria: "AUT", Poland: "POL", Australia: "AUS", "New Zealand": "NZL",
  Canada: "CAN", Portugal: "POR", Latvia: "LAT", "Czech Republic": "CZE", Japan: "JPN", Philippines: "PHI", "United States": "USA",
};
const cc = (country: string) => COUNTRY_CODE[country] ?? country.slice(0, 3).toUpperCase();
const pad = (n: number | null) => (n === null ? "—" : String(n).padStart(3, "0"));
const money = (gbp: number | null) => (gbp === null ? "—" : gbp >= 1_000_000 ? `£${(gbp / 1_000_000).toFixed(2)}m` : gbp >= 1000 ? `£${Math.round(gbp / 1000)}k` : `£${gbp}`);

const STEP = (Math.PI * 2) / 20;
const pt = (r: number, a: number) => `${(r * Math.sin(a)).toFixed(1)} ${(-r * Math.cos(a)).toFixed(1)}`;
const wedge = (r1: number, r2: number, a1: number, a2: number) => `M ${pt(r1, a1)} L ${pt(r2, a1)} A ${r2} ${r2} 0 0 1 ${pt(r2, a2)} L ${pt(r1, a2)} A ${r1} ${r1} 0 0 0 ${pt(r1, a1)} Z`;

/** The board behind the player (no numbers, drawn once per card). */
function Board() {
  return (
    <svg className="dcard-board" viewBox="-235 -235 470 470" aria-hidden="true">
      <circle r="225" fill="#111" />
      {BOARD_ORDER.map((n, i) => {
        const a1 = i * STEP - STEP / 2;
        const a2 = a1 + STEP;
        const d = i % 2 === 0;
        return (
          <g key={n} stroke="#9a9a9a" strokeWidth="0.8">
            <path d={wedge(162, 170, a1, a2)} fill={d ? "#e8152d" : "#12a150"} />
            <path d={wedge(107, 162, a1, a2)} fill={d ? "#141414" : "#efe6cf"} />
            <path d={wedge(99, 107, a1, a2)} fill={d ? "#e8152d" : "#12a150"} />
            <path d={wedge(16, 99, a1, a2)} fill={d ? "#141414" : "#efe6cf"} />
          </g>
        );
      })}
      <circle r="16" fill="#12a150" />
      <circle r="6.4" fill="#e8152d" />
    </svg>
  );
}

/** A darter mid-throw, as a silhouette (no likeness until the image rights are in place). */
function Darter({ tint }: { tint: string }) {
  return (
    <svg className="dcard-darter" viewBox="0 0 200 220" aria-hidden="true">
      <path d="M86 52c0-14 10-24 22-24s21 10 21 23-9 25-21 25-22-10-22-24z" fill="#141416" stroke={tint} strokeWidth="1.6" />
      <path d="M70 92c8-12 22-16 40-16 15 0 28 5 36 14l22 24c4 4 4 10 0 14l-8 6-26-20-2 40 8 66H58l8-66-6-36-30 14-6-10c-2-4-1-8 3-10z" fill="#141416" stroke={tint} strokeWidth="1.6" />
      <path d="M148 120l26-34 8 5-24 36z" fill="#141416" stroke={tint} strokeWidth="1.6" />
      <g transform="translate(178 80) rotate(-38)">
        <rect x="-1.5" y="-30" width="3" height="18" fill="#cfd5db" />
        <rect x="-2.6" y="-12" width="5.2" height="16" rx="2" fill="#9aa3ad" />
        <path d="M0 -28 L-7 -42 L0 -38 L7 -42 Z" fill={tint} />
      </g>
    </svg>
  );
}

/**
 * A DartsX card. Base cards wear the player's own shirt colours; Icons get a vintage gold frame;
 * Rare-pack parallels get their foil (Silver /99 … Black 1/1, Pink Laser) and a serial stamp.
 */
export function DartsCard({ card, size = "md", className = "", showcase = false }: { card: CardView; size?: "sm" | "md" | "lg"; className?: string; showcase?: boolean }) {
  const d = card.darts!;
  const par = d.parallel;
  const kind = par ? `p-${par.kind.toLowerCase()}` : d.icon ? "p-icon" : "p-base";
  const pattern = !par && !d.icon && d.colours.pattern ? ` pat-${d.colours.pattern}` : "";
  const tint = par ? PARALLELS[par.kind].colour : d.icon ? "#e9c46a" : d.colours.c2;
  const serial = par?.of ? (par.of === 1 ? "1/1" : `${String(par.serial).padStart(2, "0")}/${par.of}`) : null;
  const tag = par ? (par.kind === "PINK" ? "Pink Laser" : PARALLELS[par.kind].label) : d.icon ? "Icons" : card.edition === "STARTER" ? "Starter" : null;
  const parts = card.name.split(" ");
  const nameLines = parts.length > 1 ? [parts[0], parts.slice(1).join(" ")] : [card.name];
  return (
    <div
      className={`dcard dcard-${size} ${kind}${pattern} ${className}`}
      style={{ "--c1": d.colours.c1, "--c2": d.colours.c2, "--c3": d.colours.c3 ?? d.colours.c1 } as React.CSSProperties}
      role="img"
      aria-label={`${card.name}${tag ? `, ${tag}` : ""}${serial ? `, numbered ${serial}` : ""}`}
    >
      {tag && <span className="dcard-tag">{tag}</span>}
      <div className="dcard-face">
        <Board />
        <div className="dcard-glow" />
        <Darter tint={tint} />
        <div className="dcard-foil" />
        <div className="dcard-top">
          <span className="dcard-brand">
            DARTS<b>X</b>
          </span>
          <span className="dcard-no">#{pad(d.setNo)}</span>
        </div>
        {d.icon ? (
          <div className="dcard-rank">
            <b className="dcard-icon-word">ICON</b>
            <span>Legend of the oche</span>
          </div>
        ) : (
          <div className="dcard-rank">
            <b>{d.ranking ?? "—"}</b>
            <span>World rank</span>
          </div>
        )}
        <span className="dcard-country">{cc(card.nationality)}</span>
        {serial && <span className="dcard-serial">{serial}</span>}
        <div className="dcard-plate">
          {d.nickname && <div className="dcard-nick">{d.nickname}</div>}
          <div className="dcard-name">
            {nameLines.map((l, i) => (
              <span key={i}>{l}</span>
            ))}
          </div>
          {size !== "sm" && (
            <div className="dcard-stats">
              {d.icon ? (
                <div className="dcard-fact">{d.iconFact ?? "Icon of the oche"}</div>
              ) : (
                <>
                  <div>
                    <span>Ranking £</span>
                    <b>{money(d.earningsGbp)}</b>
                  </div>
                  {!showcase && (
                    <div>
                      <span>Value</span>
                      <b>{card.valueMp === null ? "—" : `£${card.valueMp.toFixed(2)}`}</b>
                    </div>
                  )}
                  <div>
                    <span>Copy</span>
                    <b>#{card.serial}</b>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
