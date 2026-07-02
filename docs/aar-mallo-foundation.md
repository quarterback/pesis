# AAR: Mallo foundation — from empty repo to a real-data pesäpallo analytics site

*2026-07-02. One working session, empty repo → deployed site with real 2026
Superpesis data. Branch `claude/darko-projection-system-xhwe7r`, PR #1 et seq.*

## What was built

- **Data**: SQLite store (players / seasons / matches / player_games at
  per-player per-match grain, full upstream row preserved in `raw`).
  Three feeds: keyed official API client (`api.py`, unused until a key
  arrives), **keyless real-data importer via v1.pesistulokset.fi**
  (`v1import.py` — the legacy site proxies `stats-tool/players` same-origin,
  82 fields/row), and a seeded synthetic demo league (`demo.py`).
- **Metrics** (`metrics.py`): rate stats with honest denominators, TEHO+
  (league-indexed production), kTEHO+ (park-adjusted), Savant-style
  percentiles, per-base kärkilyönti fingerprints, game logs.
- **PARE projections** (`projection.py`): DARKO-style exponential decay over
  the full game log + empirical-Bayes shrinkage to league mean; per-stat
  (beta, prior) tunable by walk-forward `fit_decay`; delta-method aging
  curve (inert on real data — no birth years in the keyless feed).
- **Context** (`context.py`): park factors by the team home/road method;
  weather effects (flag-aware — real wind data is 0/1, not m/s).
- **Standings & odds** (`simulate.py`): real Superpesis points (3/2/1/0),
  Monte Carlo playoff odds calibrated to empirical clean-win/tiebreak rates.
