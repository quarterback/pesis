"""Situational hitting from play-by-play: lyödyt against the situations faced.

Lyödyt is the sum of two things — how well a player hits, and what base
situations the player gets to hit in. Measured over the 2026 men's Superpesis,
94 % of the variation between players in raw lyödyt is explained by the
situations alone, so a plate appearance with the bases loaded is worth roughly
a hundred times more lyödyt than one with the bases empty regardless of who
is batting.

This module measures the other half. For every plate appearance it looks up
what the league produces on average from that exact (bases, outs) state; the
season sum is the player's expected lyödyt, and the difference between actual
and expected is what the player did with the chances they got.

LYO (Lyödyt Yli Odotetun) is that difference. It is not a value stat and does
not replace lyödyt — a run driven home counts the same for the team however
easy it was. It answers one question, and it is the pesäpallo generalization
of hitting with runners in scoring position: the official scoresheet flags
only third-base situations, while the event stream gives all 24.

Attribution note: a lyöty is a run that came from the batter's own hit.
Kunnarit are their own category, runs scored on a harhaheitto belong to the
defense's mistake, and runs forced in by a vapaataival are not batted home.
Counted this way the totals reconcile with the official box scores to 0.2 %
at league level (43 of 45 players exact).
"""

from __future__ import annotations

import sqlite3

# Runs on these plays are not lyödyt for the batter at the plate.
_NOT_BATTED_HOME = ("homerun", "advance_error", "walk")

# Below this many plate appearances a season's own table is too thin to use.
MIN_PA = 2000


def plate_appearances(conn: sqlite3.Connection, season_id: int) -> list[dict]:
    """One row per regulation plate appearance: batter, state, runs driven in."""
    rows = conn.execute(
        """SELECT batter_id, action, runs, outs_before, base_state_before
           FROM plays
           WHERE season_id = ? AND period < 2
           ORDER BY match_id, seq""", (season_id,)).fetchall()
    pas: list[dict] = []
    cur: dict | None = None
    for r in rows:
        if r["action"] == "at_bat":
            if cur is not None:
                pas.append(cur)
            cur = {"batter": r["batter_id"], "state": r["base_state_before"],
                   "outs": min(r["outs_before"], 2), "rbi": 0}
        elif cur is not None and r["action"] not in _NOT_BATTED_HOME:
            cur["rbi"] += r["runs"] or 0
    if cur is not None:
        pas.append(cur)
    return pas


def expected_table(pas: list[dict]) -> dict:
    """{(bases, outs): expected lyödyt per plate appearance} for the league."""
    acc: dict = {}
    for p in pas:
        key = (p["state"], p["outs"])
        n, s = acc.get(key, (0, 0))
        acc[key] = (n + 1, s + p["rbi"])
    return {k: s / n for k, (n, s) in acc.items() if n}


def situational_lines(conn: sqlite3.Connection, season_id: int) -> dict:
    """{player_id: {lyodyt_pbp, lyodyt_exp, lyodyt_oe, situational_pa}}.
    Empty when the season has too little play-by-play to stand on."""
    pas = plate_appearances(conn, season_id)
    if len(pas) < MIN_PA:
        return {}
    table = expected_table(pas)
    out: dict = {}
    for p in pas:
        pid = p["batter"]
        if pid is None:
            continue
        d = out.setdefault(pid, {"lyodyt_pbp": 0, "lyodyt_exp": 0.0,
                                 "situational_pa": 0})
        d["lyodyt_pbp"] += p["rbi"]
        d["lyodyt_exp"] += table.get((p["state"], p["outs"]), 0.0)
        d["situational_pa"] += 1
    for d in out.values():
        d["lyodyt_oe"] = round(d["lyodyt_pbp"] - d["lyodyt_exp"], 1)
        d["lyodyt_exp"] = round(d["lyodyt_exp"], 1)
    return out


# ── How far the batter himself got ─────────────────────────────────────────
# Pesäpallo does have singles, doubles and home runs — a kunnari leaves the
# batter on third, so it is in effect a triple. They are simply not counted
# as separate categories, because a batter may spend up to three strikes
# moving runners and the hit-to-base relationship is not one-to-one. The
# event stream does record the batter's own advances, so the distance he
# reached in a batting turn is recoverable.
#
# Measured over the 2026 men's Superpesis: 54 % of turns end with the batter
# on first, 1.5 % on second and 0.7 % on a kunnari. The kunnari count derived
# this way is 151 against 152 in the official box scores.

