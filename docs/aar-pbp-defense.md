# AAR: Play-by-play ingest, RE24 and defensive stats

**Date:** 2026-08-03
**Scope:** `pesis/pbp.py` (new), `pesis/defense.py` (new), `pesis/db.py`,
`pesis/cli.py`, `pesis/metrics.py`, `export.py`, `site/js/app.js`,
`site/js/primer.js`, `site/sw.js`, `.github/workflows/refresh-data.yml`.

## Context

The owner asked for defensive stats and play-by-play integration, with three
scope calls: team AND player defense ship to the site (player boards labeled
as inference), backfill covers the current season only, and JYK/VYK adopt
RE24-derived run weights for PBP-covered seasons. Two design constraints came
from umpire feedback relayed by the owner: a koppi is a fielding act and never
an out (outs exist only as explicit palo events; a haava clears runners with
no out), and defensive value must be measured with run expectancy, not
assumed outs.

## The decisive discovery

`https://v1.pesistulokset.fi/api/v1/online/{match_id}/events` is **keyless**
(~230 KB, ~1 s per match) — earlier docs assumed play-by-play needed an API
key. `matches.id` is the upstream match id, so match enumeration comes from
our own DB. The feed carries per-hit x/y coordinates with separate `caught`
and `out` flags, `runnersAtBases` on every sub-event, explicit `{out:1}`
tokens, run (`score`/`wtscore`/`walkscore`) tokens, wild-throw advances, and
lineup-change events with full batting orders.

## Parser ground rules (verified against real payloads)

- `runnersAtBases` is the authoritative post-event base state — the parser
  reads it instead of simulating the grammar, so unmodeled text forms cannot
  corrupt state.
- Halves end by (period, inning, batTurn) key change, never `outs == 3`: the
  round rule ends halves at 0–2 outs and a walk-off half can be absent.
- Period 2 is the supervuoro (sometimes markers only), period 3 the scoring
  contest; both stored, both excluded from run-environment stats.
- A kunnari scores one run and leaves the batter on third.
- The payload's `hTeam` field is NOT the home team — it mirrors the acting
  team. Home/away is resolved at import time by joining batter ids to
  `player_games.home`. This was caught by validation: run totals matched the
  box score in aggregate but landed entirely on one side.
- Grammar discovered beyond the samples: `karkasi` (batter takes off, an
  advance), `wtscore`/`walkscore` (runs on wild throws and forced walks),
  `jätettiin välistä` (batter skipped), group types `x` (tekninen palo, a
  real out with `team: null`) and `n` (free-text note), `manager` tokens
  (bench warnings). Unknown tokens warn and never raise.

## Validation

`pbp-check` reconciles per-match run totals from plays against the box
score: **308 of 308 matches of 2026 Superpesis (M+N) match exactly** for both
home and away after the fixes above. Zero parser warnings on the four
hand-inspected matches; the full-season warning list is empty after the
grammar additions.

## Coordinates and player attribution

The feed names no fielder on any play, so player-level defense is positional
inference, labeled as such in the UI:

- **Depth**: y is inverted depth — koppi share falls monotonically from 74 %
  at y<10 to 1 % at y>90. Koppari zone y<30, lukkari front zone y≥70.
- **Side**: which x half the 3K covers was settled empirically: the
  assignment that makes individual outfielders' catch rates consistent
  across their own matches is correct. Odd/even-match catch-rate correlation
  is 0.45 with 3K on the high-x half vs 0.12 mirrored (`OF_3K_LOW_X =
  False`). A scrambled assignment destroys within-player stickiness, so the
  test is self-validating.
- The lukkari's identity is exact (box-score position); only which plays are
  theirs is inferred from depth. The board is centred on the league-average
  front-zone play so it reads as runs above an average lukkari.

## Face validity

2026 men's Superpesis: the 2–27 bottom team has the league-worst defense
(−3.5 PEJ/O, highest wild-throw cost, double the league extra-advance rate);
the top teams are positive. The RE table is monotone (bases loaded, 0 outs =
1.11 expected runs; empty, 2 outs = 0.09). RE24 event weights land near the
legacy scaffold but measurably apart (palot −0.36 vs −0.28, KL 0.15 vs 0.10)
— 2026 JYK/VYK shift accordingly; historical seasons are untouched.

## Known limitations (deliberate, documented)

- Player attribution is zone inference; in-game infield positions are fluid,
  so infield player defense stays internal-only.
- The RE table has no batter-index dimension, so the round rule is absorbed
  on average rather than modeled; a gen-2 upgrade path.
- The extra-advance index (LE-idx) is noisy at season sample sizes.
- Batting-order slots are stored (`lineups`) but not yet used by any metric;
  role-aware TEHO+ remains future work.
- Raw payloads are not stored (Actions cache budget) — a parser semantics
  change means bumping `PARSE_VERSION`, which triggers a refetch pass
  (~10 min per season).

## Follow-up (same day): field map, RE grid, standings cleanup

- **Defensive field map** (`renderFieldMap` in charts.js): opponent balls in
  play binned into eight zones (three back lanes, three middle lanes, two
  front wedges — `defense.team_zone_map`), shaded by the team's koppi rate
  against the league rate in the same zone. Diverging fill pair validated
  with the dataviz six-check script per theme (light #a53860/#4c5dd0, dark
  #d96f80/#6b74e0, neutral midpoint); every zone carries direct ink labels
  and a hover tooltip. Zone aggregation happens at export — raw hit points
  never ship to the client.
- **RE24 grid** (`renderReGrid`): the 24-state run-expectancy table as a
  matrix on the Puolustus view, sequential accent fill at graded opacity,
  values in ink.
- **Standings page cleanup** (owner request): the playoff-odds chart was
  removed (it repeated the standings), and `context.park_factors` now merges
  rows by normalized stadium name — several home teams share identically
  named or whitespace-drifted park strings, which showed as duplicate rows.
- A Playwright pass caught the zone labels intercepting pointer events and
  blocking the polygon tooltips; fixed with `pointer-events: none`.

## Operational notes

The daily workflow ingests current-season PBP between the stats ingest and
the export; matches without live scoring are marked `missing` once and never
refetched. The first CI run after merge performs the season backfill inline
(~600–1000 matches ≈ 15–30 min, well inside the job limit). Older seasons
can be probed later with `python -m pesis ingest-pbp --year YYYY`.
