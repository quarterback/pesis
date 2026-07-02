"""Pesis → baseball translation — "what would this guy be in MLB terms?"

Nobody has ever published a pesäpallo-to-baseball statistical bridge. This is
NOT a claim that the skills transfer (they're different sports; the pitch is
vertical and the manager calls the plays). It is a **rank-preserving quantile
map**: a player's percentile among qualified Superpesis hitters is read off at
the same percentile of the MLB qualified-hitter distribution. "He's a 92nd-
percentile kärkilyönti hitter" becomes "his hit tool ranks like a .290 MLB
bat" — a statement about *rank in his league*, translated into a scale
baseball fans have intuition for.

Two translations are direct rather than quantile-mapped:
  * TEHO+ ↔ wRC+ — both are 100-indexed league-relative production, so the
    number carries over as-is.
  * 162-game pace — counting stats rescaled from the pesäpallo schedule to a
    162-game season (a pace, not an equivalency, and labeled as such).

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
    {"stat": "kl_pct", "pesis": "Kärkilyönti-% (advance the lead runner)",
     "mlb": "AVG", "mean": 0.252, "sd": 0.026, "dir": +1, "fmt": ".3f",
     "blurb": "The core bat-to-ball skill. A kärkilyönti advances the lead "
              "runner — think situational hitting as the PRIMARY batting stat."},
    {"stat": "kunnari_rate", "pesis": "Kunnarit per turn (home runs)",
     "mlb": "HR / 600 PA", "mean": 20.0, "sd": 11.0, "dir": +1, "fmt": ".0f",
     "blurb": "A kunnari clears the bases and scores the batter — every one "
              "is an inside-the-park homer; nothing leaves the field."},
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


def _quantile_value(pct: int, mean: float, sd: float, direction: int) -> float:
    z = _PHI.inv_cdf(min(99, max(1, pct)) / 100)
    return mean + direction * sd * z


def wrc_tier(wrc: int) -> str:
    for ceiling, label in WRC_TIERS:
        if wrc < ceiling:
            return label
    return "peak-Bonds territory"


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
    add_percentiles(lines, stats=tuple(m["stat"] for m in MAPPINGS))
    line = next(l for l in lines if l["player_id"] == player_id)

    rows = []
    for m in MAPPINGS:
        pct = line.get(f"pct_{m['stat']}")
        value = line.get(m["stat"])
        if pct is None or value is None:
            continue
        # add_percentiles flips negative stats so high pct = good; `dir`
        # decides whether "good" means a bigger or smaller MLB number.
        mlb = _quantile_value(pct, m["mean"], m["sd"], m["dir"])
        rows.append({"pesis_label": m["pesis"], "pesis_value": value,
                     "percentile": pct, "mlb_stat": m["mlb"],
                     "mlb_value": format(mlb, m["fmt"]),
                     "blurb": m["blurb"]})

    games = line["games"] or 1
    pace = {
        "HR": round(line["kunnarit"] * MLB_SEASON_GAMES / games),
        "RBI": round(line["lyodyt"] * MLB_SEASON_GAMES / games),
        "R": round(line["tuodut"] * MLB_SEASON_GAMES / games),
    }
    wrc = line["teho_plus"]
    return {"player_id": player_id, "name": line["name"], "team": line["team"],
            "year": line["year"], "age": line.get("age"),
            "games": line["games"], "qualified": bool(rows),
            "rows": rows, "wrc_plus": wrc,
            "tier": wrc_tier(wrc) if wrc is not None else None,
            "pace": pace}
