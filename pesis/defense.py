"""Run expectancy and defensive metrics from play-by-play data.

Everything here reads the parsed ``plays`` rows (pesis/pbp.py) for seasons
where play-by-play coverage exists. Three layers:

- ``re_table``: the empirical run-expectancy table — expected runs to the end
  of the half from each (base occupancy, outs) state, sampled at every
  in-play delivery. The end of the half is the absorbing event whatever
  caused it (third out, the round rule, a period decision), so the table
  reflects how halves actually end in pesäpallo.
- ``team_defense``: team-level defensive value. The headline number is the
  run-expectancy delta surrendered while defending (runs saved vs average);
  the component columns (koppi rate, out conversion, wild-throw cost, extra
  advances allowed) attribute it to observable fielding events. A koppi is a
  fielding act, not an out — outs come only from explicit palo events.
- ``re24_event_values``: average run value of each offensive event class,
  used by metrics._add_value_stats as JYK/VYK weights when a season has
  enough play-by-play coverage. The batter/runner split of a shared advance
  keeps the documented bridge ratios (60:25 lead, 15:25 trailing) — RE24
  replaces the magnitudes, not the attribution.
"""

from __future__ import annotations

import sqlite3

# Sub-event actions that put the ball in play (the RE sampling points).
DELIVERY_ACTIONS = ("hit", "koppi")
# Runner-movement actions that close over a delivery.
RUNNER_ACTIONS = ("advance", "advance_error", "wound", "out", "out_doubled",
                  "homerun", "walk", "run")

# Minimum coverage before a season trusts its own PBP-derived numbers.
MIN_MATCHES = 30
MIN_DELIVERIES = 3000

# Shrinkage: observations of a (bases, outs) state before the season table
# stands on its own against the same-sex pool.
_SHRINK_K = 50

# Batter/runner split of a shared advance (see module docstring).
_LEAD_BATTER_SHARE = 0.60 / (0.60 + 0.25)
_TRAIL_BATTER_SHARE = 0.15 / (0.15 + 0.25)


def _season_sex(conn: sqlite3.Connection, season_id: int) -> str | None:
    row = conn.execute("SELECT series FROM seasons WHERE id = ?",
                       (season_id,)).fetchone()
    if not row:
        return None
    series = row["series"]
    if series.startswith("Miesten"):
        return "Miesten"
    if series.startswith("Naisten"):
        return "Naisten"
    return None


def _regulation_rows(conn: sqlite3.Connection, season_ids: list[int]) -> list:
    marks = ",".join("?" * len(season_ids))
    return conn.execute(
        f"""SELECT match_id, seq, period, inning, bat_turn, bat_team_id,
                   is_home_bat, actor_id, batter_id, action, from_base,
                   to_base, out, caught, runs, hit_x, hit_y,
                   outs_before, outs_after, base_state_before,
                   base_state_after, pointhits, tailhits, season_id
            FROM plays
            WHERE season_id IN ({marks}) AND period < 2
            ORDER BY match_id, seq""",
        season_ids).fetchall()


def _halves(rows):
    """Yield lists of rows, one per half-inning, in play order."""
    cur_key, cur = None, []
    for r in rows:
        key = (r["match_id"], r["period"], r["inning"], r["bat_turn"])
        if key != cur_key:
            if cur:
                yield cur
            cur_key, cur = key, []
        cur.append(r)
    if cur:
        yield cur


def _state_samples(rows):
    """(state, runs_to_end_of_half) at every in-play delivery."""
    samples = []
    for half in _halves(rows):
        total = sum(r["runs"] for r in half)
        cum = 0
        for r in half:
            if r["action"] in DELIVERY_ACTIONS:
                outs = min(r["outs_before"], 2)
                samples.append(((r["base_state_before"], outs), total - cum))
            cum += r["runs"]
    return samples


