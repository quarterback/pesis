"""Player projections — daily-updating true-talent estimates per rate stat.

Named literally on purpose (owner call: stat names follow the WAR/OPS+
convention — descriptive, no backronyms; an earlier cute name collided with
Tahko, an actual Superpesis club). Methodologically this is a DARKO
transplant, and the core question is DARKO's: how much of a hot or cold
stretch is a real talent change, and how much is noise?

The v0 model is deliberately the simplest thing that is honest:

1. **Exponential decay** — every game a player has ever played counts,
   weighted by ``beta ** days_ago``. No arbitrary "last N games" endpoint.
   Each stat gets its own beta: sticky skills (kärkilyönti-%) decay slowly,
   volatile ones faster.
2. **Empirical-Bayes regression** — the decayed observed rate is blended with
   the league mean, with a per-stat prior strength expressed in
   pseudo-attempts. Small samples land near league average; large samples
   trust the player. This is the steady-state Kalman estimate for a
   random-walk talent model, which is why the K is in the name.
3. **Aging** — a delta-method curve per stat, estimated from consecutive
   season pairs, nudges the estimate for where the player is on the arc.

``fit_decay`` tunes beta and the prior strength per stat by walk-forward
forecast error over the whole history — the same way DARKO selects its decay
constants (theirs via differential evolution; a grid is fine at our scale).

Deliberately absent from v0 (see docs/design.md): opponent adjustments,
home/away/weather effects, gradient-boosted blending, per-base kärkilyönti
splits. The upstream API has the data for all of them.
"""

from __future__ import annotations

import datetime
import sqlite3
from dataclasses import dataclass, replace

from .metrics import RATES, league_rates, season_lines


@dataclass(frozen=True)
class StatSpec:
    name: str
    num: str            # numerator column in player_games
    den: str            # denominator column
    beta: float         # per-day decay of past evidence
    prior_strength: float  # league-mean pseudo-attempts


DEFAULT_SPECS: tuple[StatSpec, ...] = (
    StatSpec("kl_pct", "karkilyonnit", "karki_yritykset", 0.997, 60.0),
    StatSpec("saatto_pct", "saatot", "saatto_yritykset", 0.996, 40.0),
    StatSpec("eten_pct", "etenemiset", "eteneminen_yritykset", 0.996, 50.0),
    StatSpec("kunnari_rate", "kunnarit", "turns_at_bat", 0.998, 120.0),
    StatSpec("lyoty_rate", "lyodyt", "turns_at_bat", 0.997, 80.0),
    StatSpec("haava_rate", "haavat", "turns_at_bat", 0.995, 100.0),
    StatSpec("palo_rate", "palot", "turns_at_bat", 0.996, 80.0),
)


def _days(d1: str, d2: str) -> int:
    return (datetime.date.fromisoformat(d2) - datetime.date.fromisoformat(d1)).days


def project_stat(games: list[sqlite3.Row | dict], spec: StatSpec,
                 league_mean: float, as_of: str) -> dict:
    """Project one stat from a player's full game log (any order).

    Returns {"rate", "effective_n", "observed"} where effective_n is the
    decayed attempt mass actually backing the estimate.
    """
    num_sum = 0.0
    den_sum = 0.0
    for g in games:
        if g["date"] > as_of:
            continue
        w = spec.beta ** _days(g["date"], as_of)
        num_sum += w * g[spec.num]
        den_sum += w * g[spec.den]
    rate = ((num_sum + spec.prior_strength * league_mean)
            / (den_sum + spec.prior_strength))
    return {
        "rate": rate,
        "effective_n": den_sum,
        "observed": num_sum / den_sum if den_sum else None,
    }


def latest_league_means(conn: sqlite3.Connection) -> dict[str, float]:
    """Priors from the most recent season in the store."""
    sid = conn.execute(
        "SELECT id FROM seasons ORDER BY year DESC LIMIT 1").fetchone()
    return league_rates(season_lines(conn, sid[0])) if sid else {}


def game_log(conn: sqlite3.Connection, player_id: int) -> list[sqlite3.Row]:
    return conn.execute(
        "SELECT * FROM player_games WHERE player_id = ? ORDER BY date",
        (player_id,)).fetchall()


