"""Pesis → baseball translation — "what would this guy be in MLB terms?"

This is a rank-preserving translation, not a claim of skill transfer. Counting
stats are now normalized to baseball schedule windows: a Superpesis regular
season is roughly MLB-month sized, so the page leads with 33-game equivalents
and treats 162-game lines as secondary pace context only.
"""

from __future__ import annotations

import sqlite3
from statistics import NormalDist

from .metrics import add_percentiles, player_seasons, season_lines

_PHI = NormalDist()

MAPPINGS = (
    {"stat": "kl_per_turn", "pesis": "Kärkilyönnit (hits)",
     "mlb": "H / 600 PA", "mean": 151.0, "sd": 25.0, "dir": +1, "fmt": ".0f",
     "blurb": "Kärkilyönnit are the closest box-score analog to hits: the "
              "batter successfully advances the lead runner."},
    {"stat": "kl_pct", "pesis": "Kärkilyönti-% (batting average)",
     "mlb": "AVG", "mean": 0.252, "sd": 0.026, "dir": +1, "fmt": ".3f",
     "blurb": "Kärkilyöntiprosentti is the batting-average analog: success "
              "per lead-runner advancement attempt."},
    {"stat": "kunnari_rate", "pesis": "Kunnarit per turn (home runs)",
     "mlb": "HR / 600 PA", "mean": 20.0, "sd": 11.0, "dir": +1, "fmt": ".0f",
     "blurb": "A kunnari clears the bases and scores the batter — every one "
              "is an inside-the-park homer; nothing leaves the field."},
    {"stat": "hr_rbi_per_turn", "pesis": "Lyödyt (HR + RBI)",
     "mlb": "HR+RBI / 600 PA", "mean": 92.0, "sd": 30.0, "dir": +1, "fmt": ".0f",
     "blurb": "The Finnish lyödyt line is read as home runs plus runs batted "
              "in — e.g. 5+44 means 5 HR and 44 RBI."},
    {"stat": "tuotu_rate", "pesis": "Tuodut (runs scored)",
     "mlb": "R / 600 PA", "mean": 76.0, "sd": 18.0, "dir": +1, "fmt": ".0f",
     "blurb": "Tuodut are runs scored: the runner who crosses home gets the "
              "run, paired with a batter's lyöty credit."},
    {"stat": "palo_rate", "pesis": "Palot per turn (burned outs)",
     "mlb": "K%", "mean": 0.222, "sd": 0.055, "dir": -1, "fmt": ".1%",
     "blurb": "A palo 'burns' the runner — the ball beats you to the base. "
              "The out you gave away; strikeout rate is its spiritual twin."},
)

WRC_TIERS = ((75, "replacement level"), (90, "bench bat"),
             (110, "league-average regular"), (125, "solid starter"),
             (140, "All-Star"), (160, "MVP candidate"))
MLB_SEASON_GAMES = 162
MLB_MONTH_GAMES = 33
SUPERPESIS_REGULAR_SEASON_GAMES = 33
SUPERPESIS_MAX_CHAMPIONSHIP_POSTSEASON_GAMES = 15  # 3 best-of-5 rounds
SUPERPESIS_MAX_BRONZE_POSTSEASON_GAMES = 13  # 2 best-of-5 + best-of-3 bronze


def _quantile_value(pct: int, mean: float, sd: float, direction: int) -> float:
    z = _PHI.inv_cdf(min(99, max(1, pct)) / 100)
    return mean + direction * sd * z


def wrc_tier(wrc: int) -> str:
    for ceiling, label in WRC_TIERS:
        if wrc < ceiling:
            return label
    return "peak-Bonds territory"


def season_game_context(conn: sqlite3.Connection, season_id: int) -> dict:
    """Return schedule context for baseball translations.

    Prefer actual team games from matches; fall back to the max player-games in
    sparse fixtures. The regular-season count is the normalization denominator
    for MLB-month equivalents, avoiding the old mistake of presenting only a
    162-game extrapolation for a 28–33 game sport.
    """
    rows = conn.execute(
        """SELECT team, COUNT(*) AS games FROM (
               SELECT home_team AS team FROM matches WHERE season_id = ?
               UNION ALL
               SELECT away_team AS team FROM matches WHERE season_id = ?
           ) GROUP BY team""", (season_id, season_id)).fetchall()
    actual = max((r["games"] for r in rows), default=0)
    if not actual:
        rows = conn.execute(
            """SELECT player_id, COUNT(*) AS games FROM player_games
               WHERE season_id = ? GROUP BY player_id""", (season_id,)).fetchall()
        actual = max((r["games"] for r in rows), default=SUPERPESIS_REGULAR_SEASON_GAMES)
    regular = actual or SUPERPESIS_REGULAR_SEASON_GAMES
    return {
        "regular_games": regular,
        "mlb_month_games": MLB_MONTH_GAMES,
        "mlb_full_games": MLB_SEASON_GAMES,
        "championship_max_games": regular + SUPERPESIS_MAX_CHAMPIONSHIP_POSTSEASON_GAMES,
        "bronze_max_games": regular + SUPERPESIS_MAX_BRONZE_POSTSEASON_GAMES,
        "full_extrapolation": round(MLB_SEASON_GAMES / max(regular, 1), 1),
    }