_REACH_ACTIONS = ("advance", "advance_error", "walk", "homerun")


def batter_reach(conn: sqlite3.Connection, season_id: int) -> dict:
    """{player_id: {turns, reach1, reach2, reach3, reach_pct, xb_pct}}.

    ``reach_pct`` is the share of batting turns that end with the batter safe
    on a base — pesäpallo's on-base percentage, which the official stat line
    does not carry. ``xb_pct`` is the share reaching beyond first.
    """
    rows = conn.execute(
        """SELECT batter_id, actor_id, action, to_base FROM plays
           WHERE season_id = ? AND period < 2
           ORDER BY match_id, seq""", (season_id,)).fetchall()
    turns: list[dict] = []
    cur: dict | None = None
    for r in rows:
        if r["action"] == "at_bat":
            if cur is not None:
                turns.append(cur)
            cur = {"batter": r["batter_id"], "reach": 0, "hr": False}
        elif cur is not None and r["actor_id"] is not None \
                and r["actor_id"] == cur["batter"]:
            if r["action"] in _REACH_ACTIONS and r["to_base"]:
                # to_base 4 is kotipesä; as a batter's own reach that is third
                cur["reach"] = max(cur["reach"], 3 if r["to_base"] >= 3
                                   else r["to_base"])
            if r["action"] == "homerun":
                cur["hr"] = True
                cur["reach"] = 3
    if cur is not None:
        turns.append(cur)
    if len(turns) < MIN_PA:
        return {}

    out: dict = {}
    for t in turns:
        pid = t["batter"]
        if pid is None:
            continue
        d = out.setdefault(pid, {"turns": 0, "reach1": 0, "reach2": 0,
                                 "reach3": 0})
        d["turns"] += 1
        if t["hr"] or t["reach"] >= 3:
            d["reach3"] += 1
        elif t["reach"] == 2:
            d["reach2"] += 1
        elif t["reach"] == 1:
            d["reach1"] += 1
    for d in out.values():
        on = d["reach1"] + d["reach2"] + d["reach3"]
        xb = d["reach2"] + d["reach3"]
        d["reach_pct"] = round(on / d["turns"], 3) if d["turns"] else None
        d["xb_pct"] = round(xb / d["turns"], 3) if d["turns"] else None
    return out


def reach_distribution(conn: sqlite3.Connection, season_id: int) -> dict | None:
    """League-wide shares of how far batters get. Doubles and kunnarit are far
    too rare to rank players by (the season leader has about a dozen), but the
    league split is worth publishing — it is the answer to how often a
    pesäpallo batting turn produces the equivalent of a single or a double."""
    per_player = batter_reach(conn, season_id)
    if not per_player:
        return None
    tot = {k: sum(d[k] for d in per_player.values())
           for k in ("turns", "reach1", "reach2", "reach3")}
    n = tot["turns"]
    if not n:
        return None
    on = tot["reach1"] + tot["reach2"] + tot["reach3"]
    return {
        "turns": n,
        "reach1": tot["reach1"], "reach2": tot["reach2"], "reach3": tot["reach3"],
        "reach1_pct": round(100 * tot["reach1"] / n, 1),
        "reach2_pct": round(100 * tot["reach2"] / n, 1),
        "reach3_pct": round(100 * tot["reach3"] / n, 1),
        "reach_pct": round(100 * on / n, 1),
    }


def add_situational(conn: sqlite3.Connection, season_id: int,
                    lines: list[dict]) -> None:
    """Attach the play-by-play batting stats (LYO plus batter reach) to season
    lines. No-op for seasons without play-by-play."""
    per_player = situational_lines(conn, season_id)
    reach = batter_reach(conn, season_id)
    for line in lines:
        pid = line.get("player_id")
        d = per_player.get(pid)
        line["lyodyt_exp"] = d["lyodyt_exp"] if d else None
        line["lyodyt_oe"] = d["lyodyt_oe"] if d else None
        line["situational_pa"] = d["situational_pa"] if d else None
        r = reach.get(pid)
        # xb_pct stays off the player line: doubles and kunnarit are too rare
        # to rank on, and the league split is exported separately instead.
        for f in ("reach1", "reach2", "reach3", "reach_pct"):
            line[f] = r[f] if r else None
