# AAR: Mallo-native analytics pass — making the site more than a pesistulokset mirror

*2026-07-02. Follow-up to the first Mallo build. Goal: stop the leaderboard
from feeling like a redundant copy of pesistulokset.fi and make the new metrics
explain themselves in Finnish and English.*

## Why this pass happened

The critique was correct: a pesäpallo analytics site cannot win by repeating
the same K / L / T / tehot rows that fans can already get from the official
results service. Pesistulokset is the source of record for official box-score
counts; Mallo should be the interpretation layer built on top of those rows.

This pass therefore did **not** try to replace pesistulokset. It used the
preserved per-player, per-match rows in `player_games.raw` and the normalized
attempt/success columns to create metrics that answer different questions:

- Who advances runners efficiently, regardless of whether the event becomes a
  headline K/L/T counting stat?
- Who creates value as a runner rather than as the batter?
- Who avoids giving away palot?
- Who is specifically good at the highest-leverage lead-runner advancement:
  bringing the kärki runner home?
- Who profiles as a table-setter / rally starter even when traditional tehot do
  not put them at the top of the page?

## What changed

### 1. Season lines now retain target-base KL splits

`season_lines()` now aggregates the raw JSON rows with `json_group_array(pg.raw)`
so a player season can use fields that are not part of the old normalized table.
The helper `_add_raw_base_splits()` reads the upstream base-split keys when they
are present:

- `batpe_succeeded_0` / `batpe_tries_0`: lead runner advanced to 1st
- `batpe_succeeded_1` / `batpe_tries_1`: lead runner advanced to 2nd
- `batpe_succeeded_2` / `batpe_tries_2`: lead runner advanced to 3rd
- `batpe_succeeded_3` / `batpe_tries_3`: lead runner advanced home

The fourth split became the `money_kl` family because taking the lead runner
home is the most directly run-converting version of a kärkilyönti attempt.

### 2. Added Mallo-only league-indexed metrics

The new metrics are calculated in `_add_analytics_indices()` and attached to
every season line. All plus metrics use the same convention:

> **100 = league average, above 100 = better than league average.**

That makes the numbers readable across seasons and leagues without pretending
that a raw count from one environment is directly comparable to another.

### 3. Leaderboards now default toward analytics, not copied columns

The leaderboard stat list now starts with the Mallo-native metrics:

1. `spark_index`
2. `adv_plus`
3. `runner_plus`
4. `out_avoid_plus`
5. `money_kl_plus`

The traditional stats still exist because they provide context, but the first
thing a user sees is no longer just a re-rendered official stat table.

### 4. CSV exports include the new fields

The downloadable leaderboard CSV now includes the new analytics, so external
analysis can use the same derived columns that the UI exposes.

### 5. The UI explains the metrics in Finnish and English

The leaderboard gained an explanatory line saying that the Mallo metrics are
not copied box-score columns. The glossary gained a dedicated
“Mallo analytics / Mallo-analytiikka” section with definitions in both
languages.

## Metric glossary

### ADV+ — advancement plus

**Formula**

```text
100 × ((kärkilyönnit + saatot) / (kärkilyönti attempts + saatto attempts))
    / league rate
```

**English:** ADV+ isolates a batter's runner-advancement efficiency. It blends
lead-runner advancement (`KL`) and escort advancement (`saatot`) into one
attempt-weighted rate, then indexes it to the league.

**Suomi:** ADV+ eristää lyöjän etenemisarvon. Se yhdistää kärkilyönnit ja
saatot yrityspainotetuksi onnistumisprosentiksi ja suhteuttaa tuloksen sarjan
tasoon.

**Why it is different from pesistulokset:** pesistulokset can show the raw KL
and saatto columns. ADV+ asks a new question: “how much better than the league
is this player at moving runners when given advancement attempts?”

### RUN+ — runner advancement plus

**Formula**

```text
100 × etenemis-% / league etenemis-%
```

**English:** RUN+ measures the player as a runner. It uses successful
advancements as the runner divided by runner-advancement attempts, then indexes
that rate to the league.

**Suomi:** RUN+ mittaa pelaajaa etenijänä. Se jakaa onnistuneet etenemiset
etenemisyrityksillä ja suhteuttaa prosentin sarjatasoon.

**Why it matters:** traditional tehot includes `tuodut`, but `tuodut` only
captures the end of a run. RUN+ looks at the broader runner-advancement skill
that helps innings develop before the final run is scored.

