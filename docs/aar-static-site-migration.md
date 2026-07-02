# AAR — static-site migration, advanced-only redesign, history backfill

*Session: 2026-07-02. Branch: `claude/static-site-vercel-deploy-zkk7yj` (PR #15).*

## What this session did

- **Fixed the Vercel deploy.** The old config ran `python export.py` at build
  time against `data/pesis.db`, which is gitignored and absent on Vercel. Made
  the site truly static: data is pre-exported into `site/data/` and committed;
  `vercel.json`/`netlify.toml` serve the directory with no build step, no
  Python, no DB. `.gitignore` anchored to `/data/` so `site/data/` is tracked.
- **Advanced-only, additive.** Stripped upstream counting stats
  (kunnarit/lyödyt/tuodut/tehot and published rates) from every board and
  removed match box scores entirely (view + data + links). The site surfaces
  only Mallo-native analytics.
- **Value stats (WAR analog).** Ported the value engine: empirical linear
  weights (ridge regression on team run environment) → `run_value` → `raa`
  (runs above average) → **JYK** (runs above replacement) → **VYK** (wins above
  replacement). VYK is the default leaderboard sort and the player hero tile.
- **Positions + lukkari.** Baseball position code next to every player
  (L→P, S→C, 1V/2V/3V→1B/2B/3B, 3P/2P→LSS/RSS, 3K/2K→LF/RF, jokeri→DH), a
  position filter, and a lukkari (pitcher) run-prevention board (LRA/LRA-/RP).
- **Interactive tables.** `makeTable()` — click-to-sort columns (direction
  toggle), 10/20/50 pagination — applied to every stat table (leaderboard,
  lukkari, PARE, standings, roster).
- **Design.** Red Hat Display Black Italic wordmark + Plus Jakarta Sans body
  (Fontshare, no Google Fonts); Sarja/sex/Kausi controls; lean 4-item nav +
  Kaava; tables on surface panels with accent-tinted row dividers; OG/meta +
  Mallo icon; About rewritten short in Finnish with an obfuscated contact email.
- **History.** Backfilled 1990→2026 (Superpesis M/W back to 1990, Ykköspesis
  ~1997→): 130 seasons, ~5,400 players. Export kept to ~44 MB by exporting
  qualified players only, slimming rosters/careers, and computing PARE
  projections for the current season only.

## Data refresh (now a manual step)

The static site does **not** self-refresh (unlike the old Flask `entrypoint.sh`).
To update:

```
python -m pesis ingest-v1 --year 2026 --series all   # or --from-year/--to-year
python export.py
git add site/data && git commit && git push
```

`data/pesis.db` (1.8 GB after the full backfill) is gitignored and rebuilt by
ingest; only `site/data/` (~44 MB) is committed.

## Not covered / open items

1. **Baseball translation page.** `pesis/translate.py` + the old Flask
   `baseball.html` (player↔MLB translation, the owner's stated favorite feature)
   are **not** wired into the static SPA. Biggest un-ported feature.
2. **No ages / aging.** The v1 feed carries no birth years, so `IKÄ` was removed
   and `projection.aging_curve` can't apply. Needs the official API key or a
   roster source.
3. **Unified WAR / fielding.** VYK is batting-only; lukkari RP is a separate
   ERA-style bridge; positions are shown but not valued. No combined WAR and no
   fielding metrics. See `aar-analytics-value-lukkari-handoff.md`.
4. **Value weights are aggregate, not RE24.** `_empirical_value_weights` and
   `lukkari_lines` are first scaffolds from box-score aggregates; upgrade once
   play-by-play run expectancy is ingested (needs API key / `/online/*/events`).
5. **Vestigial deploy files.** `Dockerfile`, `fly.toml`, `entrypoint.sh`,
   `wsgi.py`, and the whole `pesis/web/` Flask app are unused by the static
   Vercel deploy. `server.py` is still used for local preview. Consider
   archiving the Flask stack.
6. **`comps` (comparable seasons)** is exported as `[]` — dead UI branch; wire
   `pesis/similarity.py` or remove.
7. **Control inconsistency.** Projections/standings use the older grouped
   `seasonSelHtml` dropdown, not the Sarja/sex/Kausi controls of the leaderboard.
8. **Percentile fingerprint** on the player page still ranks basic rates
   (kl_pct/saatto/eten/…); kept because percentile-ranking is itself additive,
   but it's the least "advanced-only" surface.
9. **Runtime font dependency.** Fonts load from `api.fontshare.com` at runtime
   (system-font fallback if unreachable); not self-hosted.
10. **Repo/deploy weight.** 44 MB / ~7,500 committed files. Trim levers: drop
    the oldest years, or slim leaderboard files further.
11. **Verification scope.** All checks were local (headless Chromium, light +
    dark). Not re-verified on the live Vercel deploy or on mobile widths (wide
    tables scroll horizontally inside `.tbl-card`).
12. **About copy** is an AI Finnish translation of the owner's note — worth an
    owner voice pass.