def _counting_equivalents(line: dict, context: dict) -> dict:
    games = max(line["games"] or 1, 1)

    def scaled(stat: str, target_games: int) -> int:
        return round(line[stat] * target_games / games)

    return {
        "actual": {"H": line["karkilyonnit"], "HR": line["kunnarit"],
                   "RBI": line["lyodyt"], "HR_RBI": line["kunnarit"] + line["lyodyt"],
                   "R": line["tuodut"], "PROD": line["tehot"]},
        "mlb_month": {"games": context["mlb_month_games"],
                      "H": scaled("karkilyonnit", context["mlb_month_games"]),
                      "HR": scaled("kunnarit", context["mlb_month_games"]),
                      "RBI": scaled("lyodyt", context["mlb_month_games"]),
                      "HR_RBI": round((line["kunnarit"] + line["lyodyt"]) * context["mlb_month_games"] / games),
                      "R": scaled("tuodut", context["mlb_month_games"]),
                      "PROD": round(line["tehot"] * context["mlb_month_games"] / games)},
        "regular_normalized": {"games": context["regular_games"],
                               "H": scaled("karkilyonnit", context["regular_games"]),
                               "HR": scaled("kunnarit", context["regular_games"]),
                               "RBI": scaled("lyodyt", context["regular_games"]),
                               "HR_RBI": round((line["kunnarit"] + line["lyodyt"]) * context["regular_games"] / games),
                               "R": scaled("tuodut", context["regular_games"]),
                               "PROD": round(line["tehot"] * context["regular_games"] / games)},
        "mlb_full_pace": {"games": context["mlb_full_games"],
                          "H": scaled("karkilyonnit", context["mlb_full_games"]),
                          "HR": scaled("kunnarit", context["mlb_full_games"]),
                          "RBI": scaled("lyodyt", context["mlb_full_games"]),
                          "HR_RBI": round((line["kunnarit"] + line["lyodyt"]) * context["mlb_full_games"] / games),
                          "R": scaled("tuodut", context["mlb_full_games"]),
                          "PROD": round(line["tehot"] * context["mlb_full_games"] / games),
                          "extrapolation": round(context["mlb_full_games"] / games, 1)},
    }


def _translated_rows(line: dict) -> list[dict]:
    rows = []
    for m in MAPPINGS:
        pct = line.get(f"pct_{m['stat']}")
        value = line.get(m["stat"])
        if pct is None or value is None:
            continue
        mlb = _quantile_value(pct, m["mean"], m["sd"], m["dir"])
        rows.append({"pesis_label": m["pesis"], "pesis_value": value,
                     "percentile": pct, "mlb_stat": m["mlb"],
                     "mlb_value": format(mlb, m["fmt"]), "mlb_raw": mlb,
                     "blurb": m["blurb"]})
    return rows


def translate_line(line: dict, context: dict) -> dict:
    rows = _translated_rows(line)
    pct_prod = line.get("pct_tehot_per_turn")
    wrc = (round(_quantile_value(pct_prod, 100.0, 25.0, +1))
           if pct_prod is not None else None)
    rowmap = {r["mlb_stat"]: r for r in rows}
    return {"player_id": line["player_id"], "name": line["name"],
            "team": line["team"], "year": line["year"],
            "season_id": line.get("season_id"), "age": line.get("age"),
            "games": line["games"], "qualified": bool(rows), "rows": rows,
            "wrc_plus": wrc, "teho_plus": line["teho_plus"],
            "tier": wrc_tier(wrc) if wrc is not None else None,
            "counting": _counting_equivalents(line, context),
            "pace": _counting_equivalents(line, context)["mlb_full_pace"],
            "context": context,
            "avg_equiv": rowmap.get("AVG", {}).get("mlb_value"),
            "hr600_equiv": rowmap.get("HR / 600 PA", {}).get("mlb_value"),
            "h600_equiv": rowmap.get("H / 600 PA", {}).get("mlb_value"),
            "hr_rbi600_equiv": rowmap.get("HR+RBI / 600 PA", {}).get("mlb_value"),
            "rbi600_equiv": rowmap.get("HR+RBI / 600 PA", {}).get("mlb_value"),
            "r600_equiv": rowmap.get("R / 600 PA", {}).get("mlb_value"),
            "k_pct_equiv": rowmap.get("K%", {}).get("mlb_value")}


def translated_season_lines(conn: sqlite3.Connection, season_id: int) -> list[dict]:
    lines = season_lines(conn, season_id)
    add_percentiles(lines, stats=tuple(m["stat"] for m in MAPPINGS) + ("tehot_per_turn",))
    context = season_game_context(conn, season_id)
    return [translate_line(line, context) for line in lines]


def translate_player(conn: sqlite3.Connection, player_id: int,
                     year: int | None = None) -> dict | None:
    career = player_seasons(conn, player_id)
    if not career:
        return None
    target = next((s for s in career if s["year"] == year), career[-1])
    for translated in translated_season_lines(conn, target["season_id"]):
        if translated["player_id"] == player_id:
            return translated
    return None


def translate_season(conn: sqlite3.Connection, season_id: int,
                     sort: str = "wrc_plus", limit: int = 100) -> list[dict]:
    allowed = {"wrc_plus", "h600_equiv", "avg_equiv", "hr600_equiv",
               "hr_rbi600_equiv", "rbi600_equiv", "r600_equiv",
               "k_pct_equiv", "teho_plus"}
    if sort not in allowed:
        sort = "wrc_plus"
    rows = [r for r in translated_season_lines(conn, season_id) if r["qualified"]]

    def key(row: dict):
        value = row.get(sort)
        if value is None:
            return -9999
        if sort == "k_pct_equiv":
            return -float(str(value).rstrip("%"))
        try:
            return float(value)
        except (TypeError, ValueError):
            return value

    rows.sort(key=key, reverse=True)
    return rows[:limit]
