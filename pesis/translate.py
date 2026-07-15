"""Pesis → baseball translation — "what would this guy be in MLB terms?"

Nobody has ever published a pesäpallo-to-baseball statistical bridge. This is
NOT a claim that the skills transfer (they're different sports; the pitch is
vertical and the manager calls the plays). It is a **rank-preserving quantile
map**: a player's percentile among qualified Superpesis hitters is read off at
the same percentile of the MLB qualified-hitter distribution. "He's a 92nd-
percentile kärkilyönti hitter" becomes "his hit tool ranks like a .290 MLB
bat" — a statement about *rank in his league*, translated into a scale
baseball fans have intuition for.

Two translations are NOT rank→normal quantile-mapped:
  * Kärkilyönti-% → AVG — KL% (kärkilyönnit / yritykset) is itself a batting
    average, so it is put on the MLB AVG scale by a straight LINEAR recenter
    (slope 1): shift the league-average KL% (~.53) onto the MLB league-average
    AVG (~.25) and keep every hitter's actual KL% spacing. The old quantile map
    read only a player's *rank* and sanded real gaps toward the mean, so a
    genuinely better KL% hitter barely moved the AVG. Linear keeps it honest and
    still lands on a batting-average scale.
  * 162-game pace — counting stats rescaled from the pesäpallo schedule to a
    162-game season (a pace, not an equivalency, and labeled as such).

The wRC+ equivalent is ALSO quantile-mapped (percentile of tehot-per-turn
onto a wRC+ distribution of mean 100, sd 25). It is deliberately NOT a copy
of TEHO+: real Superpesis production concentrates in the top of the order
far more than MLB's (defensive specialists bat with near-zero tehot), so raw
TEHO+ runs to 300+ and would label half the league MVP candidates.

MLB reference distributions are approximations for qualified hitters in the
2023–25 era (means/SDs eyeballed from FanGraphs leaderboards); they're
translation furniture, not research claims — refine freely.
"""

from __future__ import annotations

import sqlite3
from statistics import NormalDist

from .metrics import add_percentiles, player_seasons, season_lines

_PHI = NormalDist()

# pesis stat -> MLB analog: (mean, sd) of the MLB qualified-hitter
# distribution, direction (+1 higher percentile = higher MLB value),
# and the story of the analogy, written for a baseball audience.
MAPPINGS = (
    # KL% IS a batting average (kärkilyönnit / yritykset). Map it LINEARLY onto
    # the AVG scale (slope 1) instead of through the rank→normal quantile map,
    # which sanded real KL% gaps toward the mean. `linear` shifts the league KL%
    # mean (KL_PESIS_MEAN) onto the MLB AVG mean (KL_MLB_MEAN); spacing is kept.
    {"stat": "kl_pct", "pesis": "Kärkilyönti-% (advance the lead runner)",
     "mlb": "AVG", "linear": True, "dir": +1, "fmt": ".3f",
     "blurb": "The core bat-to-ball skill. A kärkilyönti advances the lead "
              "runner — think situational hitting as the PRIMARY batting stat."},
    {"stat": "kl_per_turn", "pesis": "Kärkilyönnit per turn (base hits)",
     "mlb": "H / 600 PA", "mean": 150.0, "sd": 22.0, "dir": +1, "fmt": ".0f",
     "blurb": "Kärkilyönnit are the successful bat-to-ball advances — the "
              "closest thing pesäpallo has to a base-hit count."},
    # Kunnarit are deliberately NOT mapped to HR: home runs are structurally
    # rare in pesäpallo (a season leader hits ~5; the career record ~120, only
    # three players past 100), so kunnari-rate → HR/600 badly overstates them.
    # Run production is carried by lyödyt/tuodut (RBI/R) and the wRC+ equivalent.
    {"stat": "lyoty_rate", "pesis": "Lyödyt per turn (runs batted home)",
     "mlb": "RBI / 600 PA", "mean": 72.0, "sd": 20.0, "dir": +1, "fmt": ".0f",
     "blurb": "Lyödyt credit the batter whose hit brings a runner home — "
              "the RBI, minus the sacrifice-fly bookkeeping."},
    {"stat": "tuotu_rate", "pesis": "Tuodut per advance (runs scored)",
     "mlb": "R / 600 PA", "mean": 76.0, "sd": 18.0, "dir": +1, "fmt": ".0f",
     "blurb": "Tuodut credit the runner who scores. Every pesäpallo run "
              "produces exactly one lyöty and one tuotu."},
    {"stat": "palo_rate", "pesis": "Palot per turn (burned outs)",
     "mlb": "K%", "mean": 0.222, "sd": 0.055, "dir": -1, "fmt": ".1%",
     "blurb": "A palo 'burns' the runner — the ball beats you to the base. "
              "The out you gave away; strikeout rate is its spiritual twin."},
)

WRC_TIERS = ((75, "replacement level"), (90, "bench bat"),
             (110, "league-average regular"), (125, "solid starter"),
             (140, "All-Star"), (160, "MVP candidate"))
