/**
 * A tournament dartboard drawn in SVG (true proportions: double 170mm, treble 107/99mm, bulls
 * 15.9/6.35mm), in the board's own black, cream, red and green. Used by the oche hero and packs.
 */
export const BOARD_ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
export const BOARD = { red: "#e8152d", green: "#12a150", black: "#141414", cream: "#efe6cf", wire: "#b9b9b9" };

const R = { double: 170, doubleIn: 162, treble: 107, trebleIn: 99, outerBull: 15.9, bull: 6.35, numbers: 196, rim: 225 };

function wedge(r1: number, r2: number, a1: number, a2: number) {
  const p = (r: number, a: number) => `${(r * Math.sin(a)).toFixed(2)} ${(-r * Math.cos(a)).toFixed(2)}`;
  return `M ${p(r1, a1)} L ${p(r2, a1)} A ${r2} ${r2} 0 0 1 ${p(r2, a2)} L ${p(r1, a2)} A ${r1} ${r1} 0 0 0 ${p(r1, a1)} Z`;
}

export function Dartboard({ className = "", numbers = true, dart = false, title = "Dartboard" }: { className?: string; numbers?: boolean; dart?: boolean; title?: string }) {
  const step = (Math.PI * 2) / 20;
  return (
    <svg viewBox="-235 -235 470 470" className={className} role="img" aria-label={title}>
      <defs>
        <radialGradient id="db-rim" cx="0.5" cy="0.45" r="0.6">
          <stop offset="0.75" stopColor="#1b1b1b" />
          <stop offset="1" stopColor="#050505" />
        </radialGradient>
        <radialGradient id="db-sheen" cx="0.35" cy="0.25" r="0.8">
          <stop offset="0" stopColor="#fff" stopOpacity="0.16" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle r={R.rim} fill="url(#db-rim)" />
      <circle r={R.rim - 4} fill="none" stroke="#2c2c2c" strokeWidth="2" />
      {BOARD_ORDER.map((n, i) => {
        const a1 = i * step - step / 2;
        const a2 = a1 + step;
        const dark = i % 2 === 0;
        const single = dark ? BOARD.black : BOARD.cream;
        const ring = dark ? BOARD.red : BOARD.green;
        return (
          <g key={n} stroke={BOARD.wire} strokeWidth="0.8">
            <path d={wedge(R.doubleIn, R.double, a1, a2)} fill={ring} />
            <path d={wedge(R.treble, R.doubleIn, a1, a2)} fill={single} />
            <path d={wedge(R.trebleIn, R.treble, a1, a2)} fill={ring} />
            <path d={wedge(R.outerBull, R.trebleIn, a1, a2)} fill={single} />
          </g>
        );
      })}
      <circle r={R.outerBull} fill={BOARD.green} stroke={BOARD.wire} strokeWidth="0.8" />
      <circle r={R.bull} fill={BOARD.red} stroke={BOARD.wire} strokeWidth="0.8" />
      {numbers &&
        BOARD_ORDER.map((n, i) => {
          const a = i * step;
          return (
            <text key={n} x={(R.numbers * Math.sin(a)).toFixed(1)} y={(-R.numbers * Math.cos(a)).toFixed(1)} fill="#f2f2f2" fontSize="22" fontWeight="700" textAnchor="middle" dominantBaseline="central" fontFamily="var(--font-display), system-ui, sans-serif">
              {n}
            </text>
          );
        })}
      <circle r={R.rim} fill="url(#db-sheen)" />
      {dart && (
        // Three darts in the treble 20.
        <g>
          {[-0.09, 0, 0.08].map((off, i) => {
            const x = 103 * Math.sin(off);
            const y = -103 * Math.cos(off);
            return (
              <g key={i} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${-28 + i * 12})`}>
                <line x1="0" y1="0" x2="0" y2="-8" stroke="#ccc" strokeWidth="1.6" />
                <rect x="-3.2" y="-34" width="6.4" height="26" rx="2.4" fill="#9aa3ad" />
                <rect x="-3.2" y="-30" width="6.4" height="2" fill="#5b636c" />
                <rect x="-3.2" y="-25" width="6.4" height="2" fill="#5b636c" />
                <rect x="-1.4" y="-56" width="2.8" height="22" fill="#1d2126" />
                <path d="M0 -54 L-11 -76 L0 -70 L11 -76 Z" fill={i === 1 ? BOARD.green : BOARD.red} />
              </g>
            );
          })}
        </g>
      )}
    </svg>
  );
}
