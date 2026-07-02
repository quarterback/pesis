# Mallo — pesäpallo analytics

I'd long wondered what a pesäpallo site would look like. Working on a different project, I explored the viability of a tool like this 
and then enlisted an agent to built it. An analytics engine and site for Finnish baseball (pesäpallo), built on data
from the official results stite [pesistulokset.fi](https://www.pesistulokset.fi/).
There is no sabermetrics/analytics site anywhere for pesäpallo — this project
is an attempt to be the first, borrowing what works from the basketball and
baseball analytics canon and my own long-running sims both from text-sim games and real-life experiments from baseball to college football rankings and others.

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

  My other projects are on [ronbronson.dev](ronbronson.dev)

## Quickstart — real data, no API key needed

```bash
pip install -r requirements.txt
python -m pesis ingest-v1     # REAL current-season Superpesis (men + women),
                              # keylessly via v1.pesistulokset.fi
python -m pesis ingest-v1 --from-year 1991 --to-year 2026   # full history
                              # (granular per-game data exists from 1991)
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

Push-to-deploy, no CLI needed:

1. **Once, in the Fly web dashboard**: app → Volumes → create `pesis_data`
   (region `cdg`, 3 GB — the full 1991→ history is ~1.1 GB and growing).
2. **Push to GitHub** — Fly builds and deploys.

Everything else is automatic. The image bakes a current-season snapshot at
build (demo fallback if offline); on first boot with an empty volume the
site serves that immediately, **backfills 1991→ by itself in the background**
(~10 min; WAL mode keeps it serving) and marks the volume done so it never
re-runs. An existing volume survives every deploy. A loop **re-ingests all
tracked leagues daily** (`REFRESH_INTERVAL` seconds, default 86400); web
workers notice the DB mtime change and drop their caches. No redeploys
needed to stay current.

Any Docker host (Railway, Render, a VPS) works the same way:
`docker build -t mallo . && docker run -p 8080:8080 -v mallo-data:/data -e PESIS_DB_PATH=/data/pesis.db mallo`.
