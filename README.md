# Kärki — pesäpallo analytics

An analytics engine and site for Finnish baseball (pesäpallo), built on data
from the official results service [pesistulokset.fi](https://www.pesistulokset.fi/).
There is no sabermetrics/analytics site anywhere for pesäpallo — this project
is an attempt to be the first, borrowing what works from the basketball and
baseball analytics canon:

- **[DARKO](https://www.darko.app/)** → **TAHKO**, a daily-updating Bayesian
  projection of every player's true talent per stat (exponential decay over
  the full game log + regression to league mean; named for Lauri "Tahko"
  Pihkala, the inventor of pesäpallo).
- **[Baseball Savant](https://baseballsavant.mlb.com/)** → player pages with
  percentile sliders across the skill profile.
- **FanGraphs / Baseball-Reference** → honest rate stats with real
  denominators, league-indexed **TEHO+** (100 = league average), sortable
  leaderboards, season-by-season career tables.

## Quickstart (no API key needed)

```bash
pip install -r requirements.txt
python -m pesis demo          # build a seeded synthetic league (data/pesis.db)
python -m pesis leaderboard   # CLI leaderboard
python -m pesis project       # TAHKO projections for everyone
python -m pesis runserver     # web UI at http://localhost:5000
python -m pytest -q           # test suite
```

## Real data

pesistulokset.fi is an SPA fed by a documented JSON API
(`https://api.pesistulokset.fi/api/v1`, docs at
[ttk.pesistulokset.fi/api-docs](https://ttk.pesistulokset.fi/api-docs)).
Keys are free: email **tulospalvelu@pesis.fi**. Per-player per-match stat rows
(~82 fields) go back to **1990**; play-by-play with runner base states exists
for recent seasons. Then:

```bash
export PESISTULOKSET_API_KEY=...
python -m pesis ingest --year 2026 --series-id <id> --series-name "Superpesis (miehet)"
```

Before a full backfill, confirm `ingest.FIELD_MAP` against
`/public/stats-definitions` — see `docs/design.md`.

## Layout

| Path | What |
| --- | --- |
| `pesis/api.py` | pesistulokset.fi API client (cached, throttled) |
| `pesis/db.py` / `ingest.py` | SQLite store + payload normalization |
| `pesis/demo.py` | seeded synthetic league (also the test harness) |
| `pesis/metrics.py` | rate stats, league baselines, TEHO+, percentiles |
| `pesis/tahko.py` | TAHKO projections: decay + empirical-Bayes + aging |
| `pesis/web/` | Flask UI: leaderboards, player pages, projections |
| `docs/design.md` | the full design doc: data source, metrics, model, roadmap |
