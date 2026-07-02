"""Run environment: park factors (kenttäkerroin) and weather effects.

Pesäpallo is played outdoors in stadiums with real geometric and micro-climate
differences, and — unlike almost any baseball source — the results service
records temperature, wind and rain on every match. Nobody has ever published
park factors or weather effects for the sport.

v0 method, deliberately simple:
    PF(stadium) = (total runs per match at the stadium)
                  / (league total runs per match)
computed over all matches in the given seasons, shrunk toward 1.0 by sample
size (an empirical-Bayes half-strength of ``PF_PRIOR_GAMES`` matches). With a
balanced schedule this is unbiased; the classic team-based home/road method
(which also cancels team quality) is the upgrade once real multi-season data
is in — flagged in docs/design.md.
"""

from __future__ import annotations

import sqlite3

PF_PRIOR_GAMES = 30  # pseudo-matches of league-average evidence

WIND_BUCKETS = ((0.0, 2.0, "tyyni (0–2 m/s)"),
                (2.0, 5.0, "kohtalainen (2–5 m/s)"),
                (5.0, 99.0, "kova (5+ m/s)"))


def park_factors(conn: sqlite3.Connection,
                 season_ids: list[int] | None = None) -> list[dict]:
    """Shrunken run-environment index per stadium; 100 = neutral."""
    where, params = _season_filter(season_ids)
    rows = conn.execute(
        f"""SELECT stadium, COUNT(*) AS games,
                   AVG(home_runs + away_runs) AS rpg
            FROM matches WHERE stadium IS NOT NULL {where}
            GROUP BY stadium""", params).fetchall()
    league = conn.execute(
        f"SELECT AVG(home_runs + away_runs) FROM matches WHERE 1=1 {where}",
        params).fetchone()[0]
    if not league:
        return []
    out = []
    for r in rows:
        raw = r["rpg"] / league
        shrunk = (r["games"] * raw + PF_PRIOR_GAMES * 1.0) / (r["games"] + PF_PRIOR_GAMES)
        out.append({"stadium": r["stadium"], "games": r["games"],
                    "runs_per_game": round(r["rpg"], 2),
                    "pf": round(100 * shrunk)})
    out.sort(key=lambda d: d["pf"], reverse=True)
    return out


def weather_effects(conn: sqlite3.Connection,
                    season_ids: list[int] | None = None) -> list[dict]:
    """League kunnari and run rates by wind bucket.

    Joins player-games to their match's weather. Returns one row per bucket
    with per-turn kunnari rate and runs per match — enough to see (and later
    model) the wind's effect on the long ball.
    """
    where, params = _season_filter(season_ids, alias="m")
    out = []
    for lo, hi, label in WIND_BUCKETS:
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
