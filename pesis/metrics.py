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
                 100 is league average; the league's best run 250–350 (real
                 data: production concentrates at the top of the order).
    TEHO+adj     TEHO+ with each game's production deflated/inflated by the
                 run environment it happened in (the stadium's kenttäkerroin).
                 A short season is rich in recorded context — park, weather,
                 opponent — so the product principle is to *adjust* observed
                 stats for context rather than merely distrust them. Park is
                 the first adjustment; weather and opponent follow.
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
    _add_park_adjusted(conn, season_id, lines)
    return lines


def _add_park_adjusted(conn: sqlite3.Connection, season_id: int,
                       lines: list[dict]) -> None:
    """Attach teho_plus_adj: per-game tehot deflated by the venue's park
    multiplier, re-indexed so the adjusted league average is 100. Without
    match/stadium data every multiplier is 1.0 and adj == raw."""
    from .context import park_factors
    # estimate PF from all seasons of the SAME series (stability), never
    # across series — men's and women's run environments differ
    series = conn.execute("SELECT series FROM seasons WHERE id = ?",
                          (season_id,)).fetchone()
    sids = [r[0] for r in conn.execute(
        "SELECT id FROM seasons WHERE series = ?",
        (series[0] if series else "",))]
    pf = {p["stadium"]: p["pf"] / 100 for p in park_factors(conn, sids or None)}
    mult = {m["id"]: pf.get(m["stadium"], 1.0) for m in conn.execute(
        "SELECT id, stadium FROM matches WHERE season_id = ?", (season_id,))}

    adj_tehot: dict[int, float] = {}
    for r in conn.execute(
            """SELECT player_id, match_id,
                      kunnarit + lyodyt + tuodut AS tehot
               FROM player_games WHERE season_id = ?""", (season_id,)):
        adj_tehot[r["player_id"]] = (adj_tehot.get(r["player_id"], 0.0)
                                     + r["tehot"] / mult.get(r["match_id"], 1.0))

    total_turns = sum(l["turns_at_bat"] for l in lines)
    league_adj = (sum(adj_tehot.values()) / total_turns) if total_turns else None
    for line in lines:
        turns = line["turns_at_bat"]
        if not turns or not league_adj:
            line["teho_plus_adj"] = None
            continue
        line["teho_plus_adj"] = round(
            100 * (adj_tehot.get(line["player_id"], 0.0) / turns) / league_adj)


def _league_tehot_per_turn(lines: list[dict]) -> float | None:
    turns = sum(l["turns_at_bat"] for l in lines)
    tehot = sum(l["tehot"] for l in lines)
    return tehot / turns if turns else None


def league_rates(lines: list[dict]) -> dict[str, float]:
    """Attempt-weighted league mean for every rate — the projection priors."""
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
