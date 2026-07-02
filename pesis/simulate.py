"""Standings and Monte Carlo playoff odds — the FanGraphs front page.

Team strength is the average run differential per match up to the cutoff
date, shrunk toward 0 by a games-based prior. A future match's margin is
modeled as Normal(strength difference + home edge, sigma of observed
margins); simulating the unplayed schedule a few thousand times yields
playoff odds. Deliberately model-light: once TAHKO-aggregated rosters exist
this is where they plug in.

Points: 2 for a win, 1 for a tie, 0 for a loss. (Real Superpesis resolves
even matches with a supervuoro for 2–1 points; the demo league has no
periods, so ties stand. The real ingest keeps per-jakso scores in the match
payload, so the true rule can land here later.)
"""

from __future__ import annotations

import math
import random
import sqlite3

STRENGTH_PRIOR_GAMES = 6
HOME_EDGE = 0.3          # runs — crude, refit on real data
PLAYOFF_SPOTS = 4


def _matches(conn: sqlite3.Connection, season_id: int) -> list[sqlite3.Row]:
    return conn.execute(
        "SELECT * FROM matches WHERE season_id = ? ORDER BY date, id",
        (season_id,)).fetchall()


def standings(conn: sqlite3.Connection, season_id: int,
              as_of: str | None = None) -> list[dict]:
    table: dict[str, dict] = {}
    for m in _matches(conn, season_id):
        for team in (m["home_team"], m["away_team"]):
            table.setdefault(team, {"team": team, "games": 0, "wins": 0,
                                    "ties": 0, "losses": 0, "points": 0,
                                    "runs_for": 0, "runs_against": 0})
        if as_of and m["date"] > as_of:
            continue
        home, away = table[m["home_team"]], table[m["away_team"]]
        hr, ar = m["home_runs"], m["away_runs"]
        for side, rf, ra in ((home, hr, ar), (away, ar, hr)):
            side["games"] += 1
            side["runs_for"] += rf
            side["runs_against"] += ra
            if rf > ra:
                side["wins"] += 1
                side["points"] += 2
            elif rf == ra:
                side["ties"] += 1
                side["points"] += 1
            else:
                side["losses"] += 1
    out = sorted(table.values(),
                 key=lambda t: (t["points"], t["runs_for"] - t["runs_against"]),
                 reverse=True)
    for t in out:
        t["run_diff"] = t["runs_for"] - t["runs_against"]
    return out


def _strengths(rows: list[dict]) -> dict[str, float]:
    return {
        t["team"]: (t["run_diff"] / t["games"]) * t["games"]
                   / (t["games"] + STRENGTH_PRIOR_GAMES) if t["games"] else 0.0
        for t in rows
    }


def _margin_sigma(conn: sqlite3.Connection, season_id: int,
                  as_of: str | None) -> float:
    margins = [m["home_runs"] - m["away_runs"]
               for m in _matches(conn, season_id)
               if not (as_of and m["date"] > as_of)]
    if len(margins) < 2:
        return 5.0
    mean = sum(margins) / len(margins)
    return max(1.0, math.sqrt(sum((x - mean) ** 2 for x in margins)
                              / (len(margins) - 1)))


def playoff_odds(conn: sqlite3.Connection, season_id: int,
                 as_of: str | None = None, sims: int = 2000,
                 seed: int = 1, spots: int = PLAYOFF_SPOTS) -> list[dict]:
    """Simulate the remaining schedule; return standings rows with an
    ``odds`` key (probability of a top-``spots`` finish, in %)."""
    rng = random.Random(seed)
    current = standings(conn, season_id, as_of)
    strength = _strengths(current)
    sigma = _margin_sigma(conn, season_id, as_of)
    remaining = [m for m in _matches(conn, season_id)
                 if as_of and m["date"] > as_of]
    base_points = {t["team"]: t["points"] for t in current}
    base_diff = {t["team"]: t["run_diff"] for t in current}

    made = {t["team"]: 0 for t in current}
    for _ in range(sims):
        points = dict(base_points)
        diff = dict(base_diff)
        for m in remaining:
            mu = strength[m["home_team"]] - strength[m["away_team"]] + HOME_EDGE
            margin = rng.gauss(mu, sigma)
            runs = max(-25, min(25, round(margin)))
            if runs > 0:
                points[m["home_team"]] += 2
            elif runs < 0:
                points[m["away_team"]] += 2
            else:
                points[m["home_team"]] += 1
                points[m["away_team"]] += 1
            diff[m["home_team"]] += runs
            diff[m["away_team"]] -= runs
        order = sorted(points, key=lambda t: (points[t], diff[t], rng.random()),
                       reverse=True)
        for team in order[:spots]:
            made[team] += 1

    for t in current:
        t["odds"] = round(100 * made[t["team"]] / sims, 1)
        t["remaining"] = sum(1 for m in remaining
                             if t["team"] in (m["home_team"], m["away_team"]))
    return current