### OUT+ — out-avoidance plus

**Formula**

```text
100 × (1 − palot / lyöntivuorot) / league out-avoidance rate
```

**English:** OUT+ rewards players who avoid palot per turn at bat. It is flipped
so that higher is always better, matching the rest of the plus-stat convention.

**Suomi:** OUT+ palkitsee palojen välttämisestä lyöntivuoroa kohti. Mittari on
käännetty niin, että suurempi luku on aina parempi.

**Why it matters:** outs are a cost. A player can look useful in counting stats
while also burning too many turns or runner chances. OUT+ gives that cost its
own visible column.

### HOME-AH+ / KOTI-KL+ — lead-runner-home advance-hit plus

**Formula**

```text
100 × (KL successes to home / KL attempts to home) / league rate
```

**English:** HOME-AH+ focuses on kärkilyönti attempts where the target base is
home plate. It is a “money” split because these attempts are the ones most
closely tied to converting a lead runner into an actual run.

**Suomi:** KOTI-KL+ keskittyy kärkilyöntiyrityksiin, joissa kohdepesä on
kotipesä. Se on “rahatilanne”-jako, koska nämä yritykset muuttavat kärjen
suoraan juoksuksi.

**Data note:** this depends on the preserved raw base-split fields. If a league
or historical row lacks the `batpe_*_3` fields, the metric is left empty rather
than guessed.

### SPARK — table-setter composite

**Formula**

```text
0.50 × ADV+ + 0.30 × RUN+ + 0.20 × OUT+
```

**English:** SPARK is a composite for players who start and extend rallies. It
weights batter advancement most heavily, then runner advancement, then
out-avoidance. It intentionally does not include K/L/T, so it can surface
players whose value is hidden by traditional production totals.

**Suomi:** SPARK on kärjenrakentajan kokonaisindeksi. Se painottaa eniten lyöjän
etenemisarvoa, sitten etenijäarvoa ja lopuksi palojen välttämistä. Se ei käytä
K/L/T-lukuja, jotta perinteisten tehojen alle piiloutuvat pelaajat voivat nousta
näkyviin.

**Interpretation:**

- 100: roughly league-average rally-building profile
- 115: meaningfully above-average advancement / out-avoidance profile
- 130+: excellent table-setter profile
- Below 90: likely not adding much in the non-K/L/T advancement game

## What these metrics are *not*

They are not a finished pesäpallo WAR. They do not yet know the full base/out
state, inning context, opponent quality, or win probability. They are a first
layer of derived analytics from data that already exists in the database.

They also are not meant to delete traditional stats. K, L, T, tehot, KL%, and
TEHO+ still matter. The point is product hierarchy: Mallo should lead with the
new interpretation, while the official-style counts remain supporting context.

## Why this is only the first analytics layer

The next large step should use play-by-play and runner base states, because
that unlocks genuinely baseball-like pesäpallo logic:

1. **Run expectancy / juoksuodotus** from base/out states.
2. **RE24-style batting and running value**: how much each event changed
   expected runs.
3. **Win probability added** for jakso, supervuoro, and kotiutuslyöntikilpailu
   states.
4. **Opponent and park/weather adjustments** on the new value metrics.
5. **Lineup and role context**, because pesäpallo batting order roles are more
   specialized than a generic box score suggests.

This pass is important because it changes the direction of the site: Mallo is
now presenting derived baseball/pesäpallo analytics first, not simply rendering
the source-of-record data in a new table.

## Validation performed in the implementation pass

- Full Python test suite with repo root on `PYTHONPATH`: `30 passed`.
- Compile sanity for the touched Python modules.
- Flask smoke test for the new `spark_index` leaderboard and Finnish glossary.
- Regression test asserting the new Mallo indices respond to advancement and
  out-avoidance and are not just aliases for TEHO+.

## Remaining concerns

- The glossary section currently includes both Finnish and English in the same
  row notes for the formulas. That satisfies the immediate bilingual
  explanation requirement, but a cleaner future pass should move those row notes
  fully into `web/i18n.py` keys.
- `SPARK` weights are intentionally simple and transparent. They should be
  revisited after run-expectancy data exists.
- HOME-AH+/KOTI-KL+ is only as complete as the raw base-split fields. Missing
  splits should remain blank until confirmed, not backfilled with assumptions.

## Follow-up: baseball equivalence correction

