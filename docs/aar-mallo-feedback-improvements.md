# AAR: Mallo feedback improvements (umpire feedback round)

**Date:** 2026-08-03
**Scope:** `site/js/app.js`, `site/js/primer.js`, `site/sw.js`, `pesis/metrics.py`,
`pesis/db.py`, corrections to two earlier AARs.

## Context

A Finnish pesäpallo umpire reviewed the site and sent detailed feedback. Every
point was triaged against the code before changing anything. One report was a
real (label) bug, one was a metric-design flaw with the data already in hand to
fix it, several were copy problems, and the rest were questions the code could
answer or roadmap items.

| Feedback point | Outcome |
| --- | --- |
| 1%/2%/3%/K% semantics look off by one | **Confirmed bug — fixed** (labels only; the numbers were always correct) |
| Etenemis%/RUN+ inflated by free trail-runner advances | **Fixed** — RUN+ is now an 80/20 lead/trail blend of per-role indices |
| Exclude jokers from the paikka filter | **Added** — new `Kenttäpelaajat` option |
| Palo%: own outs or all outs during the turn? | **Answered** — own outs only; `db.py` glossary corrected, popovers clarified |
| Is there a true plate-appearance stat? | **Answered** — `turns_at_bat` counts every batting turn; renamed Lyöntivuorot |
| TEHO+ overvalues sluggers, misses table-setters | **Known limitation, deferred** — needs batting-order/PBP data |
| SPARK parameter split rationale | **Answered** — transparent priors, not fitted; documented for revisit |
| JYK/VYK explanation, "korvaaja" unclear in pesis terms | **Copy expanded** in popovers, Kaava and primer |
| Statcast-style leads and fluid fielding positions | **Deferred** — requires the play-by-play endpoint |

## The 1%/2%/3%/K% label bug

The frontend described the splits as 1→2, 2→3, 3→koti and kotiutus. The
upstream `batpe_*_0..3` buckets are in fact lead-runner advances **to** 1st /
2nd / 3rd / home: 1% is home→first, 2% first→second, 3% second→third, K%
third→home. Two proofs: the old labels made `kl_base2` and `kl_base3` the same
event even though their attempt counts and rates differ, and the four bucket
try-counts partition `batpe_total_tries` exactly, which only works if the four
lead-runner start positions are home/1st/2nd/3rd.

Root cause: an owner clarification recorded in
`aar-analytics-value-lukkari-handoff.md` was itself wrong, and the frontend
copy was written from that table while `BASE_KL_LABELS` in `metrics.py` and
the legacy `i18n.py` had it right all along. Correction notes are now appended
to both AARs. Only prose changed; no recomputation or re-export was needed for
this item.

Lesson: when two places in the repo disagree about semantics, reconcile them
against the raw data (the try-count partition took minutes to check) instead
of trusting whichever was written down most recently.

## RUN+ redefinition

The upstream feed splits runner advances into `runpadv_*` (kärki) and
`runtadv_*` (taka); `v1import.py` sums them into `etenemiset`, and RUN+ built
on the pooled rate rewarded players whose totals were padded with near-free
trail advances. The full upstream row rides along in `player_games.raw`
(`_v1`), so the split was recoverable without re-ingesting anything:
`_add_raw_base_splits()` now also accumulates the four lead/trail fields, and
RUN+ is `100 × (0.8 · kärki-% / league kärki-% + 0.2 · taka-% / league
taka-%)`.

The first implementation blended the raw rates (0.8·lead% + 0.2·trail%) and
indexed the blend against a league blend. A smoke test caught the flaw: a
trail-only runner scored RUN+ ≈ 150 because trail advances succeed at ~0.95
league-wide, so any decent trail rate towers over a blended league baseline.
Blending per-role *indices* instead (each role against its own league rate)
removes exactly the inflation the feedback described; the same test now puts
that player at 95. Weights renormalize when a player has attempts in only one
role, and rows without the raw fields fall back to the old pooled computation
so historical seasons keep a RUN+.

SPARK inherits the new RUN+ through its 0.30 weight, unchanged otherwise. The
displayed numbers change only when the next data refresh re-runs `export.py`.

## Copy and UI changes

- `Kenttäpelaajat` option in the leaderboard paikka menu (`pos != null`,
  i.e. everyone except jokers/DH). Jokers-only was already reachable via DH.
- SPARK is now "tilanteenrakentajan indeksi" in all Finnish copy (popover,
  player page, Kaava, both Finnish primer variants).
