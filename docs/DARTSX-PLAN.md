# DartsX — build plan

DartsX is its own site and brand (playdartsx.com), built on the MATCHX foundations: accounts, wallet
and Stripe, packs, the market, binders, boosters, notifications and admin. The game itself and the
customer-facing design are darts-first and new.

## Agreed rules (17 Nov 2026)

**Scoring — per darter, per match** (`src/domain/darts/scoring.ts`)

| Event | Points |
|---|---|
| 3-dart average | = the average (99.68 → 99.68) |
| 180 | +25 each |
| 170 checkout | +20 |
| 140+ visit (140–179) | +10 each |
| Highest checkout of the round | +10 (ties all get it) |
| Leg won | +5 each |
| 100+ checkout (100–169) | +8 |
| Match won | +15 |
| Whitewash win | +10 |
| 9-dart finish | +100 |
| Checkout % 40%+ | +5 |
| Win into the QF / SF / Final / win the event | +10 / +20 / +30 / +50 |
| Captain | ×2 |

**Stables and teams** (`src/domain/darts/teams.ts`)
- A stable is 6 darters. A team is 3: one **Contender** (rankings 1–25), one **Challenger** (26–50)
  and one **Outsider** (51+), with one captain.
- Packs never contain the top 10 — they come from the Oche Shop, auctions and drops.

**Renames:** Transfers → **The Oche Shop**. Data credit: **Powered by SportX**.

## Phases
1. **Foundation** — MATCHX copied and rebranded; darts scoring, team and pack rules with tests. ✅
2. **Darts data model** — darters (world rankings, nationality, nickname, walk-on), tour events,
   rounds and darter-vs-darter matches with per-match stats; competitions per event, round by
   round; simulated events from real rankings/averages; darts API connector once a key is in.
3. **Customer-facing redesign** — new DartsX identity, darter cards, stables, team picker (one per
   band), the Oche Shop, binders (per band + event sets), booster starter pack, live event screen
   (bracket, live averages, 180 counter, checkout feed), homepage slides built around competition.
4. **Launch** — EU hosting (Frankfurt), Stripe, emails, legal pages for DartsX.

## Phase 2b — built 17 Nov 2026

- **Games** (`src/server/darts-games.ts`): every event gets a **Full event** game (a stable of 4:
  one of each band plus a wildcard, max two Contenders; points build round by round) and a
  **Round** game for each round with 8+ darters left (a team of 3 from that round's draw; if a band
  has nobody left, any darter fills its place). Semis and Final count in the full-event game.
- **£1 entries**, up to 3 entries per game. **Bet X**: the pot is 50% of entry fees; the top score
  takes it, ties split it, odd pennies stay with the house. Admins play for bragging rights.
- **Cards play once at a time**: a copy is locked to its entry until that game settles, so five
  Littler entries need five Littler cards.
- **Card values capped at £5** (`MAX_CARD_VALUE_GBP`; darts values by world ranking: No. 1 £5.00,
  −3.5p a place, 50p floor).
- **Boosters**: every new manager gets one of each of the six; one per entry, on one darter.
- **Starter**: 6 untradeable darters (2 Contenders ranked 11–25, 2 Challengers, 2 Outsiders).
- **Packs**: Outsider £2, Challenger £4, Contender £5 — never the top 10 (`minRanking` slot filter); Rare £10 — 2 random darters from the top 10.
- **Supply**: on first load each darter gets a pack-pool release (Gold 50, Silver 100, Bronze 150 copies).
- **Jobs** (every 5 min): lock started games, throw simulated rounds 20 min after they start,
  keep a simulated event on the calendar, live points, settle.
- **Pages**: `/darts` (games), `/darts/games/[id]` (pick team, boosters, leaderboard),
  `/darts/events/[id]` (draw and results).

To raise entries later: change `DARTS_ENTRY_FEE_MINOR` (new games) or the game's `entryFeeMinor`.

## Circulation, packs and the daily throw — 17 Nov 2026

- **Card tiers by world ranking**: Legend (top 20) 10 copies each · Top (21–50) 40 each · Tour (51+)
  60 each — about 6,000 cards in all, minted into the pack pool when the darters load.
- **Legends only come from the £10 Rare pack** (2 random Legends) and the Oche Shop. Contender £5
  (a Contender ranked 21–25 + two Challengers, all Tops), Challenger £4 (two Tops), Outsider £2
  (Tour cards, 25% chance of a Top).
- **Fair starter stable**: an untradeable Starter edition (outside the circulation): two Contenders
  (21–25), two Challengers (26–50), two Outsiders (51+), each pair mirrored (21+25, 26+50 …) so
  every stable is equally strong.
- **Simulated events use the whole 128**, so every card in every stable is in the draw.
- **Daily throw on the pack page**: three darts once a UK day, every throw wins — 180 = 20% off
  (5% chance), 170 = 15% (15%), Double 20 finish = 10% (80%). The result is decided on the server;
  the code (OCHE20-XXXXXX …) is the manager's own, comes off their next pack automatically, single
  use, valid 7 days. The biggest discount a manager holds always comes off first.