def project_player(conn: sqlite3.Connection, player_id: int,
                   as_of: str | None = None,
                   specs: tuple[StatSpec, ...] = DEFAULT_SPECS,
                   league: dict[str, float] | None = None,
                   aging: dict[str, dict[int, float]] | None = None) -> dict:
    """Projection line for one player: every spec'd stat as of ``as_of`` (default:
    day after their last game), plus a projected TEHO+ style composite."""
    games = game_log(conn, player_id)
    league = league or latest_league_means(conn)
    if not as_of:
        last = games[-1]["date"] if games else datetime.date.today().isoformat()
        as_of = (datetime.date.fromisoformat(last)
                 + datetime.timedelta(days=1)).isoformat()

    player = conn.execute("SELECT * FROM players WHERE id = ?",
                          (player_id,)).fetchone()
    age = (int(as_of[:4]) - player["born_year"]) if player and player["born_year"] else None

    out = {"player_id": player_id, "name": player["name"] if player else None,
           "as_of": as_of, "age": age, "stats": {}}
    for spec in specs:
        proj = project_stat(games, spec, league.get(spec.name, 0.0), as_of)
        if aging and age is not None:
            proj["rate"] = max(0.0, proj["rate"] + aging.get(spec.name, {}).get(age, 0.0))
        out["stats"][spec.name] = proj

    # composite: projected production per turn, indexed like TEHO+
    s = out["stats"]
    tpt = s["kunnari_rate"]["rate"] + s["lyoty_rate"]["rate"] + _tuotu_proxy(s)
    league_tpt = league.get("tehot_per_turn")
    out["teho_plus_proj"] = round(100 * tpt / league_tpt) if league_tpt else None
    return out


def _tuotu_proxy(stats: dict) -> float:
    """Tuodut are earned as a runner, whose exposure isn't turns at bat; proxy
    the per-turn contribution via etenemis-skill scaled to the league shape.
    Kept crude on purpose in v0 — a real tuotu model needs the PBP base states."""
    return stats["eten_pct"]["rate"] * 0.3


def fit_decay(conn: sqlite3.Connection, spec: StatSpec,
              betas: tuple[float, ...] = (0.985, 0.99, 0.994, 0.997, 0.999),
              strengths: tuple[float, ...] = (20.0, 50.0, 100.0, 200.0),
              league_mean: float | None = None) -> StatSpec:
    """Walk-forward tune (beta, prior_strength) for one stat.

    For every player-game in chronological order, predict the game's rate from
    strictly earlier games, and score attempt-weighted squared error. Returns
    the spec with the best-scoring hyperparameters. O(games × grid).
    """
    if league_mean is None:
        league_mean = latest_league_means(conn).get(spec.name, 0.0)
    logs: dict[int, list] = {}
    for row in conn.execute(
            f"SELECT player_id, date, {spec.num} AS n, {spec.den} AS d "
            f"FROM player_games ORDER BY player_id, date"):
        logs.setdefault(row["player_id"], []).append(row)

    best, best_err = spec, float("inf")
    for beta in betas:
        for k in strengths:
            err = weight = 0.0
            for games in logs.values():
                num_sum = den_sum = 0.0
                prev_date = None
                for g in games:
                    if prev_date is not None:
                        decay = beta ** _days(prev_date, g["date"])
                        num_sum *= decay
                        den_sum *= decay
                    if g["d"]:
                        pred = (num_sum + k * league_mean) / (den_sum + k)
                        err += g["d"] * (pred - g["n"] / g["d"]) ** 2
                        weight += g["d"]
                    num_sum += g["n"]
                    den_sum += g["d"]
                    prev_date = g["date"]
            score = err / weight if weight else float("inf")
            if score < best_err:
                best_err, best = score, replace(spec, beta=beta, prior_strength=k)
    return best


def aging_curve(conn: sqlite3.Connection, stat: str,
                min_den: int = 30) -> dict[int, float]:
    """Delta-method curve: mean year-over-year change in a rate, by age.

    Pairs each player's consecutive seasons, weights by the smaller attempt
    count (the classic Tango approach). Returns {age_entering_season: delta}.
    Survivorship bias is NOT corrected in v0 — flagged in docs/design.md.
    """
    num, den = RATES[stat]
    rows = conn.execute(
        f"""SELECT pg.player_id, s.year, p.born_year,
                   SUM({num}) AS n, SUM({den}) AS d
            FROM player_games pg
            JOIN seasons s ON s.id = pg.season_id
            JOIN players p ON p.id = pg.player_id
            WHERE p.born_year IS NOT NULL
            GROUP BY pg.player_id, s.year ORDER BY pg.player_id, s.year"""
    ).fetchall()

    sums: dict[int, list[float]] = {}
    prev = None
    for r in rows:
        if (prev and r["player_id"] == prev["player_id"]
                and r["year"] == prev["year"] + 1
                and min(r["d"], prev["d"]) >= min_den):
            age = r["year"] - r["born_year"]
            delta = r["n"] / r["d"] - prev["n"] / prev["d"]
            w = min(r["d"], prev["d"])
            bucket = sums.setdefault(age, [0.0, 0.0])
            bucket[0] += w * delta
            bucket[1] += w
        prev = r
    return {age: b[0] / b[1] for age, b in sorted(sums.items()) if b[1]}