def _table_from_samples(samples) -> dict:
    acc: dict = {}
    for state, togo in samples:
        n, s = acc.get(state, (0, 0.0))
        acc[state] = (n + 1, s + togo)
    return acc


def re_table(conn: sqlite3.Connection, season_id: int) -> dict:
    """{(base_mask, outs): expected runs to end of half}, shrunk toward the
    same-sex pool of every PBP-covered season in the DB."""
    season_samples = _state_samples(_regulation_rows(conn, [season_id]))
    season_acc = _table_from_samples(season_samples)

    sex = _season_sex(conn, season_id)
    pool_ids = [r["id"] for r in conn.execute(
        "SELECT DISTINCT s.id FROM seasons s "
        "JOIN plays p ON p.season_id = s.id WHERE s.series LIKE ?",
        ((sex or "") + "%",))] if sex else [season_id]
    if pool_ids == [season_id]:
        pool_acc = season_acc
    else:
        pool_acc = _table_from_samples(
            _state_samples(_regulation_rows(conn, pool_ids)))

    overall = (sum(s for _, s in pool_acc.values())
               / max(1, sum(n for n, _ in pool_acc.values())))
    table = {}
    for mask in ("000", "100", "010", "001", "110", "101", "011", "111"):
        for outs in (0, 1, 2):
            state = (mask, outs)
            pn, ps = pool_acc.get(state, (0, 0.0))
            pool_re = ps / pn if pn else overall
            n, s = season_acc.get(state, (0, 0.0))
            table[state] = ((s + _SHRINK_K * pool_re) / (n + _SHRINK_K)
                            if n else pool_re)
    return table


def coverage(conn: sqlite3.Connection, season_id: int) -> dict:
    row = conn.execute(
        """SELECT COUNT(DISTINCT p.match_id) AS with_pbp,
                  (SELECT COUNT(*) FROM matches m WHERE m.season_id = ?) AS total,
                  SUM(CASE WHEN p.action IN ('hit','koppi') AND p.period < 2
                      THEN 1 ELSE 0 END) AS deliveries
           FROM plays p WHERE p.season_id = ?""",
        (season_id, season_id)).fetchone()
    return {"matches_pbp": row["with_pbp"] or 0,
            "matches_total": row["total"] or 0,
            "deliveries": row["deliveries"] or 0}


def _sufficient(cov: dict) -> bool:
    return (cov["matches_pbp"] >= MIN_MATCHES
            and cov["deliveries"] >= MIN_DELIVERIES)


def _plays_of_half(half, table):
    """Segment a half into delivery-anchored plays and yield
    (rows_of_play, delta_batting) with RE(after)=0 when the half ends."""
    plays, cur = [], []
    for r in half:
        if r["action"] in DELIVERY_ACTIONS or r["action"] == "at_bat":
            if cur:
                plays.append(cur)
            cur = [r] if r["action"] in DELIVERY_ACTIONS else []
        elif r["action"] in RUNNER_ACTIONS:
            cur.append(r)
        elif cur:
            plays.append(cur)
            cur = []
    if cur:
        plays.append(cur)

    for i, rows in enumerate(plays):
        first, last = rows[0], rows[-1]
        before = table.get((first["base_state_before"],
                            min(first["outs_before"], 2)), 0.0)
        # the half is over after its final play whatever ended it (third
        # out, round rule, period decision) — absorb to zero either way
        half_ends = last["outs_after"] >= 3 or i == len(plays) - 1
        after = 0.0 if half_ends else table.get(
            (last["base_state_after"], min(last["outs_after"], 2)), 0.0)
        runs = sum(r["runs"] for r in rows)
        yield rows, (after - before + runs)