MLB_SEASON_GAMES = 162
# A Superpesis regular season runs 28–33 games (33 in 2025, high-20s/30ish in
# earlier years) — roughly one month of MLB baseball. The 162-game pace is
# therefore a ~5× extrapolation and is presented as pace trivia, not a
# projection; the quantile-mapped rate stats above it are the real
# translation (they're schedule-length-free).
SUPERPESIS_SEASON_GAMES = 30  # nominal; the page uses actual games played


def _quantile_value(pct: int, mean: float, sd: float, direction: int) -> float:
    z = _PHI.inv_cdf(min(99, max(1, pct)) / 100)
    return mean + direction * sd * z


# KL% → AVG linear anchor. The qualified-hitter KL% league mean (~.53, stable
# across seasons) is shifted onto the MLB qualified-hitter AVG mean (~.25). Slope
# is 1 — the map recenters without compressing, so real KL% gaps survive. A few
# of the very worst qualified hitters land below zero and are clamped to .000.
KL_PESIS_MEAN = 0.533
KL_MLB_MEAN = 0.250


def mlb_value_for(mapping: dict, pct: int, value: float) -> float:
    """MLB-scale value for one MAPPINGS entry. `linear` stats are a straight
    slope-1 recenter of their own rate onto the MLB scale (KL% is a batting
    average, so its real spacing is kept rather than rank-sanded); everything
    else is rank-preserving quantile-mapped from the player's percentile. Both
    the Flask app and the static-site export go through here so they can't drift."""
    if mapping.get("linear"):
        return max(0.0, KL_MLB_MEAN + (value - KL_PESIS_MEAN))
    return _quantile_value(pct, mapping["mean"], mapping["sd"], mapping["dir"])


def wrc_tier(wrc: int) -> str:
    for ceiling, label in WRC_TIERS:
        if wrc < ceiling:
            return label
    return "peak-Bonds territory"


# ── Lukkari (pitcher) → MLB run-prevention translation ────────────────────
# A lukkari's run-prevention percentile among qualified lukkarit is read onto
# an MLB ERA distribution (lower = better). LRA- is already an ERA-minus-style
# league index (100 = average, lower better), so it maps to ERA- directly.
ERA_MEAN, ERA_SD = 4.00, 0.90
ERA_TIERS = ((2.90, "ace"), (3.70, "mid-rotation starter"),
             (4.40, "back-end starter"), (5.30, "swingman"))


def era_tier(era: float) -> str:
    for ceiling, label in ERA_TIERS:
        if era < ceiling:
            return label
    return "replacement level"


def era_equivalent(goodness_pct: int) -> float:
    """MLB ERA for a lukkari at the given run-prevention percentile (0–100,
    higher = better; a top preventer maps to a low ERA)."""
    return _quantile_value(goodness_pct, ERA_MEAN, ERA_SD, -1)


def translate_player(conn: sqlite3.Connection, player_id: int,
                     year: int | None = None) -> dict | None:
    """Baseball card for one player-season. None if he has no season line.

    Percentiles come from the same qualified pool the player pages use; the
    `dir` flag handles stats where better = lower (palot → K%). Percentile
    flipping in metrics is undone first so the map sees raw rank-of-value.
    """
    career = player_seasons(conn, player_id)
    if not career:
        return None
    target = next((s for s in career if s["year"] == year), career[-1])
    lines = season_lines(conn, target["season_id"])
    add_percentiles(lines, stats=tuple(m["stat"] for m in MAPPINGS)
                    + ("tehot_per_turn",))
    line = next(l for l in lines if l["player_id"] == player_id)

    rows = []
    for m in MAPPINGS:
        pct = line.get(f"pct_{m['stat']}")
        value = line.get(m["stat"])
        if pct is None or value is None:
            continue
        # add_percentiles flips negative stats so high pct = good; `dir`
        # decides whether "good" means a bigger or smaller MLB number.
        mlb = mlb_value_for(m, pct, value)
        rows.append({"pesis_label": m["pesis"], "pesis_value": value,
                     "percentile": pct, "mlb_stat": m["mlb"],
                     "mlb_value": format(mlb, m["fmt"]),
                     "blurb": m["blurb"]})

    games = line["games"] or 1
    pace = {
        "HR": round(line["kunnarit"] * MLB_SEASON_GAMES / games),
        "RBI": round(line["lyodyt"] * MLB_SEASON_GAMES / games),
        "R": round(line["tuodut"] * MLB_SEASON_GAMES / games),
        "extrapolation": round(MLB_SEASON_GAMES / max(games, 1), 1),
    }
    pct_prod = line.get("pct_tehot_per_turn")
    wrc = (round(_quantile_value(pct_prod, 100.0, 25.0, +1))
           if pct_prod is not None else None)
    return {"player_id": player_id, "name": line["name"], "team": line["team"],
            "year": line["year"], "age": line.get("age"),
            "games": line["games"], "qualified": bool(rows),
            "rows": rows, "wrc_plus": wrc, "teho_plus": line["teho_plus"],
            "tier": wrc_tier(wrc) if wrc is not None else None,
            "pace": pace}
