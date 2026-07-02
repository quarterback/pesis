# AAR / future-developer handoff: Mallo analytics, value, lukkari, and baseball translation additions

*Date: 2026-07-02. Audience: future developers/agents taking over the Mallo codebase.*

## Executive summary

This pass changed Mallo from a mostly conventional pesäpallo stat viewer into a first real analytics layer. The guiding product rule was: **do not merely reprint pesistulokset.fi tables**. The official results service is the source of truth for box-score rows; Mallo should explain, index, translate, and derive new information from those rows.

The additions fall into four major groups:

1. **Mallo-native rate/index analytics** — `ADV+`, `RUN+`, `OUT+`, `SPARK`, `HOME-AH+` / `KOTI-KL+`, plus official `1% / 2% / 3% / K%` runner-advancement splits.
2. **Additive value stats** — `JYK`, `VYK`, and `RAA/JKA`, a first WAR-style bridge before play-by-play run expectancy exists.
3. **Lukkari run-prevention stats** — `LRA`, `LRA−`, and `RP`, an ERA-style lukkari surface from raw position markers and team runs allowed.
4. **Baseball translation UI** — English-facing player and leaderboard pages that map pesäpallo production to MLB-style equivalents while normalizing counts to a 33-game MLB-month window instead of pretending a Superpesis season equals 162 MLB games.

## Why the work was needed

The owner raised a core product concern: if Mallo only repeats rows and metrics already visible on pesistulokset.fi, it has no reason to exist. The site needed to answer questions the official tables do not answer:

- Who creates advancement beyond raw `K/L/T` totals?
- Who avoids outs and creates table-setting value?
- Who accumulated the most total value, not just the best rate?
- Can baseball fans understand a pesäpallo line without false 162-game assumptions?
- Can we surface anything useful about lukkaris despite sparse lukkari-specific public stats?

This pass intentionally uses the data already preserved in `player_games.raw` and normalized aggregate rows, while documenting where the future version should switch to play-by-play (`/online/{match}/events`) and run-expectancy modeling.

## Key code locations

| Area | Main files |
| --- | --- |
| Season aggregation and analytics | `pesis/metrics.py` |
| Baseball translation | `pesis/translate.py` |
| Web routes and CSV exports | `pesis/web/app.py` |
| Labels / FI-EN strings | `pesis/web/i18n.py` |
| Main leaderboard UI | `pesis/web/templates/leaderboard.html` |
| Player baseball page | `pesis/web/templates/baseball.html` |
| Baseball comparison table | `pesis/web/templates/baseball_leaderboard.html` |
| Lukkari leaderboard | `pesis/web/templates/lukkari.html` |
| Glossary | `pesis/web/templates/glossary.html` |
| Tests | `tests/test_metrics.py`, `tests/test_translate.py` |
| Design narrative | `docs/design.md`, `docs/aar-mallo-native-analytics.md` |

## Data model principle used by the additions

The normalized `player_games` table does not need to know every future metric in advance. It stores core counting fields as columns and keeps the full upstream row in `raw`. This was critical for the new work:

- Official `1% / 2% / 3% / K%` split data comes from preserved raw `batpe_succeeded_N` / `batpe_tries_N` keys.
- Lukkari detection comes from raw position-ish fields such as `up`, `position`, `defensive_position`, `fielding_position`, or longer `lukkari` labels.
- Future fields should generally be extracted from `raw` first, tested, and only promoted to normalized DB columns once semantics are confirmed against the official API definitions.

## 1. Mallo-native rate and index analytics

### What changed

`pesis/metrics.py` now does more than compute `TEHO+`. `season_lines()` aggregates raw rows and then attaches:

- Raw official advancement split rates.
- League-indexed advancement / running / out-avoidance metrics.
- A composite table-setter index.
- Value stats and park-adjusted TEHO+.

### Official advancement splits

The owner clarified a crucial semantics issue: `1%`, `2%`, `3%`, and `K%` are **runner-movement splits**, not batter target-base destinations.

| Split | Meaning |
| --- | --- |
| `1%` | Batter succeeds advancing a runner from first to second. |
| `2%` | Batter succeeds advancing a runner from second to third. |
| `3%` | Batter succeeds advancing a runner from third to home. |
| `K%` | Scoring/home advancement split shown by the official service. |

This distinction matters because a pesäpallo batting turn can create multiple advancement hits. Do not model these as baseball-style one-plate-appearance outcomes.

### New index metrics

