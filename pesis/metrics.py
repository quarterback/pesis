"""Pesäpallo rate stats, league baselines, TEHO+ and percentiles.

Finnish sources publish counting stats (kunnarit, lyödyt, tuodut, tehot) and a
few success percentages. This layer adds what the sabermetric canon adds to
baseball: honest denominators, league context, and era adjustment.

Key definitions
    tehot        K + L + T — the traditional headline "production" stat
    KL%          kärkilyönnit / yritykset — the core batting skill rate
    saatto-%     saatot / yritykset
    etenemis-%   etenemiset / yritykset (runner skill)
    palo-%       palot / turns at bat (negative — like strikeout rate)
    TEHO+        100 × (player tehot per turn) / (league tehot per turn):
                 era/league-adjusted production index in the spirit of OPS+ —
                 100 is league average, 150 is an MVP season.
"""

from __future__ import annotations

import sqlite3

COUNTING = ["turns_at_bat", "kunnarit", "lyodyt", "tuodut",
            "karkilyonnit", "karki_yritykset", "saatot", "saatto_yritykset",
            "etenemiset", "eteneminen_yritykset", "haavat", "palot"]

# rate name -> (numerator column, denominator column)
RATES = {
    "kl_pct": ("karkilyonnit", "karki_yritykset"),
    "saatto_pct": ("saatot", "saatto_yritykset"),
    "eten_pct": ("etenemiset", "eteneminen_yritykset"),
    "kunnari_rate": ("kunnarit", "turns_at_bat"),
    "lyoty_rate": ("lyodyt", "turns_at_bat"),
    "tuotu_rate": ("tuodut", "eteneminen_yritykset"),
    "haava_rate": ("haavat", "turns_at_bat"),
    "palo_rate": ("palot", "turns_at_bat"),
}

# stats where lower is better (percentiles are flipped)
NEGATIVE = {"haava_rate", "palo_rate"}

QUALIFY_TURNS = 40  # min turns at bat for leaderboards / percentiles


def season_lines(conn: sqlite3.Connection, season_id: int) -> list[dict]:
    """One aggregate line per player for a season, with rates and TEHO+."""
    sums = ", ".join(f"SUM({c}) AS {c}" for c in COUNTING)
    rows = conn.execute(
        f"""SELECT pg.player_id, p.name, p.born_year, s.year,
                   COUNT(*) AS games, MAX(pg.team) AS team, {sums}
            FROM player_games pg
            JOIN players p ON p.id = pg.player_id
            JOIN seasons s ON s.id = pg.season_id
            WHERE pg.season_id = ?
            GROUP BY pg.player_id""",
        (season_id,),
    ).fetchall()

    lines = []
    for r in rows:
        line = dict(r)
        line["tehot"] = line["kunnarit"] + line["lyodyt"] + line["tuodut"]
        if line["born_year"]:
            line["age"] = line["year"] - line["born_year"]
        for rate, (num, den) in RATES.items():
            line[rate] = line[num] / line[den] if line[den] else None
        line["tehot_per_turn"] = (
            line["tehot"] / line["turns_at_bat"] if line["turns_at_bat"] else None
        )
        lines.append(line)

    league_tpt = _league_tehot_per_turn(lines)
    for line in lines:
        line["teho_plus"] = (
            round(100 * line["tehot_per_turn"] / league_tpt)
            if line["tehot_per_turn"] is not None and league_tpt else None
        )
    return lines


def _league_tehot_per_turn(lines: list[dict]) -> float | None:
    turns = sum(l["turns_at_bat"] for l in lines)
    tehot = sum(l["tehot"] for l in lines)
    return tehot / turns if turns else None


def league_rates(lines: list[dict]) -> dict[str, float]:
    """Attempt-weighted league mean for every rate — the TAHKO priors."""
    out = {}
    for rate, (num, den) in RATES.items():
        d = sum(l[den] for l in lines)
        out[rate] = sum(l[num] for l in lines) / d if d else 0.0
    tpt = _league_tehot_per_turn(lines)
    if tpt is not None:
        out["tehot_per_turn"] = tpt
    return out


def add_percentiles(lines: list[dict],
                    stats: tuple[str, ...] = ("kl_pct", "saatto_pct", "eten_pct",
                                              "kunnari_rate", "lyoty_rate",
                                              "palo_rate", "tehot_per_turn"),
                    min_turns: int = QUALIFY_TURNS) -> None:
    """Attach Savant-style percentile ranks (0–100) among qualified players.

    Mutates ``lines`` in place, adding ``pct_<stat>`` keys; unqualified
    players get None.
    """
    qualified = [l for l in lines if l["turns_at_bat"] >= min_turns]
    for stat in stats:
        values = sorted(l[stat] for l in qualified if l[stat] is not None)
        n = len(values)
        for line in lines:
            v = line.get(stat)
            if line["turns_at_bat"] < min_turns or v is None or n < 2:
                line[f"pct_{stat}"] = None
                continue
            below = sum(x < v for x in values)
            equal = sum(x == v for x in values)
            pct = 100 * (below + 0.5 * equal) / n
            if stat in NEGATIVE:
                pct = 100 - pct
            line[f"pct_{stat}"] = round(pct)


def leaderboard(conn: sqlite3.Connection, season_id: int, stat: str,
                limit: int = 25, min_turns: int = QUALIFY_TURNS) -> list[dict]:
    lines = [l for l in season_lines(conn, season_id)
             if l["turns_at_bat"] >= min_turns and l.get(stat) is not None]
    lines.sort(key=lambda l: l[stat], reverse=stat not in NEGATIVE)
    return lines[:limit]


def player_seasons(conn: sqlite3.Connection, player_id: int) -> list[dict]:
    """Season-by-season lines for one player (career page / trajectories)."""
    season_ids = [r[0] for r in conn.execute(
        "SELECT DISTINCT season_id FROM player_games WHERE player_id = ?",
        (player_id,)).fetchall()]
    out = []
    for sid in season_ids:
        for line in season_lines(conn, sid):
            if line["player_id"] == player_id:
                line["season_id"] = sid
                out.append(line)
    out.sort(key=lambda l: l["year"])
    return out
