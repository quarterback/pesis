# AAR: Situational hitting — do lyödyt measure the hitter or the situation?

**Date:** 2026-08-04
**Status:** analysis complete, metric not yet built or shipped.
**Data:** men's Superpesis 2026 runkosarja, 22,910 plate appearances from
play-by-play (`plays`), cross-checked against the official box scores.

This is the write-up of a finding that came out of the play-by-play ingest.
It is written to be readable on its own — it can be shared with people who
have no interest in the codebase.

## The question

Lyödyt (runs batted home) is one of the numbers every pesäpallo fan knows,
and it is a third of tehot. But it is the sum of two different things: how
well a player hits, and what situations the player gets to hit in. Until the
play-by-play feed was parsed, the second part could not be measured, so there
was no way to separate them.

Every plate appearance in the `plays` table now carries the base situation and
the number of outs at the moment the batter stepped in. That is enough to ask
the question directly.

## Finding 1: the opportunity gradient is enormous

Expected lyödyt per plate appearance, by the situation the batter walks into
(league average, 2026 men's Superpesis):

| Bases | 0 outs | 1 out | 2 outs | PAs |
| --- | ---: | ---: | ---: | ---: |
| empty | 0.001 | 0.000 | 0.000 | 7,323 |
| 1st | 0.010 | 0.005 | 0.008 | 5,610 |
| 2nd | 0.015 | 0.024 | 0.039 | 1,331 |
| 3rd | 0.047 | 0.050 | 0.167 | 909 |
| 1st + 2nd | 0.048 | 0.046 | 0.051 | 3,380 |
| 1st + 3rd | 0.085 | 0.105 | 0.116 | 950 |
| 2nd + 3rd | 0.209 | 0.172 | 0.128 | 395 |
| loaded | **0.434** | 0.405 | 0.346 | 3,012 |

A plate appearance with the bases loaded is worth roughly a hundred times
more lyödyt than one with the bases empty, and none of that difference is
about the hitter.

## Finding 2: 94 % of the raw stat is the situation

Summing each player's situations gives their **expected lyödyt** for the
season. Correlating that expectation against what players actually produced:

> **r² = 0.94** — 94 % of the variation between players in raw lyödyt is
> explained by the situations they faced, before any hitting happens.

This is the quantified version of the complaint that traditional production
totals reward batting-order slot. It also explains why dividing by plate
appearances does not fix it: a rate built on an opportunity-dependent count
is still opportunity-dependent. TEHO+ inherits the same problem.

## Finding 3: the ranking changes substantially

Actual minus expected, for the 79 players with 150+ plate appearances.

**Most above expectation**

| Player | Team | Lyödyt | Expected | +/− | Rank raw → adj. |
| --- | --- | ---: | ---: | ---: | --- |
| Henri Puputti | ViVe | 76 | 46.6 | +29.4 | 1 → 1 |
| Perttu Ruuska | Manse | 61 | 47.2 | +13.8 | 2 → 2 |
| Valentin Ikonen | Tahko | 39 | 27.3 | +11.7 | 8 → 3 |
| Ville-Veikko Olli | IPV | 49 | 38.4 | +10.6 | 6 → 4 |
| Elmeri Anttila | ViVe | 15 | 7.4 | +7.6 | 20 → 5 |
| Antti Korhonen | Manse | 29 | 22.4 | +6.6 | 10 → 6 |

**Most below expectation**

| Player | Team | Lyödyt | Expected | +/− | Rank raw → adj. |
| --- | --- | ---: | ---: | ---: | --- |
| Veeti Kettunen | Tahko | 1 | 5.4 | −4.4 | 68 → 79 |
| Matias Kauppinen | IPV | 7 | 11.4 | −4.4 | 30 → 78 |
| Toni Marjamäki | AA | 20 | 24.3 | −4.3 | 16 → 77 |
| Anttoni Jakobsson | KiPa | 1 | 4.8 | −3.8 | 71 → 76 |

**The three stories worth telling**

- **Henri Puputti** leads either way. 76 runs driven home against an
  expectation of 46.6 is the largest gap in the league — he is not merely
  well-placed in the order.
- **Elmeri Anttila** is 20th in raw lyödyt with 15, but he bats in situations
  that yield 7.4 on average. Adjusted, he is 5th. This is the leadoff/top-of-
  order value that the traditional line never shows.
- **Patrik Wahlsten** is 4th in raw lyödyt with 50 — and had the single
  largest opportunity total in the league at 51.2 expected. Adjusted, he is
  48th of 79. **Toni Marjamäki** makes the same move harder: 16th → 77th.

## Attribution and validation (the part that nearly went wrong)

The first pass counted every run scored during a batter's turn as a lyöty for
that batter. That over-counted the league by 7.6 % and matched the official
box score for only 7 of 45 players. Testing attribution rules against the
box scores settled it:

| Rule | Exact matches | League total vs box |
| --- | ---: | ---: |
| every run during the turn | 7/45 | 1,483 vs 1,378 |
| excluding kunnari runs | 22/45 | 1,413 vs 1,378 |
| **excluding kunnari + wild-throw + walk-forced runs** | **43/45** | **1,375 vs 1,378** |

A lyöty is a run that came from the batter's own hit. Kunnarit are their own
category, runs scored on a harhaheitto belong to the defense's mistake, and
runs forced in by a vapaataival are not batted home at all. With that rule the
figures reconcile to 0.2 % at league level.

**Lesson worth keeping:** the headline finding (r² = 0.94) barely moved between
the wrong and right attribution, but publishing numbers that disagree with the
official scoresheet for 38 of 45 players would have been indefensible the first
time a coach checked one. Validate attribution against the official record
before the finding leaves the building.

## What this is, and is not

- It answers one question: what did the player do with the chances they got.
- It is **not** a value stat and does not replace lyödyt. Runs that were
  driven home count the same for the team however easy they were.
- One season is a small sample. Situational over-performance is less stable
  year to year than hitting skill, so the top of this list is a description
  of 2026, not a forecast of 2027.
- It is the pesäpallo generalization of hitting with runners in scoring
  position. In baseball, "scoring position" is a fixed flag; pesäpallo box
  scores record only the third-base cases. The event data gives all 24
  base-out states, and in a sport where the situation turns over this fast,
  that is where the signal is.

## Shipped as LYO

`pesis/situational.py` computes it and `metrics.season_lines` attaches it, so
it flows to the leaderboard (sortable stat), the player page (a tile) and the
CSV without further plumbing. Seasons without play-by-play get `None` and the
column simply stays empty.

The label is **LYO — Lyödyt Yli Odotetun**, following the site's existing
initialism convention (JYK = Juoksut Yli Korvaajan). In English it is paired
as `LYO (RBI-OE)`. Both live in `STAT_LABEL` / `STAT_LABEL_EN` in
`site/js/app.js`, so renaming is a two-line change — the owner is still
settling names for this family of stats.

Guardrails in the implementation:

- Seasons with fewer than 2,000 parsed plate appearances return nothing
  rather than a table built on noise.
- The expected table is the season's own league average, so LYO is centred on
  zero by construction and a player who merely gets good situations earns
  nothing (there is a test for exactly that).
- The box-score `lyodyt` column stays the official number on the page; the
  play-by-play attribution is used only to build the expectation.

## Next step

The tuodut (runs scored as a runner) half of tehot can get the same treatment,
using the base the runner was standing on when the turn began. That would
complete the picture for tehot as a whole: how much of a player's production
total is the player, and how much is where they happened to be standing.