| Metric | Meaning | Implementation note |
| --- | --- | --- |
| `ADV+` | Batter advancement efficiency indexed to league average. | Uses `karkilyonnit + saatot` over corresponding attempts. |
| `RUN+` | Runner advancement efficiency indexed to league average. | Uses `eten_pct`. |
| `OUT+` | Out avoidance indexed to league average. | Uses `1 - palo_rate`; higher is better. |
| `HOME-AH+` / `KOTI-KL+` | Scoring/home advancement split indexed to league average. | Based on the official `K%` raw split. |
| `SPARK` | Composite table-setter profile. | Weighted blend: `0.50*ADV+ + 0.30*RUN+ + 0.20*OUT+`. |

### Why these are not pesistulokset clones

The official service can show raw counts and percentages. These metrics transform that data into league-relative interpretation:

- 100 = league average.
- Above 100 = better for positive indices.
- They can rank players differently from `TEHO+` because they emphasize advancement, running, and out avoidance rather than just `K+L+T` production.

## 2. Additive value stats: JYK, VYK, RAA/JKA

### Why value stats were added

`TEHO+`, `ADV+`, `SPARK`, and similar metrics are rate/index stats. They answer: **how efficient was this player per opportunity?**

They do not answer: **how much total value did this player add?**

A WAR-style stat must accumulate with playing time. A great rate in few turns should not automatically outrank a very good player who carried far more workload.

### New value metrics

| Metric | Full name | Meaning |
| --- | --- | --- |
| `JYK` | `Juoksut Yli Korvaajan` | Runs above replacement. |
| `VYK` | `Voitot Yli Korvaajan` | Wins above replacement; the WAR analog. |
| `RAA` / `JKA` | Runs above average / `Juoksut Keskiarvon Yli` | Audit layer before replacement level is applied. |

### Current implementation

The current model is a **bridge model from aggregate rows**, not the final RE24/PBP model.

Current flow:

1. Estimate empirical event weights from team event totals when enough teams exist.
2. Fall back to conservative pesäpallo-shaped weights if the season is too small or singular.
3. Compute each player’s event-weighted run value.
4. Compare that run value to league-average per-turn value for `RAA/JKA`.
5. Compare it to a replacement-level per-turn baseline for `JYK`.
6. Convert `JYK` to `VYK` using the season run-to-win scale.

### Important limitation

This should eventually be replaced or heavily enriched by play-by-play run expectancy:

- Ingest `/online/{match}/events`.
- Use `runnersAtBases` to build base/out/run-state expectancy.
- Compute RE24-style `juoksuodotuslisä` for batter and runner actions.
- Add win probability once period/supervuoro/kotiutus structures are modeled.

Until then, this value scaffold is still useful because it is additive, workload-sensitive, replacement-based, and calibrated to pesäpallo data instead of MLB constants.

## 3. Lukkari stats

### Why this was added

The owner noted that lukkari stats are underdeveloped in the sport. Unlike baseball, pesäpallo typically has one primary lukkari for much of a season, and the current public aggregate rows do not expose pitch-by-pitch outcomes. Still, Mallo can surface a useful first layer.

### New lukkari metrics

| Metric | Meaning | Direction |
| --- | --- | --- |
| `LRA` | Lukkari runs allowed per lukkari game. | Lower is better. |
| `LRA−` | League-indexed LRA, like an ERA-minus style stat. | 100 = average; lower is better. |
| `RP` | Runs prevented versus an average lukkari over the same workload. | Higher is better. |

### Current implementation

`metrics.lukkari_lines()`:

1. Reads `player_games.raw` for position markers.
2. Treats raw values like `L` or `lukkari` as lukkari appearances.
3. Assigns the player the opponent’s runs in that match.
4. Aggregates lukkari games and runs allowed.
5. Computes `LRA`, `LRA−`, and `RP`.

### Important limitation

This is not a full lukkari WAR and not a pitch-level model. It is team run prevention while the player is marked as the lukkari. It will be affected by defense, opponent strength, park, weather, and team quality.

Future upgrades:

- Confirm official position field names from API definitions.
- Add opponent and park adjustment.
- Add pitch/play outcome measures from play-by-play if available.
- Separate passed-ball/wild-throw, pickoff, tempo, and running-control effects if the event feed supports them.

## 4. Baseball translation UI

### Why it was changed

The original baseball translation assumed too much from a 162-game MLB season. That was flawed because a Superpesis regular season is roughly 28–33 games, and the playoff structure is short.

The corrected framing is:

- A Superpesis regular season is more like **one MLB month** than one MLB season.
- Counting stats should lead with a 33-game MLB-month equivalent.
- 162-game pace can exist only as secondary context, not the headline.
- Rate and percentile translations are safer than direct count translations.

