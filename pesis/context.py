"""Run environment: park factors (kenttäkerroin) and weather effects.

Pesäpallo is played outdoors in stadiums with real geometric and micro-climate
differences, and — unlike almost any baseball source — the results service
records temperature, wind and rain on every match. Nobody has ever published
park factors or weather effects for the sport.

Method: the classic team home/road ratio —
    PF(stadium) = (runs per match in the home team's HOME games)
                  / (runs per match in that same team's ROAD games)
shrunk toward 1.0 by sample size (``PF_PRIOR_GAMES`` pseudo-matches). Because
the same team contributes to both totals, team quality cancels to first
order; a naive "runs at stadium ÷ league" version was tried first and was
visibly confounded by good-hitting home teams. Assumes one home stadium per
team (true in Superpesis; revisit for shared/tournament venues).
"""

from __future__ import annotations

import sqlite3

PF_PRIOR_GAMES = 30  # pseudo-matches of league-average evidence

WIND_BUCKETS = ((0.0, 2.0, "tyyni (0–2 m/s)"),
                (2.0, 5.0, "kohtalainen (2–5 m/s)"),
                (5.0, 99.0, "kova (5+ m/s)"))

# real pesistulokset data records wind as a 0/1 flag, not m/s
FLAG_BUCKETS = ((0.0, 0.5, "tuuleton"), (0.5, 99.0, "tuulinen"))


def park_factors(conn: sqlite3.Connection,
                 season_ids: list[int] | None = None) -> list[dict]:
    """Shrunken run-environment index per stadium; 100 = neutral."""
    where, params = _season_filter(season_ids)
    home = {r["team"]: r for r in conn.execute(
        f"""SELECT home_team AS team, MAX(stadium) AS stadium,
                   COUNT(*) AS games, AVG(home_runs + away_runs) AS rpg
            FROM matches WHERE stadium IS NOT NULL {where}
            GROUP BY home_team""", params)}
    road = {r["team"]: r["rpg"] for r in conn.execute(
        f"""SELECT away_team AS team, AVG(home_runs + away_runs) AS rpg
            FROM matches WHERE 1=1 {where} GROUP BY away_team""", params)}
    # One candidate row per home team first (PF is a home/road comparison),
    # then merge rows that share a stadium name — several teams play in
    # identically named parks and upstream strings drift in whitespace, so
    # an ungrouped list shows visual duplicates.
    per_team = []
    for team, h in home.items():
        road_rpg = road.get(team)
        if not road_rpg:
            continue
        raw = h["rpg"] / road_rpg
        shrunk = (h["games"] * raw + PF_PRIOR_GAMES * 1.0) / (h["games"] + PF_PRIOR_GAMES)
        per_team.append({"stadium": " ".join((h["stadium"] or "").split()),
                         "team": team, "games": h["games"],
                         "rpg": h["rpg"], "pf100": 100 * shrunk})
    merged: dict[str, dict] = {}
    for r in per_team:
        m = merged.setdefault(r["stadium"].casefold(), {
            "stadium": r["stadium"], "team": r["team"],
            "games": 0, "rpg_sum": 0.0, "pf_sum": 0.0})
        m["games"] += r["games"]
        m["rpg_sum"] += r["rpg"] * r["games"]
        m["pf_sum"] += r["pf100"] * r["games"]
    out = [{"stadium": m["stadium"], "team": m["team"], "games": m["games"],
            "runs_per_game": round(m["rpg_sum"] / m["games"], 2),
            "pf": round(m["pf_sum"] / m["games"])}
           for m in merged.values() if m["games"]]
    out.sort(key=lambda d: d["pf"], reverse=True)
    return out


def weather_effects(conn: sqlite3.Connection,
                    season_ids: list[int] | None = None) -> list[dict]:
    """League kunnari and run rates by wind bucket.

    Joins player-games to their match's weather. Returns one row per bucket
    with per-turn kunnari rate and runs per match — enough to see (and later
    model) the wind's effect on the long ball. Detects flag-style (0/1) wind
    data and switches to two buckets.
    """
    where, params = _season_filter(season_ids, alias="m")
    max_wind = conn.execute(
        f"SELECT MAX(wind) FROM matches m WHERE wind IS NOT NULL {where}",
        params).fetchone()[0]
    buckets = FLAG_BUCKETS if (max_wind is not None and max_wind <= 1) else WIND_BUCKETS
    out = []
    for lo, hi, label in buckets:
        r = conn.execute(
            f"""SELECT COUNT(DISTINCT m.id) AS games,
                       SUM(pg.kunnarit) AS k, SUM(pg.turns_at_bat) AS turns,
                       AVG(m.home_runs + m.away_runs) AS rpg
                FROM matches m
                JOIN player_games pg ON pg.match_id = m.id
                WHERE m.wind >= ? AND m.wind < ? {where}""",
            (lo, hi, *params)).fetchone()
        if not r["turns"]:
            continue
        out.append({"wind": label, "games": r["games"],
                    "kunnari_rate": round(r["k"] / r["turns"], 4),
                    "runs_per_game": round(r["rpg"], 2)})
    return out


def _season_filter(season_ids, alias: str = "") -> tuple[str, list]:
    if not season_ids:
        return "", []
    col = f"{alias + '.' if alias else ''}season_id"
    return f" AND {col} IN ({','.join('?' * len(season_ids))})", list(season_ids)