def team_defense(conn: sqlite3.Connection, season_id: int) -> list[dict]:
    """One row per team: RE24-based runs saved per game plus the observable
    fielding components. Empty when coverage is insufficient."""
    cov = coverage(conn, season_id)
    if not cov["matches_pbp"]:
        return []
    table = re_table(conn, season_id)
    rows = _regulation_rows(conn, [season_id])
    names = {m["id"]: (m["home_team"], m["away_team"]) for m in conn.execute(
        "SELECT id, home_team, away_team FROM matches WHERE season_id = ?",
        (season_id,))}

    teams: dict[str, dict] = {}

    def bucket(match_id, is_home_bat):
        pair = names.get(match_id)
        if pair is None or is_home_bat is None:
            return None
        name = pair[0] if not is_home_bat else pair[1]  # defender
        return teams.setdefault(name, {
            "team": name, "halves": 0, "def_rv_total": 0.0,
            "deliveries": 0, "koppis": 0, "attempts": 0, "outs": 0,
            "error_runs": 0.0, "advances": 0, "extra_advances": 0,
            "matches": set(),
        })

    for half in _halves(rows):
        head = half[0]
        t = bucket(head["match_id"], head["is_home_bat"])
        if t is None:
            continue
        t["halves"] += 1
        t["matches"].add(head["match_id"])
        for play, delta in _plays_of_half(half, table):
            t["def_rv_total"] -= delta
            if any(r["action"] == "advance_error" for r in play):
                t["error_runs"] += max(delta, 0.0)
        for r in half:
            a = r["action"]
            if a in DELIVERY_ACTIONS:
                t["deliveries"] += 1
                if r["caught"]:
                    t["koppis"] += 1
            if a in ("advance", "advance_error", "out", "out_doubled"):
                t["attempts"] += 1
                if r["out"]:
                    t["outs"] += 1
            if a in ("advance", "advance_error"):
                t["advances"] += 1
                if r["to_base"] and (r["to_base"] - (r["from_base"] or 0)) >= 2:
                    t["extra_advances"] += 1

    league_extra = (sum(t["extra_advances"] for t in teams.values())
                    / max(1, sum(t["advances"] for t in teams.values())))
    out = []
    for t in sorted(teams.values(), key=lambda x: x["team"]):
        games = len(t["matches"])
        halves = t["halves"] or 1
        extra_rate = t["extra_advances"] / t["advances"] if t["advances"] else None
        out.append({
            "team": t["team"],
            "games": games,
            "halves": t["halves"],
            "def_rv": round(t["def_rv_total"] / halves * 8, 2),  # per game
            "koppi_pct": round(100 * t["koppis"] / t["deliveries"], 1)
            if t["deliveries"] else None,
            "out_conv": round(100 * t["outs"] / t["attempts"], 1)
            if t["attempts"] else None,
            "error_cost": round(t["error_runs"] / games, 2) if games else None,
            "arm_hold": round(100 * extra_rate / league_extra)
            if extra_rate is not None and league_extra else None,
        })
    # def_rv is centred on the league by construction only approximately;
    # recentre so the table reads as above/below average
    if out:
        mean_rv = sum(t["def_rv"] for t in out) / len(out)
        for t in out:
            t["def_rv"] = round(t["def_rv"] - mean_rv, 2)
    return out