### Owner-provided baseball equivalences

| Pesäpallo item | Baseball-facing equivalent |
| --- | --- |
| `Kärkilyönnit` | Hits |
| `Kärkilyöntiprosentti` | Batting average |
| `Lyödyt` | HR + RBI |
| `Tuodut` | Runs scored |
| `Tehotilasto` | HR + RBI + runs scored |
| `Hutunkeiton voitot` | Opening faceoffs won, if/when upstream field is identified |

### New UX

- Player-level baseball translation page remains English-facing and shareable.
- `/baseball` comparison table lets users browse translated stats across the league instead of only seeing them on individual player pages.
- Count columns should be understood as normalized comparisons, not literal predictions.

## 5. Web and CSV surfaces

### Main leaderboard

The leaderboard now exposes the Mallo-native metrics in the stat selector. `VYK` became the default because it answers the highest-level value question: who added the most total value?

### CSV export

The CSV export includes the new analytics fields so users can sort/analyze outside the web UI.

### Glossary

The glossary is important because these are not obvious official terms. Every non-trivial metric should have:

- A short formula.
- A Finnish explanation.
- An English explanation.
- A directionality note where needed (`lower is better`, `100 = average`, etc.).

## 6. Tests added or updated

Metric tests cover:

- Mallo indices differ from `TEHO+` and rank advancement/out-avoidance correctly.
- Official raw `1% / 2% / 3% / K%` splits parse from `batpe_*` fields.
- `JYK`, `VYK`, and `RAA` accumulate separately from `TEHO+`.
- Lukkari raw position detection works for both short `L` and long `lukkari` markers.
- Lukkari runs allowed, `LRA−`, and `RP` order correctly.

Translation tests cover:

- MLB-month normalization.
- Owner-provided baseball-equivalence labels.
- `/baseball` table output shape and sortable translated metrics.

## 7. Known risks and follow-ups

### Risk: raw field semantics

Some fields were inferred from observed v1 payloads and owner-provided examples. Before a full historical backfill, confirm against `/public/stats-definitions` using the official API key.

### Risk: value weights are bridge weights

The current `JYK/VYK` weights are useful but not final. They should be replaced with play-by-play run expectancy once `runnersAtBases` events are ingested.

### Risk: lukkari stats are team-context heavy

`LRA` and `RP` are affected by defense, park, weather, and opponent. The page and docs should keep calling them a first run-prevention layer, not definitive lukkari talent.

### Risk: static export

If a future static export fails with `Unexpected token '<'`, that usually means an expected JS/JSON asset was served HTML. Debug asset paths and exported query variants before blaming the metric code. See `docs/handoff-mallo-native-analytics-import.md` if present in the branch.

## 8. Recommended next development order

1. **Harden static export** if this branch is intended for static hosting.
2. **Confirm official raw field definitions** for base splits, positions, and huttu/choice wins.
3. **Add opponent/park adjustment to lukkari stats** using existing match context.
4. **Ingest play-by-play events** from `/online/{match}/events`.
5. **Build run expectancy** from `runnersAtBases`.
6. **Replace bridge JYK/VYK weights with RE24-derived values**.
7. **Add win probability** for jakso/supervuoro/kotiutus structures.
8. **Split value into batting, running, lukkari/defense components** once event data supports it.

## 9. Quick verification commands

Run these from the repo root after importing this work:

```bash
PYTHONPATH=. pytest tests/test_metrics.py -q
PYTHONPATH=. pytest tests/test_translate.py -q
PYTHONPATH=. pytest -q
PYTHONPATH=. python -m py_compile pesis/metrics.py pesis/translate.py pesis/web/app.py pesis/web/i18n.py
```

Suggested Flask smoke test:

```bash
PYTHONPATH=. python - <<'PY'
from pesis.web.app import create_app

app = create_app()
routes = [
    '/leaderboard?stat=vyk&lang=en',
    '/leaderboard?stat=spark_index&lang=en',
    '/leaderboard?stat=adv1_pct&lang=fi',
    '/baseball?sort=wrc_plus&lang=en',
    '/lukkari?lang=en',
    '/glossary?lang=fi',
]
with app.test_client() as c:
    for route in routes:
        r = c.get(route)
        print(route, r.status_code, r.headers.get('Content-Type'))
        assert r.status_code in (200, 404)
PY
```

A 404 for player-specific routes can be acceptable in an empty DB; season-level routes should return 200 when the DB has data.
