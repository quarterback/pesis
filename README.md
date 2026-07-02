# Mallo — pesäpallo analytics

An analytics engine and site for Finnish baseball (pesäpallo), built on data
from the official results service [pesistulokset.fi](https://www.pesistulokset.fi/).
There is no sabermetrics/analytics site anywhere for pesäpallo — this project
is an attempt to be the first, borrowing what works from the basketball and
baseball analytics canon:

- **[DARKO](https://www.darko.app/)** → **PARE** (*Painotettu ja Regressoitu
  Ennuste*): daily-updating Bayesian projections of every player's true
  talent per stat (exponential decay over the full game log + regression to
  league mean). Naming convention: descriptive initialisms in the
  WAR/OPS+/xBA tradition — PARE, eTEHO+/eKL% (*ennustettu*), kTEHO+
  (*kenttäkorjattu*) — never player/club names (Tahko is a Superpesis club).
- **[Baseball Savant](https://baseballsavant.mlb.com/)** → player pages with
  percentile sliders across the skill profile.
- **FanGraphs / Baseball-Reference** → honest rate stats with real
  denominators, league-indexed **TEHO+** (100 = league average), sortable
  leaderboards, season-by-season career tables.

## Quickstart — real data, no API key needed

```bash
pip install -r requirements.txt
python -m pesis ingest-v1     # REAL current-season Superpesis (men + women),
                              # keylessly via v1.pesistulokset.fi
python -m pesis runserver     # web UI at http://localhost:5000
```

Or fully offline:

```bash
python -m pesis demo          # seeded synthetic league (also the test harness)
python -m pesis leaderboard   # CLI leaderboard
python -m pesis project       # player projections for everyone
python -m pesis standings --as-of 2026-06-15   # standings + playoff odds
python -m pesis parks         # park factors (kenttäkertoimet) + weather effects
python -m pesis comps --player 1               # similarity scores (B-Ref style)
python -m pesis mlb --player 1                 # pesis → baseball translation
python -m pytest -q           # test suite
```

## Deploying

This is a long-running Flask server with a SQLite file on disk — it does
**not** fit static/serverless hosts like Netlify or Vercel (no persistent
process, read-only filesystem). Deploy it like the sibling projects, with the
included `Dockerfile` + `fly.toml`:

```bash
fly launch --copy-config   # first time; accept or rename the app
fly deploy
```

The image fetches the REAL current Superpesis season at build time (demo
fallback if offline) — re-deploying refreshes the data snapshot. Any Docker host (Railway, Render, a VPS) works the same
way: `docker build -t mallo . && docker run -p 8080:8080 mallo`.

## Data sources

Two paths to the same per-player per-match rows (~82 fields: weather,
attendance, kärkilyönnit by base, the lot):

1. **Keyless (`ingest-v1`)** — the legacy site v1.pesistulokset.fi serves the
   stats-tool data same-origin without an api key; one polite GET per
   series-season. This is what the Dockerfile bakes at build time.
2. **Official API key** — `https://api.pesistulokset.fi/api/v1` (docs at
   [ttk.pesistulokset.fi/api-docs](https://ttk.pesistulokset.fi/api-docs));
   free keys from **tulospalvelu@pesis.fi**. Unlocks historical backfill
   (1990→) and play-by-play. `export PESISTULOKSET_API_KEY=...` then
   `python -m pesis ingest --year ... --series-id ...`; confirm
   `ingest.FIELD_MAP` against `/public/stats-definitions` first.

## Layout

| Path | What |
| --- | --- |
| `pesis/api.py` | pesistulokset.fi API client (cached, throttled) |
| `pesis/db.py` / `ingest.py` | SQLite store + payload normalization |
| `pesis/v1import.py` | keyless real-data import via v1.pesistulokset.fi |
| `pesis/demo.py` | seeded synthetic league (also the test harness) |
| `pesis/metrics.py` | rate stats, league baselines, TEHO+, percentiles |
| `pesis/projection.py` | PARE projections: decay + empirical-Bayes + aging |
| `pesis/context.py` | park factors (kenttäkertoimet) + weather effects |
| `pesis/similarity.py` | B-Ref-style similarity scores / player comps |
| `pesis/simulate.py` | standings + Monte Carlo playoff odds |
| `pesis/translate.py` | pesis → baseball quantile translation (shareable EN pages) |
| `pesis/web/` | Flask UI: leaderboards, player pages, projections, league, about |
| `docs/design.md` | the full design doc: data source, metrics, model, roadmap |
