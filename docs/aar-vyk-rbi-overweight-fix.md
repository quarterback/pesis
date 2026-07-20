# AAR: fixing the RBI overweight in JYK/VYK value weights

*Date: 2026-07-20. Audience: future developers/agents taking over the Mallo codebase.*

## Executive summary

Reader feedback said VYK (the WAR analog) overrates RBI. Investigation confirmed
it and found the cause: the value-weight regression in
`pesis/metrics.py::_empirical_value_weights` used team runs as its target while
`tuodut` and `lyodyt` were also regression features. Team runs *is* the sum of
`tuodut`, so the fit was a near-identity and put essentially all weight on the
run-outcome stats. The fix removes run outcomes from the value model entirely,
derives priors from each season's own run accounting, and shrinks the team-level
regression toward those priors instead of toward zero. One file changed:
`pesis/metrics.py`. No site shell files changed, so no service-worker cache bump
was needed, and the exported numbers change at the next daily data refresh.

## The reported problem and the confirmed mechanism

The feedback was that VYK tracks RBI totals too closely. Because `run_value` is
an exact linear combination of the eight event counts and both are exported per
player, the effective live weights could be recovered from `site/data` by
solving the linear system. For the 2026 men's Superpesis they were:

| Event | Live weight before fix |
| --- | --- |
| kunnarit | +0.67 |
| lyodyt | +0.34 |
| tuodut | +0.30 |
| karkilyonnit | +0.024 |
| saatot | +0.026 |
| etenemiset | +0.026 |
| haavat | −0.020 |
| palot | −0.049 |

The skill events sit at (or nearly at) the ±0.02 sign-clamp floor while the
outcome stats carry everything. Among qualified 2026 men's players,
corr(VYK, lyödyt) was +0.83. VYK was in effect
`0.67·kunnarit + 0.34·RBI + 0.30·runs scored`.

The root cause is target leakage. The regression's target was team `tuodut`,
and `tuodut` was also a feature; in addition, `lyodyt + kunnarit` equals team
runs almost exactly by scoring accounting (2026 men: 1498 vs 1543). A
regression whose target is an accounting identity of its features tells you
nothing about the run value of skill events.

## What was tried and rejected

Removing `lyodyt`/`tuodut` from the features but keeping a plain
ridge-toward-zero regression does not work. With only 12 team rows and heavily
collinear counts, the fit collapses onto kunnarit (≈1.4–1.9) and floors the
other skill events at the clamp. A dozen team totals cannot identify six
weights on their own.

## The fix

All in `pesis/metrics.py`:

1. **`VALUE_EVENTS`** — value credit now comes only from
   `kunnarit, karkilyonnit, saatot, etenemiset, haavat, palot`. Lyödyt and
   tuodut are excluded on the same reasoning baseball WAR uses for RBI and
   runs scored: they are run outcomes, and how many a player accumulates
   depends on teammates being on base ahead of him (lyödyt) or batting him
   home (tuodut). The skill behind an RBI is already counted through
   kärkilyönnit and kunnarit; the opportunity should not be.
2. **`_calibrated_priors`** — replaces the old hard-coded fallback dict.
   Every pesäpallo run is either a kunnari or batted in by an advancing hit,
   so league totals pin the average run yield of the events. Non-kunnari runs
   are split 60% to the advancing hit, 25% to etenemiset, and 15% to saatot;
   out costs scale with the season's runs per turn (haavat −0.5·rpt, palot
   −1.0·rpt); kunnarit stays 1.40. The priors therefore move with the run
   environment of each series and season, including the men's/women's
   difference, instead of being constants.
3. **Prior-centered ridge** — when a season has six or more teams, the ridge
   regression fits the residual left after the priors, so shrinkage returns
   the priors rather than an empty model. Sign clamps are unchanged. Seasons
   with fewer than six teams get the priors; a season with no team rows gets
   fixed constants.

Because `_add_value_stats` builds `run_value` from the weight dict's keys,
removing lyödyt/tuodut from the weights automatically removed them from
`run_value`, RAA, JYK, and VYK with no further changes.

## Verification

The DB is not available locally, so verification ran against the committed
`site/data` exports by reconstructing team totals from player lines and
monkeypatching `_team_event_rows`. Results for the 2026 men's Superpesis
(women's series moved similarly):

- corr(VYK, lyödyt) fell from +0.83 to +0.48.
- corr(VYK, kärkilyönnit) rose from +0.55 to +0.78; corr(VYK, KL%) from
  +0.19 to +0.56; corr(VYK, etenemiset) from +0.49 to +0.72.
- The leaderboard reshuffles rather than upends: the same player leads, but
  volume-RBI players drop out of the top ten in favor of players who rate
  well on the skill events. Magnitudes stay in a believable WAR-like range
  (top ≈2.5 at mid-season).

The remaining VYK–lyödyt correlation of roughly +0.5 is expected: good
advancing hitters do drive in runs.

## Site copy and deploy

The VYK/JYK explainers in `app.js` STAT_INFO, the Kaava rows, and all four
primer variants describe the stats as wins/runs above replacement without
committing to a weighting method, so no copy changes were required. Nothing in
`site/` changed, so no `sw.js` cache bump. As always, the fix appears on
mallo.fi only after the daily refresh workflow re-runs `export.py`.

## Open questions and future work

- The 60/25/15 credit split and the 1.40 kunnari weight are documented bridge
  assumptions, not fitted values. The owner may want to tune them.
- The flat kärkilyönti weight ignores the target base. The `batpe` splits
  already in `raw` could value a KL that brings a runner home above a KL to
  first, but doing that at the team-regression level would add four more
  features to a 12-row fit. Better to wait for play-by-play.
- The real end state is unchanged from earlier AARs: replace these bridge
  weights with RE24-style run expectancy once `runnersAtBases` events are
  ingested.
