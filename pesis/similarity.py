"""Similarity scores — Baseball-Reference-style player comps.

Answers "who does this season look like?" by nearest neighbor over z-scored
rate stats plus age. Distances are computed within the pool of qualified
season lines across every season in the store, so a 2026 season can comp to a
1994 one once real history is backfilled.

Score presentation follows B-Ref's convention: 1000 = identical, minus points
per unit of distance, floor 0.
"""

from __future__ import annotations

import math
import sqlite3

from .metrics import QUALIFY_TURNS, season_lines

FEATURES = ("kl_pct", "saatto_pct", "eten_pct", "kunnari_rate",
            "lyoty_rate", "palo_rate", "tehot_per_turn")
AGE_WEIGHT = 0.5  # age counts, but half as much as a skill z-score


def _pool(conn: sqlite3.Connection) -> list[dict]:
    lines = []
    for sid, in conn.execute("SELECT id FROM seasons").fetchall():
        for line in season_lines(conn, sid):
            if line["turns_at_bat"] >= QUALIFY_TURNS and line.get("age"):
                line["season_id"] = sid
                lines.append(line)
    return lines


def _zscale(pool: list[dict]) -> dict[str, tuple[float, float]]:
    scale = {}
    for feat in FEATURES + ("age",):
        vals = [l[feat] for l in pool if l.get(feat) is not None]
        mean = sum(vals) / len(vals)
        sd = math.sqrt(sum((v - mean) ** 2 for v in vals) / len(vals)) or 1.0
        scale[feat] = (mean, sd)
    return scale


def _distance(a: dict, b: dict, scale: dict) -> float | None:
    total = 0.0
    for feat in FEATURES:
        if a.get(feat) is None or b.get(feat) is None:
            return None
        mean, sd = scale[feat]
        total += ((a[feat] - b[feat]) / sd) ** 2
    mean, sd = scale["age"]
    total += (AGE_WEIGHT * (a["age"] - b["age"]) / sd) ** 2
    return math.sqrt(total)


def comps(conn: sqlite3.Connection, player_id: int, year: int | None = None,
          limit: int = 5) -> list[dict]:
    """Closest qualified season lines to the player's (latest or given) season.

    Other seasons by the same player are excluded — "you at 24" is trivia,
    not a comp.
    """
    pool = _pool(conn)
    mine = [l for l in pool if l["player_id"] == player_id
            and (year is None or l["year"] == year)]
    if not mine:
        return []
    target = max(mine, key=lambda l: l["year"])
    scale = _zscale(pool)

    scored = []
    for line in pool:
        if line["player_id"] == player_id:
            continue
        d = _distance(target, line, scale)
        if d is None:
            continue
        scored.append({"player_id": line["player_id"], "name": line["name"],
                       "year": line["year"], "age": line["age"],
                       "team": line["team"], "teho_plus": line["teho_plus"],
                       "score": max(0, round(1000 - 100 * d))})
    scored.sort(key=lambda c: c["score"], reverse=True)
    return scored[:limit]