The baseball translation had a flawed product assumption: it centered a
162-game MLB pace even though a Superpesis regular season is roughly 28–33
games and the playoffs are short series (three best-of-five rounds for the
championship path; the third-place path ends with a best-of-three bronze
series). The corrected framing is:

- lead with a **33-game MLB-month equivalent** for HR/RBI/R counting context;
- keep 162-game pace only as a clearly labeled secondary extrapolation;
- keep percentile-to-MLB-scale rate translations as the main bridge because
  percentiles are schedule-length independent;
- provide a `/baseball` comparison table so translated stats can be browsed
  across a whole season, not only one player page at a time.

## Follow-up: official 1% / 2% / 3% / K% advancement splits

Owner context clarified that the official `1 %`, `2 %`, `3 %`, and `K %`
columns are not batter destinations. They are runner-advancement movements
created by the hitter:

- **1 %**: success rate advancing the lead runner from first to second;
- **2 %**: success rate from second to third;
- **3 %**: success rate from third to home;
- **K %**: scoring/home advancement situations.

This matters because pesäpallo does not have the one-plate-appearance,
one-result shape of baseball. During one lyöntivuoro a batter can earn multiple
kärkilyönnit — up to three advancement hits in one batting turn — and the three
designated hitters (`jokerit`) can pinch hit for anyone in the order at least
once per time through. A strong hitter can therefore record seven or eight
batting turns in a match across the two jaksot, while still accumulating
multiple advancement events inside those turns.

The implementation keeps the existing raw-field plumbing but labels the metrics
with the official split language: `1%`, `2%`, `3%`, `K%`, plus league-indexed
`1%+`, `2%+`, `3%+`, and `K%+`. These are still hitter advancement splits, not
full run-value stats. The next step is to combine them with base/out state and
run expectancy once play-by-play is available.

## Follow-up: owner-provided baseball equivalence labels

Owner context clarified the baseball-facing labels:

- **Kärkilyönnit = hits.** The translation now includes an H/600 PA analog.
- **Kärkilyöntiprosentti = batting average.** AVG remains the percentile map
  for KL%.
- **Lyödyt line = HR+RBI.** Finnish lines such as `5+44` should read as home
  runs plus batted-in runs, so the translation now uses HR+RBI rather than RBI
  alone for that production bucket.
- **Tuodut = runs scored.**
- **Tehot = HR+RBI+runs scored.** Month-normalized counting context now carries
  that production total.
- **Hutunkeiton voitot = opening faceoffs won.** This is a useful translation,
  but the current normalized schema does not ingest huttu/choice-win fields yet;
  add it only after confirming which upstream match or raw field stores it.


## Follow-up: first WAR-style value scaffold

The site now has a first additive value layer to answer the owner's WAR question.
Rate/index stats such as TEHO+, ADV+, OUT+, RUN+, and SPARK describe efficiency
per opportunity; they do not answer how much value a player accumulated. The new
value scaffold adds:

- **JYK** (*Juoksut Yli Korvaajan*) — runs above replacement. It multiplies each
  player's existing aggregate events by empirical season run weights, then
  subtracts a replacement-level per-turn baseline.
- **VYK** (*Voitot Yli Korvaajan*) — the WAR analog. It converts JYK to wins
  using the season's run environment.
- **JKA / RAA** — runs above average, useful for auditing before the replacement
  baseline is applied.

This is intentionally a bridge model. The proper future version should use the
roadmapped play-by-play run-expectancy model from `runnersAtBases`/RE24-style
state changes. Until that endpoint is ingested, the aggregate model is still a
real value stat because it is additive, playing-time sensitive, replacement-based,
and calibrated to pesäpallo's own run environment rather than MLB constants.


## Follow-up: first lukkari run-prevention layer

The sport under-publishes lukkari-specific statistics, and the current normalized
rows still do not expose pitch-by-pitch outcomes. The first implementation is
therefore honest about its limitation: it identifies games where the preserved
raw row marks a player as `L` / `lukkari`, assigns that lukkari the team runs
allowed in those games, and publishes:

- **LRA** — lukkari runs allowed per game, an ERA-style rate.
- **LRA−** — league-indexed LRA where 100 is average and lower is better.
- **RP** — runs prevented compared with an average lukkari over the same number
  of lukkari games.

This is not a final lukkari model. It is a surfacing layer for the data already
preserved in `player_games.raw`, meant to be replaced/enriched by pitch and
base-state event data when play-by-play is imported.