def re24_event_values(conn: sqlite3.Connection, season_id: int) -> dict | None:
    """JYK/VYK event weights measured from play-by-play RE24 deltas.
    None when the season lacks coverage — callers fall back to the
    prior+ridge scaffold."""
    cov = coverage(conn, season_id)
    if not _sufficient(cov):
        return None
    table = re_table(conn, season_id)
    rows = _regulation_rows(conn, [season_id])

    sums = {k: 0.0 for k in ("kunnarit", "karkilyonnit", "saatot",
                             "etenemiset", "haavat", "palot")}
    counts = {k: 0 for k in sums}

    def row_delta(r):
        before = table.get((r["base_state_before"],
                            min(r["outs_before"], 2)), 0.0)
        after = (0.0 if r["outs_after"] >= 3
                 else table.get((r["base_state_after"],
                                 min(r["outs_after"], 2)), 0.0))
        return after - before + r["runs"]

    for r in rows:
        a = r["action"]
        if a == "homerun":
            sums["kunnarit"] += row_delta(r)
            counts["kunnarit"] += 1
        elif a in ("advance", "advance_error"):
            d = row_delta(r)
            if r["pointhits"] is not None:      # lead advance: batter KL + runner
                sums["karkilyonnit"] += _LEAD_BATTER_SHARE * d
                counts["karkilyonnit"] += 1
                sums["etenemiset"] += (1 - _LEAD_BATTER_SHARE) * d
            elif r["tailhits"] is not None:     # trailing advance: saatto + runner
                sums["saatot"] += _TRAIL_BATTER_SHARE * d
                counts["saatot"] += 1
                sums["etenemiset"] += (1 - _TRAIL_BATTER_SHARE) * d
            else:                               # self-made advance
                sums["etenemiset"] += d
            counts["etenemiset"] += 1
        elif a == "wound":
            sums["haavat"] += row_delta(r)
            counts["haavat"] += 1
        elif a in ("out", "out_doubled"):
            sums["palot"] += row_delta(r)
            counts["palot"] += 1

    weights = {}
    for k in sums:
        if not counts[k]:
            return None  # a whole event class missing → coverage too thin
        weights[k] = sums[k] / counts[k]
    # same sign clamps as the legacy scaffold — a safety net, not a prior
    for f in ("kunnarit", "karkilyonnit", "saatot", "etenemiset"):
        weights[f] = max(0.02, min(2.5, weights[f]))
    for f in ("haavat", "palot"):
        weights[f] = min(-0.02, max(-1.5, weights[f]))
    return weights


def re_table_export(conn: sqlite3.Connection, season_id: int) -> dict:
    """The RE table keyed for JSON export: '<mask>_<outs>' -> runs."""
    return {f"{mask}_{outs}": round(v, 3)
            for (mask, outs), v in re_table(conn, season_id).items()}


# ── Player boards (zone inference) ─────────────────────────────────────────
# Hit coordinates are a 0-100 box with y as inverted depth (y=0 the back
# boundary, y=100 the home plate end) — established from the koppi share by
# depth band (74% caught at y<10 falling monotonically to 1% at y>90).

OF_ZONE_MAX_Y = 30.0    # deep fly territory covered by the two kopparit
FRONT_ZONE_MIN_Y = 70.0  # short front-field plays that belong to the lukkari

# Which x half the 3K (left) koppari covers. Set empirically: the assignment
# that makes individual outfielders' catch rates consistent across their own
# matches is the correct one (a scrambled assignment destroys within-player
# stickiness). On 2026 Superpesis the odd/even-match catch-rate correlation
# is 0.45 with 3K on the high-x half vs 0.12 mirrored — so False it is.
OF_3K_LOW_X = False

_OF_MIN_BALLS = 40
_LK_MIN_PLAYS = 60


def _json_loads(raw):
    import json as _json
    try:
        return _json.loads(raw or "{}")
    except ValueError:
        return {}


def _match_fielders(conn: sqlite3.Connection, season_id: int) -> dict:
    """(match_id, home_flag) -> {position_code: player_id} for the codes the
    boards attribute plays to (3K, 2K, L), from that match's box-score rows."""
    out: dict = {}
    for r in conn.execute(
            "SELECT match_id, player_id, home, raw FROM player_games "
            "WHERE season_id = ?", (season_id,)):
        raw = _json_loads(r["raw"])
        src = raw.get("_v1", raw)
        pos = (src.get("defensive_position") or "").strip().upper()
        if pos in ("3K", "2K", "L"):
            out.setdefault((r["match_id"], r["home"]), {}).setdefault(
                pos, r["player_id"])
    return out


def _player_names(conn: sqlite3.Connection, season_id: int) -> dict:
    return {r["player_id"]: (r["name"], r["team"]) for r in conn.execute(
        """SELECT pg.player_id, p.name, MAX(pg.team) AS team
           FROM player_games pg JOIN players p ON p.id = pg.player_id
           WHERE pg.season_id = ? GROUP BY pg.player_id""", (season_id,))}