- **Similarity** (`similarity.py`), **baseball translation** (`translate.py`
  — rank-preserving quantile map onto MLB distributions, shareable English
  page), web UI (leaderboards, player/team/match pages, search, CSV export,
  league page, about — owner's own text, verbatim), CLI, Dockerfile +
  fly.toml (Fly app `pesis`, cdg, auto-stop off).
- **Fangraph** (`simulate.odds_history` + `static/charts.js`): playoff odds
  re-simulated at weekly cutoffs across the season, drawn with **D3 v7**
  (vendored under `pesis/web/static/`, no CDN; data page-embedded as JSON) —
  monotone curves, date axis, crosshair hover with an all-teams tooltip,
  top-4 in categorical colors with de-collided ink end labels, rest muted.
  Career pages got KL%/TEHO+ mini line charts (small multiples — never a
  dual axis), replacing the flat sparkline. Percentile bars stay HTML/CSS.
- **Four leagues**: Ykköspesis (men + women) importable via series aliases;
  `--series all` covers Superpesis + Ykköspesis; nav builds itself from
  whatever leagues exist in the DB, so women's and lower-tier leagues are
  first-class links, never buried behind filters.
- **Zero-CLI operations** (owner deploys via GitHub Desktop → Fly): the only
  manual step ever is creating the `pesis_data` volume once in the Fly web
  dashboard (3 GB; history is ~1.1 GB). `entrypoint.sh` seeds an empty
  volume from the image's baked current-season snapshot, **runs the 1991→
  historical backfill by itself in the background** on first boot (marker
  file on the volume prevents re-runs; skipped when no volume is mounted),
  and re-ingests all four leagues daily (`REFRESH_INTERVAL`, default 24 h).
  SQLite runs in WAL so the site serves during writes; web workers watch
  the DB mtime and drop their season/odds caches when it changes.

## Validation — what was actually checked

- **Standings**: recomputed both 2026 league tables from raw match data and
  compared to the official `result-board` endpoint (which publishes
  3p/2p/1p/0p counts): **exact points and games for all 24 teams.**
- **Projections**: the demo league generates stat lines from known latent
  talent; tests assert PARE recovers it (truth–projection correlation
  > 0.6), small samples shrink harder, recent games outweigh old.
- **Park factors**: demo bakes known park/wind effects; tests assert
  recovery and that kTEHO+ moves best-/worst-park hitters oppositely.
- **v1 field mapping**: offline fixture test incl. the upstream
  `runtadv_out` (no s) typo; live import spot-checked against known players.
- Suite: 28 tests green. Live routes smoke-tested + screenshotted after
  every phase.

## Mistakes made and caught (worth remembering)

1. **Standings scored by total runs.** Pesäpallo matches are decided by
   jaksot; a team can win 2–1 with fewer total runs, and periods can be
   DRAWN (`1-0 (4-4, 6-4)` is a real result). The final rule (validated
   24/24 teams): 3 = clean 2–0; 2 = any other win; 1 = loss **iff a
   tiebreak was actually played**; 0 otherwise. The edge that forced it:
   `0-1k (3-3, 1-1, 0-1k)` — both periods drawn, decided in the
   kotiutuslyöntikilpailu, loser still gets 1.
2. **Naive park factors absorbed team quality** (runs-at-stadium ÷ league
   rated a neutral park 105 because its home team rakes). Fixed with the
   same-team home/road ratio. The demo-as-ground-truth harness caught it.
3. **TEHO+ ≠ wRC+ scale.** Real production concentrates at the top of the
   order; the best hitters run TEHO+ 250–350. The baseball page's wRC+
   equivalent is quantile-mapped, never copied.
4. **Naming**: "TAHKO" collided with an actual Superpesis club, and the
   convention wanted is descriptive initialisms (WAR/OPS+ style), not
   person/club backronyms → PARE, eTEHO+/eKL%, kTEHO+. Site name is
   **Mallo** (owner call; "Kärki" retired).
5. **Deploy**: Fly Launch scaffolded a broken `flask run` Dockerfile over
   ours via PR #3; `fly.toml` now pins `build.dockerfile`. Auto-stop was
   reading as "the site randomly goes down" → always-on (min 1 machine).
6. **Big keyless payloads flake** (IncompleteRead mid-chunk): fixed with
   gzip (~10× smaller) + retries.

## Data facts worth not re-deriving

- v1.pesistulokset.fi serves the full stats-tool **without an api key**;
  season/seasonSeries ids come from a JSON catalog embedded in its HTML
  (82 seasons, 1945→). **Granular per-game rows verified back to 1991**
  (~4,300 rows/season/league) incl. per-base kärkilyönti splits.
- **Full backfill executed** (`ingest-v1 --from-year 1991 --to-year 2026`,
  both leagues, ~1s spacing): 266,746 player-game rows, 11,175 matches,
  2,812 players, 72 league-seasons. Longest careers found: Toni Kohonen 29
  seasons (1993–2022), Henri Puputti 27 (2000–2026, still active). Old
  payloads sometimes carry numbers as strings (coerced in `_match_runs`).
  Career pages over 35 years needed a process-level season-lines cache
  (first hit ~2.4s warms it, then ~0.2s/page).
- `windy`/`rainy` are 0/1 flags; temperature and attendance are per match;
  stadiums are real names with geo.
- Superpesis regular season is 28–33 games (33 in 2025) ≈ one MLB month —
  framed as a translation asset, not (only) a noise problem. Product
  principle: **contextualize observed stats (park → weather → opponent),
  don't just shrink them**; PARE is the forward-looking companion.
- No birth years in the keyless feed → aging curve and age-in-comps are
  dormant until the official key or a per-player page scrape.

## Not done (deliberately) / next

- Official API key (owner has emailed): unlocks pre-1991 archive checks,
  play-by-play (`runnersAtBases` → run expectancy/WPA, per-match win
  probability graphs), stats-definitions confirmation, birth years.
- Refit PARE (beta, prior) on the 1991→ backfill and bake tuned defaults;
  accuracy page (walk-forward MAE vs naive baselines); PARE trajectory
  charts (projection re-computed after every game — the D3 primitives are
  ready for it).
- Playoffs phases (only runkosarja, phase=1, is ingested), tiers below
  Ykköspesis (suomensarja etc.), division translation factors.
- FI/EN toggle (hard requirement, string tables), OG/social cards; UI
  redesign is a separate agent's lane — darko.app layout is the reference.