- VYK/JYK popovers, Kaava rows and primer entries explain replacement level
  in pesis terms (a player freely available from Ykköspesis or the bench)
  instead of assuming sabermetrics background.
- `turns_at_bat` is labeled Lyöntivuorot (LV in tight table columns) so it
  cannot be read as innings.
- Palo%/OUT+ popovers state that only the player's own outs on advance
  attempts count; the `db.py` glossary claimed "outs (as batter or runner)"
  and now matches the actual `runpadv_outs + runtadv_out` mapping.
- The Sieppari description ("covers the area behind the batter" — a baseball
  catcher assumption) now describes the real roving short-infield role
  between home and second.
- Base-split popovers, labels and Kaava rows use the corrected home→1st …
  3rd→home semantics.
- `sw.js` CACHE bumped mallo-v3 → mallo-v4 (shell files changed).

## Deferred items

- **Play-by-play ingest** (`/online/{match}/events`, `runnersAtBases`) remains
  the gating step for: TEHO+ role/lineup context, statcast-style lead
  distances, situational fielding positions, RE24-grade run values.
- **`batpe_outs_N`/`batpe_caughts_N`** are ingested into `raw` but unused —
  they would let a batter be charged for lead runners burned on his
  advancement attempts.
- **JYK/VYK still use pooled `etenemiset`** in the value events; splitting the
  weight lead/trail there would add features to an already small team-level
  regression and was deliberately left alone this round.
- **SPARK weights** (0.50/0.30/0.20) remain transparent priors; revisit once
  run-expectancy data exists.

## Verification

`node --check` on both shell files; a fabricated-row smoke test of the new
RUN+ path (blend math, one-role renormalization, legacy fallback); Playwright
at 390 px over the leaderboard (filter, sorting, popovers), Kaava, all four
primer variants and a player page — no horizontal overflow, no new console
errors (the two logged errors are the Vercel insights script, absent outside
Vercel, and a font CDN blocked by the sandbox).

## Follow-up (same day): English mode, kTEHO+ removed from the UI

Second round after the first PR merged.

**English mode.** The site now has a FI/EN toggle in the nav (persisted in
`localStorage` as `mallo-lang`, FI default). Implementation is a two-argument
helper — `t(fi, en)` — plus `statLabel(key)` with an English override table
(`STAT_LABEL_EN`: PA, HR/PA, RBI/PA, Out%, Escort%, Advance%, home→1st splits)
so Finnish-worded stat labels translate while the shared symbols (VYK, SPARK,
KL%) stay put. Every page template, table header, filter, popover (selected
language shown first), the Kaava page, the About prose and the error strings
went through it; the primer's own language toggle now defaults to the site
language. No i18n framework — with one language pair and one file, inline
`t()` keeps every string next to its use site.

**kTEHO+ removed from the UI, TEHO+ kept.** Owner call: park-adjusted TEHO+
tracks raw TEHO+ too closely to earn a column (park factors are regressed
toward 100), and without lineup context neither number differentiates roles.
kTEHO+ is gone from the leaderboard pills, player career table, Kaava and the
primer lists; `teho_plus_adj` stays in the pipeline, the exported JSON and the
CSV download. The TEHO+ popover and Kaava note now say plainly that the number
favors the back of the batting order. The park-factor table on the league page
stays.

**Pre-existing mobile bug fixed.** Player pages overflowed ~300 px at 390 px
on main: `.split` grid items default to `min-width:auto`, so the career table
stretched its column past the viewport instead of scrolling inside its card.
`.split > div { min-width: 0; }` fixes it.

**Lineup data confirmed.** The owner confirmed (with a live match page,
`pesistulokset.fi/ottelut/128954`) that box scores list players in batting
order — 1–9 fielders, 10–12 jokerit — with per-jakso splits, a PBP event feed
and hit-direction spray data by base situation. Recorded in `design.md`:
lineup-slot ingest from the match endpoint is the missing input for a
role-aware TEHO+, and slot-in-order is the stable role signal because in-game
defensive positions are fluid.

Verification: `node --check`; Playwright at 390 px in both languages over the
leaderboard (toggle, Fielders filter, popover language order), player page,
Kaava, league, projections, lukkarit, about and primer — overflow 0
everywhere, no kTEHO+ anywhere, no new console errors. `sw.js` CACHE bumped to
mallo-v5 (app.js, primer.js, mallo.css all changed).
