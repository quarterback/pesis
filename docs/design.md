# Mallo design doc — a sabermetrics layer for pesäpallo

*(Site name: **Mallo** — owner call 2026-07; earlier working name "Kärki" retired.)*

*2026-07-01. Status: v0 shipped (this repo); real-data backfill pending an API key.*

## Why this can exist at all

Investigation of pesistulokset.fi (June 2026) found it is not a scraping
target but a **documented JSON API** — the public site is an Angular SPA fed
entirely from `https://api.pesistulokset.fi/api/v1`. Everything below was
verified against live responses:

- **Access:** every request takes an `apikey` param. Keys are free by emailing
  `tulospalvelu@pesis.fi`; docs live at https://ttk.pesistulokset.fi/api-docs.
  Third-party use is explicitly supported (official WordPress plugin consumes
  the same API).
- **Coverage:** `/public/series-list` spans **1945–present** (2026 alone has
  ~220 series: Superpesis men/women, Ykköspesis, suomensarja, maakuntasarja,
  the whole youth pyramid). Standings/results reach the 1940s–70s; **granular
  per-player per-match stats verified back to 1990** (Superpesis's founding).
- **The goldmine — `/stats-tool/players`:** ~82 fields per player per match:
  kunnarit/lyödyt/tuodut with attempt counts, kärkilyönnit split by target
  base (succeeded/outs/caughts/tries × bases 1–3 + home), saatot, kärki- and
  takaetenemiset each with haavat/palot/tries, `turns_at_bat`, defensive
  position, plus match context (opponent, home/away, **weather, attendance**).
- **Play-by-play — `/online/{match}/events`:** event stream with a
  `runnersAtBases` array on every event → run-expectancy and win-probability
  models are buildable.
- **Also available:** batter–runner pair stats, a spatial **hit-map** endpoint,
  line scores by jakso incl. supervuoro, referees, transfers, disciplinary
  decisions.

Nobody has built an analytics layer on any of this. The niche is empty.

## What we borrow, from whom

| Source | Borrowed idea | Mallo incarnation |
| --- | --- | --- |
| DARKO | daily-updating Bayesian projections; per-stat exponential decay with *fitted* decay constants; no arbitrary "last N games" windows; aging curves per stat; shrinking to a prior with confidence-dependent learning rate | the projection engine (`pesis/projection.py`) |
| Baseball Savant | percentile sliders as the player's skill fingerprint; diverging red↔blue = bad↔good; spray/hit charts | player page percentile bars (shipped); hit-map page (roadmap — API has the endpoint) |
| FanGraphs | league-indexed rate stats (wRC+ → **TEHO+**), qualified leaderboards, career tables | `pesis/metrics.py` + web leaderboards |
| Baseball-Reference | season-by-season career lines, era adjustment | player page "Kaudet" table |
| LEBRON / DPM | box-score prior blended with on/off impact | roadmap: lineup-level plus-minus from PBP once ingested |
| Tango et al. | delta-method aging curves, attempt-weighted | `projection.aging_curve` |

## Metric definitions (v0)

Traditional Finnish line: **O / K / L / T / YHT** — kunnarit, lyödyt juoksut
(batter credit), tuodut juoksut (runner credit), tehot = K+L+T. Finnish media
publish counting stats and a few percentages; the sabermetric additions are
honest denominators and league context:

- `kl_pct` = kärkilyönnit / yritykset — the core batting skill (already
  conventional, but we percentile-rank it among qualified players).
- `saatto_pct`, `eten_pct` — advancement skill as batter / as runner.
- `kunnari_rate`, `lyoty_rate`, `haava_rate`, `palo_rate` — per turn at bat.
- **TEHO+** = 100 × (tehot per turn) / (league tehot per turn). Era- and
  league-adjusted production index in the spirit of OPS+/wRC+. Attempt-weighted
  league mean, so the index is stable across seasons and divisions.
- Qualification: ≥ 40 turns at bat (`metrics.QUALIFY_TURNS`).

Known v0 crudeness, deliberate: tehot-per-turn mixes runner production
(tuodut) into a batter denominator. A proper split needs runner exposure from
PBP (see roadmap). `projection._tuotu_proxy` is the placeholder and says so.

## The projection model

*(Naming convention, owner call 2026-07: descriptive initialisms in the
WAR/OPS+/xBA tradition — the system is **PARE** (Painotettu ja Regressoitu
Ennuste), projected stats take an e- prefix (eTEHO+, eKL%), park-adjusted a
k- prefix (kTEHO+). Never named after people or clubs — the original name
"TAHKO" collided with Tahko, an actual Superpesis club.)*

DARKO's core question, transplanted: *how much of a hot streak is real?*

1. **Exponential decay.** Every game ever played, weighted `beta^days_ago`.
   Per-stat beta — sticky skills decay slowly.
2. **Empirical-Bayes shrinkage.** Decayed evidence blended with the league
   mean at a per-stat prior strength (pseudo-attempts). This is the
   steady-state Kalman gain for a random-walk talent model.
3. **Aging.** Delta-method curve per stat (consecutive-season pairs, weighted
   by the smaller attempt count). Survivorship bias is uncorrected in v0.
4. **Hyperparameters are fitted, not vibes:** `fit_decay` walk-forward-scores
   (beta, prior strength) grids over the full history — same idea as DARKO's
   differential-evolution search, grid is fine at our scale.

Validation shipped with the code: the demo league generates every stat line
from *known latent talent*, and `tests/test_projection.py` asserts the projections
recover it (truth–projection correlation), that small samples shrink harder,
and that recent evidence outweighs old.

### Product principle: contextualize, don't just shrink

A 28–33 game season could be framed as "too noisy to trust" — that is the
wrong frame (owner decision, 2026-07). The same short season is unusually
*rich in recorded context*: every match row carries park, weather,
temperature, attendance and opponent, and the PBP carries base states. So
observed stats stay the headline, **adjusted for the context they happened
in** (TEHO+adj is the first: park-adjusted; weather- and opponent-adjusted
come next). The projections remain the forward-looking companion, not a replacement
for what actually happened.

### Shipped: REAL current-season data, keylessly (`v1import.py`)

v1.pesistulokset.fi (the legacy results site) proxies the stats-tool API
same-origin **without an api key**: one GET to
``/api/v1/stats-tool/players?season=&seasonSeries=&phase=`` returns every
per-player per-match row for a series-season plus name/team/match maps with
real stadiums, weather flags (0/1 windy/rainy — not m/s), temperature and
attendance. Season/series ids come from the catalog blob embedded in the
site HTML (82 seasons, 1945→). The Dockerfile bakes the 2026 men's + women's
Superpesis at build time (demo fallback if offline); each deploy refreshes
the snapshot. The official key remains wanted for: 1990→ backfill,
play-by-play, per-base stats definitions confirmation, and not depending on
a legacy site staying up. Note from real data: born years are NOT in the v1
payload (ages/aging need the key or a roster source), and raw TEHO+ runs to
300+ because production concentrates in the top order — which is why the
baseball page quantile-maps its wRC+ equivalent instead of copying TEHO+.

### Shipped since v0 (Tier A — per-game rows + match context)

- **TEHO+adj** (`metrics._add_park_adjusted`): per-game production deflated
  by the venue's kenttäkerroin, re-indexed to league-average 100 — the first
  context-adjusted headline stat. Next adjustments: wind/temperature, then
  opponent strength.

- **Park factors & weather effects** (`context.py`): first published
  kenttäkertoimet for the sport; per-stadium run environment (shrunken,
  100 = neutral) and kunnari rate by wind bucket. The demo league bakes known
  park/wind effects and the tests recover them. Upgrade path: team-based
  home/road PF once real multi-season data exists.
- **Similarity scores** (`similarity.py`): B-Ref-style comps — nearest
  neighbor over z-scored rates + age, 1000 = identical, own seasons excluded.
- **Standings + playoff odds** (`simulate.py`): run-diff strength (shrunken)
  → Normal margin model → Monte Carlo over the remaining schedule. Plug in
  projection-aggregated rosters later. Real Superpesis points rules (2–1 supervuoro
  splits) pending real per-jakso data.
- **Pesis → baseball translation** (`translate.py`, `/player/<id>/baseball`):
  rank-preserving quantile map from Superpesis percentiles onto MLB
  qualified-hitter distributions (KL%→AVG, kunnarit→HR, lyödyt→RBI,
  tuodut→R, palot→K%), TEHO+↔wRC+ carried 1:1, 162-game paces, and an
  English pesäpallo primer. Deliberately in English — it's the shareable
  artifact for baseball audiences. MLB reference distributions are era
  approximations; refresh them against FanGraphs occasionally.

### UI requirements for the design pass

- **FI/EN toggle: SHIPPED** (`web/i18n.py` string table + `t()` helper,
  `?lang=` param persisted in a cookie, Finnish default — owner call: "only
  Finns will care about this site", EN one click away). Remaining gaps:
  glossary formula *notes* and the empty-DB page body are Finnish-only, and
  the About page is deliberately English-only (owner's voice). The
  baseball-translation page stays English-only by design.
- Keep the baseball translation page standalone-shareable (self-explanatory
  with the primer on-page, no context needed from the rest of the site).
- Layout reference: darko.app's current site — hero cards over the table
  (best record / finals favorite / lottery odds), Standard↔Detailed toggle,
  a distribution sidebar next to leaderboards, CSV download on every table.
  Our `/league` and leaderboard pages should grow toward that shape.
- **Schedule-length honesty**: Superpesis plays 28–33 regular-season games
  (33 in 2025) — one MLB month. Any cross-sport pace/counting display must
  carry the extrapolation factor; rate stats and percentiles are the primary
  framing.
- **The short season is a translation asset, not just a caveat** (owner
  observation, 2026-07): baseball fans already have trained intuition for
  month-sized samples (Player of the Month, April paces, hot streaks), so
  "a Superpesis season ≈ one MLB month" makes the whole translation land
  *better* than a same-length-season sport would. Lean into that framing on
  shareable pages.

### Shipped follow-up: first value stats (VYK/JYK)

The first WAR-style scaffold is now live from aggregate rows:

- **JYK** (*Juoksut Yli Korvaajan*) = runs above replacement. It estimates season-specific event weights from team run environments when possible, applies them to each player's aggregate events, and subtracts a replacement-level per-turn baseline.
- **VYK** (*Voitot Yli Korvaajan*) = wins above replacement, the WAR analog, using the season run-to-win scale.
- **JKA/RAA** = runs above average, kept for auditing the replacement step.

This is not the final RE24/PBP version. It is intentionally the bridge value stat: additive, playing-time sensitive, replacement-based, and calibrated to pesäpallo rather than MLB constants.

### Roadmap, in dependency order

1. **Real backfill** (needs key): confirm `ingest.FIELD_MAP` against
   `/public/stats-definitions`, ingest Superpesis 1990→, refit betas/priors.
   Wire `/public/match` payloads into `ingest.insert_match` (stadium,
   weather, attendance, per-jakso scores).
2. **Per-base kärkilyönti profile** — the API splits KL by target base;
   percentile fingerprint per base (Savant's "sprint speed vs arm strength"
   feel).
3. **Run expectancy** from PBP `runnersAtBases` → RE24-style
   *juoksuodotuslisä* (runs above expectation) for batters and runners; fixes
   the tuodut denominator problem.
4. **Context adjustments** (DARKO's): home/away, opponent strength, weather —
   all covariates already in the stat rows.
5. **JPM ("juoksuplusmiinus")** — LEBRON-style: box prior + lineup on/off from
   PBP.
6. **Win probability** model per jakso/supervuoro — pesäpallo's period
   structure (2 jaksot + supervuoro + kotiutuslyöntikilpailu) makes for a
   genuinely novel WP curve shape no other sport has.

## Site design notes

Server-rendered Flask, no JS chart framework. Visual language follows the
dataviz reference palette (validated light+dark tokens in `base.html`):
percentile bars use a diverging blue↔red ramp with a neutral midpoint, value
badges carry the number so meaning never rides on color alone; negative stats
(palot, haavat) are percentile-flipped so blue always means good. Sparklines
are 2px inline SVG with a surface-ringed end dot. Tables use tabular figures.

## Open questions

- Women's and men's Superpesis: separate leaderboards by series (current
  behavior once ingested per-series) — never blended percentiles.
- Superpesis vs lower divisions: TEHO+ is league-indexed so numbers don't
  cross divisions; a division-strength model (needed for transfers) is far
  future.
- API etiquette: cache-forever for finished seasons (done), throttle 0.5 s
  (done), and ask tulospalvelu@pesis.fi what rate they're comfortable with
  for the 1990→ backfill.
