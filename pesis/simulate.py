"""Standings and Monte Carlo playoff odds — the FanGraphs front page.

Team strength is the average run differential per match up to the cutoff
date, shrunk toward 0 by a games-based prior. A future match's margin is
modeled as Normal(strength difference + home edge, sigma of observed
margins); simulating the unplayed schedule a few thousand times yields
playoff odds. Deliberately model-light: once projection-aggregated rosters exist
this is where they plug in.

Points — the real Superpesis rule, validated EXACTLY against the official
result-board 3p/2p/1p/0p counts for both 2026 leagues (24/24 teams):
    3  clean win, both periods won (2–0)
    2  any other win: via supervuoro/kotiutuslyöntikilpailu (2–1, or 1–0/0–1
       decided in the tiebreak) or with a drawn period (1–0 without tiebreak
       — periods CAN be drawn)
    1  loss where a tiebreak was actually played
    0  straight loss (0–2, or 0–1 with a drawn period and no tiebreak)
Matches are decided by JAKSOT, not total runs — a team can win while losing
the run count, which is why standings must never be computed from run
totals. The synthetic demo league has no periods; those matches fall back to
a simple 2/1/0 win/tie/loss on runs.
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


def _blank(team: str) -> dict:
    return {"team": team, "games": 0, "wins": 0, "super_wins": 0,
            "super_losses": 0, "ties": 0, "losses": 0, "points": 0,
            "runs_for": 0, "runs_against": 0}


def _score_match(home: dict, away: dict, m: sqlite3.Row) -> None:
    hr, ar = m["home_runs"], m["away_runs"]
    for side, rf, ra in ((home, hr, ar), (away, ar, hr)):
        side["games"] += 1
        side["runs_for"] += rf
        side["runs_against"] += ra

    ph, pa = m["periods_home"], m["periods_away"]
    if ph is not None and pa is not None and ph != pa:
        winner, loser = (home, away) if ph > pa else (away, home)
        winner["wins"] += 1
        loser["losses"] += 1
        if max(ph, pa) == 2 and min(ph, pa) == 0:   # clean 2-0
            winner["points"] += 3
        else:
            winner["points"] += 2
            winner["super_wins"] += 1
        if m["tiebreak"]:
            loser["super_losses"] += 1
            loser["points"] += 1
        return

    # no period data (demo league): simple 2/1/0 on runs
    if hr > ar:
        home["wins"] += 1
        home["points"] += 2
        away["losses"] += 1
    elif hr < ar:
        away["wins"] += 1
        away["points"] += 2
        home["losses"] += 1
    else:
        home["ties"] += 1
        away["ties"] += 1
        home["points"] += 1
        away["points"] += 1


def standings(conn: sqlite3.Connection, season_id: int,
              as_of: str | None = None) -> list[dict]:
    table: dict[str, dict] = {}
    for m in _matches(conn, season_id):
        for team in (m["home_team"], m["away_team"]):
            table.setdefault(team, _blank(team))
        if as_of and m["date"] > as_of:
            continue
        _score_match(table[m["home_team"]], table[m["away_team"]], m)
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
    played = [m for m in _matches(conn, season_id)
              if not (as_of and m["date"] > as_of)]
    remaining = [m for m in _matches(conn, season_id)
                 if as_of and m["date"] > as_of]
    base_points = {t["team"]: t["points"] for t in current}
    base_diff = {t["team"]: t["run_diff"] for t in current}

    # real rule (3/2/1/0) applies when the season records periods; empirical
    # shares of clean wins and tiebreaks calibrate the simulated outcomes
    period_matches = [m for m in played
                      if m["periods_home"] is not None and m["periods_away"] is not None
                      and m["periods_home"] != m["periods_away"]]
    use_periods = bool(period_matches)
    n_pm = len(period_matches) or 1
    p_clean = sum(1 for m in period_matches
                  if max(m["periods_home"], m["periods_away"]) == 2
                  and min(m["periods_home"], m["periods_away"]) == 0) / n_pm
    p_tiebreak = sum(1 for m in period_matches if m["tiebreak"]) / n_pm

    made = {t["team"]: 0 for t in current}
    for _ in range(sims):
        points = dict(base_points)
        diff = dict(base_diff)
        for m in remaining:
            mu = strength[m["home_team"]] - strength[m["away_team"]] + HOME_EDGE
            margin = rng.gauss(mu, sigma)
            runs = max(-25, min(25, round(margin)))
            if use_periods:
                winner, loser = ((m["home_team"], m["away_team"]) if margin >= 0
                                 else (m["away_team"], m["home_team"]))
                roll = rng.random()
                if roll < p_clean:
                    points[winner] += 3
                elif roll < p_clean + p_tiebreak:
                    points[winner] += 2
                    points[loser] += 1
                else:                      # won with a drawn period, no tiebreak
                    points[winner] += 2
            elif runs > 0:
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
