# Mallo (pesis) — agent guide

Advanced metrics for pesäpallo, published at **mallo.fi**. The public site is
a static SPA served from `site/`; the Python code in `pesis/` computes the
stats and `export.py` writes them to `site/data/` as JSON.

## Architecture

- **`pesis/`** — ingest (pesistulokset.fi v1 API → SQLite `data/pesis.db`,
  gitignored), `metrics.py` (season lines, Mallo indices, VYK/JYK value
  stats), `translate.py` (pesis → MLB translation), `projection.py` (PARE),
  `simulate.py`, plus a legacy Flask app in `pesis/web/` that is **not** what
  mallo.fi serves.
- **`export.py`** — reads the DB, writes `site/data/**` (players,
  leaderboards, lukkari, league, projections, teams, meta). Committed to git;
  ~44 MB.
- **`site/`** — the deployed artifact. Hash-routed vanilla-JS SPA:
  `js/app.js` (router, tables, pages), `js/primer.js` (Opas page),
  `js/charts.js` + d3, `css/mallo.css` (all design tokens in `:root` /
  `[data-theme]` vars), `sw.js` (PWA app-shell cache). UI language is
  Finnish; the primer is bilingual.
- **Deploy**: Vercel serves `site/` with no build step (`vercel.json`).
  Every merge to `main` deploys. The GitHub Action
  `.github/workflows/refresh-data.yml` re-ingests the current season daily
  (~05:17 UTC), re-runs `export.py`, and commits `site/data` — that commit
  is what refreshes the numbers on the site. Code changes to stat math show
  up in the data only after the next export.

## Rules that bite

- **Bump `CACHE` in `site/sw.js`** (mallo-v2 → v3 → …) whenever you change
  any shell file (`index.html`, `js/*`, `css/*`). Installed PWA clients keep
  serving the old shell until the name changes, and new JS files must be
  added to the `SHELL` list.
- **Stat display values are baked into `site/data/`.** Changing
  `metrics.py`/`translate.py` alone changes nothing visible until the daily
  refresh runs (or someone runs ingest + `export.py` and commits). The DB is
  1.8 GB and lives in the Actions cache; local rebuilds are expensive.
- **Do not merge stale Codex branches.** `codex/research-new-analytics-for-site`
  (PR #13/#25/#26) predates the static-site migration and the KL%→AVG linear
  fix; its content already lives on main in newer form.
- **The KL%→AVG translation is a linear recenter** (`mlb_value_for` in
  `pesis/translate.py`), shared by the Flask app and `export.py`. League KL%
  (~.533) maps to MLB AVG (~.250) with slope 1.

## Writing voice (owner requirement)

All user-facing copy — primer, popovers, subtitles, glossary notes — is
written like an mlb.com explainer: complete sentences, plain and direct,
neutral tone. The owner explicitly rejects AI-flavored writing: no clipped
punchy fragments ("The skill is placement."), no taglines, no cute asides,
no em-dash aphorisms, no bonus flourishes or extra color. When in doubt,
write the way a newspaper explainer would.

## Frontend conventions

- Pages are functions in `app.js` (`showLeaderboard`, `showPlayer`, …)
  wired in `route()`; nav lives in `renderNav()`.
- Sortable/paginated tables go through `makeTable(mount, cfg)`.
- Stat labels: `STAT_LABEL`; one-tap stat explainers: `STAT_INFO` +
  `infoBtn(key)` in `app.js` — every stat key present in `STAT_INFO` gets a
  ⓘ popover automatically in `makeTable` headers. Add both FI and EN lines
  for any new stat.
- The primer (`primer.js`) holds four hand-written variants (baseball/pesis
  × EN/FI); content edits must touch all four.
- Mobile: reference definition lists use `.plist`/`.prow` (stacks cleanly);
  the older 3-column `.gloss` tables are for the Kaava page. Check pages at
  ~390 px for horizontal overflow.

## Verifying frontend changes

```
node --check site/js/app.js site/js/primer.js
cd site && python3 -m http.server 8901
# Playwright with the preinstalled browser:
#   chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
```

Check: pages render with no console errors, no horizontal overflow at
390 px, table sorting still works, popovers open/close.

## History

Session AARs live in `docs/aar-*.md` — read
`aar-static-site-migration.md` (architecture), `aar-mallo-native-analytics.md`
and `aar-analytics-value-lukkari-handoff.md` (metrics design), and
`aar-primer-stat-helpers.md` (primer, helpers, voice requirement) before
large changes.
