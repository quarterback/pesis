# Kärki design doc — a sabermetrics layer for pesäpallo

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

| Source | Borrowed idea | Kärki incarnation |
| --- | --- | --- |
| DARKO | daily-updating Bayesian projections; per-stat exponential decay with *fitted* decay constants; no arbitrary "last N games" windows; aging curves per stat; shrinking to a prior with confidence-dependent learning rate | **TAHKO** (`pesis/tahko.py`) |
| Baseball Savant | percentile sliders as the player's skill fingerprint; diverging red↔blue = bad↔good; spray/hit charts | player page percentile bars (shipped); hit-map page (roadmap — API has the endpoint) |
| FanGraphs | league-indexed rate stats (wRC+ → **TEHO+**), qualified leaderboards, career tables | `pesis/metrics.py` + web leaderboards |
| Baseball-Reference | season-by-season career lines, era adjustment | player page "Kaudet" table |
| LEBRON / DPM | box-score prior blended with on/off impact | roadmap: lineup-level plus-minus from PBP once ingested |
| Tango et al. | delta-method aging curves, attempt-weighted | `tahko.aging_curve` |

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
PBP (see roadmap). `tahko._tuotu_proxy` is the placeholder and says so.

## TAHKO — the projection model

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
from *known latent talent*, and `tests/test_tahko.py` asserts the projections
recover it (truth–projection correlation), that small samples shrink harder,
and that recent evidence outweighs old.

### Shipped since v0 (Tier A — per-game rows + match context)

- **Park factors & weather effects** (`context.py`): first published
  kenttäkertoimet for the sport; per-stadium run environment (shrunken,
  100 = neutral) and kunnari rate by wind bucket. The demo league bakes known
  park/wind effects and the tests recover them. Upgrade path: team-based
  home/road PF once real multi-season data exists.
- **Similarity scores** (`similarity.py`): B-Ref-style comps — nearest
  neighbor over z-scored rates + age, 1000 = identical, own seasons excluded.
- **Standings + playoff odds** (`simulate.py`): run-diff strength (shrunken)
  → Normal margin model → Monte Carlo over the remaining schedule. Plug in
  TAHKO-aggregated rosters later. Real Superpesis points rules (2–1 supervuoro
  splits) pending real per-jakso data.
- **Pesis → baseball translation** (`translate.py`, `/player/<id>/baseball`):
  rank-preserving quantile map from Superpesis percentiles onto MLB
  qualified-hitter distributions (KL%→AVG, kunnarit→HR, lyödyt→RBI,
  tuodut→R, palot→K%), TEHO+↔wRC+ carried 1:1, 162-game paces, and an
  English pesäpallo primer. Deliberately in English — it's the shareable
  artifact for baseball audiences. MLB reference distributions are era
  approximations; refresh them against FanGraphs occasionally.

### UI requirements for the design pass

- **Site-wide FI/EN language toggle is a hard requirement** — the audience
  that makes this project interesting (baseball analytics people) doesn't
  read Finnish. The baseball-translation and About pages are already English;
  everything else needs string tables, not per-page forks.
- Keep the baseball translation page standalone-shareable (self-explanatory
  with the primer on-page, no context needed from the rest of the site).
- Layout reference: darko.app's current site — hero cards over the table
  (best record / finals favorite / lottery odds), Standard↔Detailed toggle,
  a distribution sidebar next to leaderboards, CSV download on every table.
  Our `/league` and leaderboard pages should grow toward that shape.
- **Schedule-length honesty**: Superpesis plays ~30 regular-season games
  (one MLB month). Any cross-sport pace/counting display must carry the
  extrapolation factor; rate stats and percentiles are the primary framing.

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