def of_koppi_board(conn: sqlite3.Connection, season_id: int,
                   min_balls: int = _OF_MIN_BALLS) -> list[dict]:
    """Outfielder catch rates on balls hit into the deep zone. The player
    split is positional inference from hit locations — labeled as such in
    the UI."""
    fielders = _match_fielders(conn, season_id)
    names = _player_names(conn, season_id)
    acc: dict = {}
    for r in conn.execute(
            f"""SELECT match_id, is_home_bat, hit_x, caught FROM plays
                WHERE season_id = ? AND period < 2
                  AND action IN ('hit', 'koppi')
                  AND hit_y IS NOT NULL AND hit_y < {OF_ZONE_MAX_Y}
                  AND hit_x IS NOT NULL AND is_home_bat IS NOT NULL""",
            (season_id,)):
        defending_home = 0 if r["is_home_bat"] else 1
        codes = fielders.get((r["match_id"], defending_home)) or {}
        low_x = r["hit_x"] < 50
        code = ("3K" if low_x == OF_3K_LOW_X else "2K")
        pid = codes.get(code)
        if pid is None:
            continue
        n, k = acc.get(pid, (0, 0))
        acc[pid] = (n + 1, k + (1 if r["caught"] else 0))
    board = []
    for pid, (n, k) in acc.items():
        if n < min_balls or pid not in names:
            continue
        name, team = names[pid]
        board.append({"player_id": pid, "name": name, "team": team,
                      "n": n, "koppis": k, "rate": round(100 * k / n, 1)})
    board.sort(key=lambda b: b["rate"], reverse=True)
    return board


def lukkari_defense(conn: sqlite3.Connection, season_id: int,
                    min_plays: int = _LK_MIN_PLAYS) -> list[dict]:
    """Lukkari front-field defense: run value of plays on short hits, from
    run expectancy. The lukkari's identity is exact (box-score position);
    which plays are theirs is inferred from hit depth."""
    fielders = _match_fielders(conn, season_id)
    names = _player_names(conn, season_id)
    table = re_table(conn, season_id)
    rows = _regulation_rows(conn, [season_id])
    acc: dict = {}
    for half in _halves(rows):
        head = half[0]
        if head["is_home_bat"] is None:
            continue
        defending_home = 0 if head["is_home_bat"] else 1
        pid = (fielders.get((head["match_id"], defending_home)) or {}).get("L")
        if pid is None:
            continue
        for play, delta in _plays_of_half(half, table):
            first = play[0]
            if (first["action"] in DELIVERY_ACTIONS
                    and first["hit_y"] is not None
                    and first["hit_y"] >= FRONT_ZONE_MIN_Y):
                d = acc.setdefault(pid, {"n": 0, "rv": 0.0, "outs": 0,
                                         "wounds": 0})
                d["n"] += 1
                d["rv"] -= delta
                d["outs"] += sum(1 for r in play if r["out"])
                d["wounds"] += sum(1 for r in play if r["action"] == "wound")
    # Centre on the league-average front-zone play so the number reads as
    # runs above an average lukkari, not raw accumulation — otherwise
    # playing time alone drives the board (short hits favor the defense).
    total_n = sum(d["n"] for d in acc.values())
    mean_rv = (sum(d["rv"] for d in acc.values()) / total_n) if total_n else 0.0
    board = []
    for pid, d in acc.items():
        if d["n"] < min_plays or pid not in names:
            continue
        name, team = names[pid]
        board.append({"player_id": pid, "name": name, "team": team,
                      "n": d["n"], "outs": d["outs"], "wounds": d["wounds"],
                      "def_rv": round(d["rv"] - mean_rv * d["n"], 1)})
    board.sort(key=lambda b: b["def_rv"], reverse=True)
    return board
