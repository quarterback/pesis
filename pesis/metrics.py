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
                   COUNT(*) AS games, MAX(pg.team) AS team,
                   json_group_array(pg.raw) AS raw_rows, {sums}
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
        line["season_id"] = season_id
        line["tehot"] = line["kunnarit"] + line["lyodyt"] + line["tuodut"]
        if line["born_year"]:
            line["age"] = line["year"] - line["born_year"]
        for rate, (num, den) in RATES.items():
            line[rate] = line[num] / line[den] if line[den] else None
        line["tehot_per_turn"] = (
            line["tehot"] / line["turns_at_bat"] if line["turns_at_bat"] else None
        )
        line["kl_per_turn"] = (
            line["karkilyonnit"] / line["turns_at_bat"] if line["turns_at_bat"] else None
        )
        line["hr_rbi_per_turn"] = (
            (line["kunnarit"] + line["lyodyt"]) / line["turns_at_bat"]
            if line["turns_at_bat"] else None
        )
        raw_rows = r["raw_rows"] if "raw_rows" in r.keys() else None
        _add_raw_base_splits(line, raw_rows)
        line["pos"] = _primary_position(raw_rows)  # Finnish fielding code (2V, 3P, L…)
        line.pop("raw_rows", None)  # intermediate only — never serialized/consumed downstream
        lines.append(line)

    league_tpt = _league_tehot_per_turn(lines)
    for line in lines:
        line["teho_plus"] = (
            round(100 * line["tehot_per_turn"] / league_tpt)
            if line["tehot_per_turn"] is not None and league_tpt else None
        )
    _add_analytics_indices(lines)
    _add_value_stats(conn, season_id, lines)
    _add_park_adjusted(conn, season_id, lines)
    return lines


def _primary_position(raw_rows_json: str | None) -> str | None:
    """A player's most-played fielding position (Finnish scorecard code) across
    the season, from the preserved raw ``defensive_position`` field. Ties break
    on the most common code; substitute/jokeri rows (no position) are ignored."""
    if not raw_rows_json:
        return None
    import json as _json, collections
    cnt: collections.Counter = collections.Counter()
    for raw_text in _json.loads(raw_rows_json):
        raw = _json.loads(raw_text or "{}")
        src = raw.get("_v1", raw)
        pos = src.get("defensive_position")
        if pos:
            cnt[str(pos).strip().upper()] += 1
    return cnt.most_common(1)[0][0] if cnt else None


def _add_raw_base_splits(line: dict, raw_rows_json: str | None) -> None:
    """Attach official 1%/2%/3%/K% KL splits from raw rows."""
    import json as _json
    succ = [0, 0, 0, 0]
    tries = [0, 0, 0, 0]
    if raw_rows_json:
        for raw_text in _json.loads(raw_rows_json):
            raw = _json.loads(raw_text or "{}")
            src = raw.get("_v1", raw)
            for i in range(4):
                succ[i] += src.get(f"batpe_succeeded_{i}") or 0
                tries[i] += src.get(f"batpe_tries_{i}") or 0
    for i in range(4):
        line[f"kl_base{i}"] = succ[i] / tries[i] if tries[i] else None
        line[f"kl_base{i}_tries"] = tries[i]
    line["adv1_pct"] = line["kl_base0"]
    line["adv2_pct"] = line["kl_base1"]
    line["adv3_pct"] = line["kl_base2"]
    line["adv_home_pct"] = line["kl_base3"]
    line["money_kl_pct"] = line["kl_base3"]
    line["money_kl_tries"] = line["kl_base3_tries"]


def _safe_div(num, den):
    return num / den if num is not None and den else None


def _index(value, league):
    return round(100 * value / league) if value is not None and league else None


def _add_analytics_indices(lines: list[dict]) -> None:
    """Add Mallo-only composite analytics (ADV+, RUN+, OUT+, SPARK, base-split plus)."""
    adv_num = sum(l["karkilyonnit"] + l["saatot"] for l in lines)
    adv_den = sum(l["karki_yritykset"] + l["saatto_yritykset"] for l in lines)
    run_num = sum(l["etenemiset"] for l in lines)
    run_den = sum(l["eteneminen_yritykset"] for l in lines)
    out_num = sum(l["palot"] for l in lines)
    out_den = sum(l["turns_at_bat"] for l in lines)
    league_adv = _safe_div(adv_num, adv_den)
    league_run = _safe_div(run_num, run_den)
    league_out_avoid = 1 - (out_num / out_den) if out_den else None
    base_leagues = {}
    for i in range(4):
        base_num = sum((l.get(f"kl_base{i}") or 0) * l.get(f"kl_base{i}_tries", 0)
                       for l in lines if l.get(f"kl_base{i}") is not None)
        base_den = sum(l.get(f"kl_base{i}_tries", 0) for l in lines)
        base_leagues[i] = _safe_div(base_num, base_den)
    league_money = base_leagues[3]
    for l in lines:
        adv = _safe_div(l["karkilyonnit"] + l["saatot"],
                        l["karki_yritykset"] + l["saatto_yritykset"])
        out_avoid = 1 - l["palo_rate"] if l.get("palo_rate") is not None else None
        l["adv_plus"] = _index(adv, league_adv)
        l["runner_plus"] = _index(l.get("eten_pct"), league_run)
        l["out_avoid_plus"] = _index(out_avoid, league_out_avoid)
        l["adv1_plus"] = _index(l.get("adv1_pct"), base_leagues[0])
        l["adv2_plus"] = _index(l.get("adv2_pct"), base_leagues[1])
        l["adv3_plus"] = _index(l.get("adv3_pct"), base_leagues[2])
        l["adv_home_plus"] = _index(l.get("adv_home_pct"), league_money)
        l["money_kl_plus"] = l["adv_home_plus"]
        comps = [l.get("adv_plus"), l.get("runner_plus"), l.get("out_avoid_plus")]
        l["spark_index"] = (round(0.50 * comps[0] + 0.30 * comps[1] + 0.20 * comps[2])
                            if all(c is not None for c in comps) else None)


def _runs_per_win(conn: sqlite3.Connection, season_id: int) -> float:
    """Season run-to-win scale for VYK.

    Without play-by-play win probability, use the actual season scoring
    environment: one win is roughly one average game's total run separation
    opportunity. This is deliberately conservative and will be replaced by a
    fitted runs-to-wins curve once full standings/PBP are available.
    """
    row = conn.execute(
        """SELECT AVG(home_runs + away_runs) AS rpg
           FROM matches
           WHERE season_id = ? AND home_runs IS NOT NULL AND away_runs IS NOT NULL""",
        (season_id,),
    ).fetchone()
    if row and row["rpg"]:
        return max(4.0, float(row["rpg"]))
    return 8.0


def _team_event_rows(conn: sqlite3.Connection, season_id: int) -> list[dict]:
    return [dict(r) for r in conn.execute(
        """SELECT team,
                  SUM(kunnarit) AS kunnarit,
                  SUM(lyodyt) AS lyodyt,
                  SUM(tuodut) AS tuodut,
                  SUM(karkilyonnit) AS karkilyonnit,
                  SUM(saatot) AS saatot,
                  SUM(etenemiset) AS etenemiset,
                  SUM(haavat) AS haavat,
                  SUM(palot) AS palot,
                  SUM(turns_at_bat) AS turns_at_bat
           FROM player_games
           WHERE season_id = ? AND team IS NOT NULL
           GROUP BY team""",
        (season_id,),
    ).fetchall()]


def _solve_linear_system(a: list[list[float]], b: list[float]) -> list[float] | None:
    """Small Gaussian solver used for ridge normal equations."""
    n = len(b)
    aug = [row[:] + [b[i]] for i, row in enumerate(a)]
    for col in range(n):
        pivot = max(range(col, n), key=lambda r: abs(aug[r][col]))
        if abs(aug[pivot][col]) < 1e-9:
            return None
        aug[col], aug[pivot] = aug[pivot], aug[col]
        div = aug[col][col]
        aug[col] = [v / div for v in aug[col]]
        for r in range(n):
            if r == col:
                continue
            factor = aug[r][col]
            aug[r] = [aug[r][c] - factor * aug[col][c] for c in range(n + 1)]
    return [aug[i][-1] for i in range(n)]


# Events that carry value credit in JYK/VYK. Deliberately excludes lyödyt and
# tuodut: those are run *outcomes*, not batter/runner events, and crediting
# them makes the value stats an RBI counter — a batter's lyödyt depend on how
# often teammates are on base ahead of him, and tuodut on teammates batting
# him home. The skill behind an RBI is already counted through kärkilyönnit
# (and kunnarit); the opportunity should not be.
VALUE_EVENTS = ("kunnarit", "karkilyonnit", "saatot", "etenemiset",
                "haavat", "palot")

# Share of each non-kunnari run credited to the advancing hit vs the
# baserunning that set it up. Bridge assumptions until RE24 exists.
_KL_RUN_SHARE = 0.60
_SAATTO_RUN_SHARE = 0.15
_ETEN_RUN_SHARE = 0.25


def _calibrated_priors(rows: list[dict]) -> dict[str, float]:
    """Event run values implied by the season's own run accounting.

    Every pesäpallo run is either a kunnari or batted in by an advancing hit,
    so league totals pin the average run yield of the events: non-kunnari runs
    are split between the advancing hit (60%), etenemiset (25%) and saatot
    (15%), and out costs scale with the runs-per-turn environment. These
    priors move with the run environment of each series and season instead of
    being hard-coded constants.
    """
    runs = sum(r["tuodut"] or 0 for r in rows)
    kunnarit = sum(r["kunnarit"] or 0 for r in rows)
    kl = sum(r["karkilyonnit"] or 0 for r in rows)
    saatot = sum(r["saatot"] or 0 for r in rows)
    eten = sum(r["etenemiset"] or 0 for r in rows)
    turns = sum(r["turns_at_bat"] or 0 for r in rows)
    nk_runs = max(runs - kunnarit, 0)
    rpt = runs / turns if turns else 0.08
    return {
        "kunnarit": 1.40,
        "karkilyonnit": _KL_RUN_SHARE * nk_runs / kl if kl else 0.30,
        "saatot": _SAATTO_RUN_SHARE * nk_runs / saatot if saatot else 0.10,
        "etenemiset": _ETEN_RUN_SHARE * nk_runs / eten if eten else 0.12,
        "haavat": -0.5 * rpt,
        "palot": -1.0 * rpt,
    }


def _empirical_value_weights(conn: sqlite3.Connection, season_id: int) -> dict[str, float]:
    """Estimate pesäpallo event run values from team totals.

    This is a WAR-style scaffold from existing box-score rows, not the final
    RE24 model. Weights start from priors calibrated to the season's own run
    accounting (_calibrated_priors) and, when enough teams exist, a small
    ridge regression of team runs on team event totals shrinks *toward those
    priors* rather than toward zero — a dozen team rows cannot estimate six
    collinear weights on their own. Sign constraints keep good events positive
    and outs negative.
    """
    rows = _team_event_rows(conn, season_id)
    if not rows:
        return {"kunnarit": 1.40, "karkilyonnit": 0.30, "saatot": 0.10,
                "etenemiset": 0.12, "haavat": -0.04, "palot": -0.08}
    priors = _calibrated_priors(rows)
    features = list(priors)
    if len(rows) < 6:
        return priors

    # Standardize counts so ridge is stable across event scales.
    means = {f: sum(r[f] or 0 for r in rows) / len(rows) for f in features}
    scales = {}
    for f in features:
        var = sum(((r[f] or 0) - means[f]) ** 2 for r in rows) / len(rows)
        scales[f] = var ** 0.5 or 1.0
    # Regress the residual left after the priors, so zero-shrinkage on the
    # correction returns the priors, not an empty model.
    resid = [(r["tuodut"] or 0)
             - sum(priors[f] * (r[f] or 0) for f in features) for r in rows]
    y_mean = sum(resid) / len(resid)
    x_rows = [[((r[f] or 0) - means[f]) / scales[f] for f in features] for r in rows]
    y = [ry - y_mean for ry in resid]
    lam = 2.0
    xtx = [[sum(x[i] * x[j] for x in x_rows) + (lam if i == j else 0.0)
            for j in range(len(features))]
           for i in range(len(features))]
    xty = [sum(x[i] * yy for x, yy in zip(x_rows, y)) for i in range(len(features))]
    beta = _solve_linear_system(xtx, xty)
    if beta is None:
        return priors
    weights = {f: priors[f] + beta[i] / scales[f] for i, f in enumerate(features)}
    for f in ("kunnarit", "karkilyonnit", "saatot", "etenemiset"):
        weights[f] = max(0.02, min(2.5, weights[f]))
    for f in ("haavat", "palot"):
        weights[f] = min(-0.02, max(-1.5, weights[f]))
    return weights


def _add_value_stats(conn: sqlite3.Connection, season_id: int, lines: list[dict]) -> None:
    """Attach first WAR-like value stats from existing aggregate rows.

    JYK (Juoksut Yli Korvaajan) is runs above replacement. VYK (Voitot Yli
    Korvaajan) is the WAR analog: JYK divided by the season run-to-win scale.
    This is intentionally additive/counting value; TEHO+/SPARK remain rates.
    Value comes only from skill events (VALUE_EVENTS) — realized lyödyt and
    tuodut are excluded so opportunity does not masquerade as value.
    """
    if not lines:
        return
    weights = _empirical_value_weights(conn, season_id)
    value_events = tuple(weights)
    for line in lines:
        line["run_value"] = sum((line.get(f) or 0) * weights[f] for f in value_events)
    total_turns = sum(l.get("turns_at_bat", 0) for l in lines)
    if not total_turns:
        for line in lines:
            line["raa"] = line["jyk"] = line["vyk"] = None
        return
    league_rate = sum(l["run_value"] for l in lines) / total_turns
    rates = [l["run_value"] / l["turns_at_bat"] for l in lines if l.get("turns_at_bat")]
    mean = sum(rates) / len(rates)
    sd = (sum((r - mean) ** 2 for r in rates) / len(rates)) ** 0.5 if rates else 0.0
    replacement_rate = max(0.0, league_rate - 0.75 * sd)
    rpw = _runs_per_win(conn, season_id)
    for line in lines:
        turns = line.get("turns_at_bat", 0)
        line["raa"] = round(line["run_value"] - league_rate * turns, 1)
        line["jyk"] = round(line["run_value"] - replacement_rate * turns, 1)
        line["vyk"] = round(line["jyk"] / rpw, 2) if rpw else None


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


BASE_KL_LABELS = {  # upstream batpe_*_N indexes target bases 1..3 + home
    "kl_base0": "KL 1. pesälle", "kl_base1": "KL 2. pesälle",
    "kl_base2": "KL 3. pesälle", "kl_base3": "KL kotipesään",
}


def base_kl_lines(conn: sqlite3.Connection, season_id: int) -> list[dict]:
    """Kärkilyönti-% split by TARGET BASE, per player, from the raw upstream
    rows (batpe_succeeded_N / batpe_tries_N). The most pesäpallo-native skill
    fingerprint there is — advancing to 1st is routine, bringing the runner
    home is the money skill. Returns lines ready for add_percentiles()
    (keys kl_base0..3 + tries, turns_at_bat for qualification)."""
    import json as _json
    sums: dict[int, dict] = {}
    for r in conn.execute(
            "SELECT player_id, turns_at_bat, raw FROM player_games "
            "WHERE season_id = ?", (season_id,)):
        line = sums.setdefault(r["player_id"], {"player_id": r["player_id"],
                                                "turns_at_bat": 0,
                                                **{f"n{i}": 0 for i in range(4)},
                                                **{f"d{i}": 0 for i in range(4)}})
        line["turns_at_bat"] += r["turns_at_bat"]
        raw = _json.loads(r["raw"] or "{}")
        src = raw.get("_v1", raw)
        for i in range(4):
            line[f"n{i}"] += src.get(f"batpe_succeeded_{i}") or 0
            line[f"d{i}"] += src.get(f"batpe_tries_{i}") or 0
    out = []
    for line in sums.values():
        for i in range(4):
            n, d = line.pop(f"n{i}"), line.pop(f"d{i}")
            line[f"kl_base{i}"] = n / d if d else None
            line[f"kl_base{i}_tries"] = d
        out.append(line)
    return out


def _raw_source(raw_text: str | None) -> dict:
    """Return the preserved upstream row, unwrapping the v1 bridge payload."""
    if not raw_text:
        return {}
    import json as _json
    try:
        raw = _json.loads(raw_text or "{}")
    except (TypeError, ValueError):
        return {}
    return raw.get("_v1", raw) if isinstance(raw, dict) else {}


def _is_lukkari_raw(src: dict) -> bool:
    """Best-effort lukkari (pitcher) detector from preserved raw position fields."""
    keys = ("defensive_position", "up", "UP", "position", "fielding_position",
            "role", "player_position", "place")
    for key in keys:
        val = src.get(key)
        if val is None:
            continue
        text = str(val).strip().upper()
        if text == "L" or "LUKKARI" in text:
            return True
    return False


def _runs_allowed_for_row(row: sqlite3.Row) -> int | None:
    """Runs allowed by the player's team in this match row."""
    if row["home_runs"] is None or row["away_runs"] is None:
        return None
    if row["home"] is not None:
        return row["away_runs"] if row["home"] else row["home_runs"]
    if row["team"] == row["home_team"]:
        return row["away_runs"]
    if row["team"] == row["away_team"]:
        return row["home_runs"]
    return None


def lukkari_lines(conn: sqlite3.Connection, season_id: int,
                  min_games: int = 3) -> list[dict]:
    """Lukkari run-prevention lines from existing match/player rows.

    An ERA-style bridge until pitch/play-by-play data is ingested. A lukkari is
    credited team runs allowed in games where his raw position is marked lukkari.
    ``lra`` is lukkari runs allowed per game, ``lra_minus`` indexes it to league
    average (100 = average, lower is better), ``lukkari_rp`` is runs prevented
    versus average over that workload.
    """
    rows = conn.execute(
        """SELECT pg.player_id, p.name, pg.team, pg.home, pg.raw,
                  m.home_team, m.away_team, m.home_runs, m.away_runs
           FROM player_games pg
           JOIN players p ON p.id = pg.player_id
           JOIN matches m ON m.id = pg.match_id
           WHERE pg.season_id = ?""",
        (season_id,),
    ).fetchall()
    out: dict[int, dict] = {}
    for r in rows:
        src = _raw_source(r["raw"])
        if not _is_lukkari_raw(src):
            continue
        ra = _runs_allowed_for_row(r)
        if ra is None:
            continue
        line = out.setdefault(r["player_id"], {
            "player_id": r["player_id"], "name": r["name"],
            "team": r["team"], "lukkari_games": 0, "runs_allowed": 0,
        })
        line["lukkari_games"] += 1
        line["runs_allowed"] += ra
        if r["team"]:
            line["team"] = r["team"]
    lines = [l for l in out.values() if l["lukkari_games"] >= min_games]
    total_games = sum(l["lukkari_games"] for l in lines)
    total_ra = sum(l["runs_allowed"] for l in lines)
    league_lra = total_ra / total_games if total_games else None
    for l in lines:
        l["lra"] = l["runs_allowed"] / l["lukkari_games"] if l["lukkari_games"] else None
        l["lra_minus"] = (round(100 * l["lra"] / league_lra)
                          if l["lra"] is not None and league_lra else None)
        l["lukkari_rp"] = (round((league_lra - l["lra"]) * l["lukkari_games"], 1)
                           if l["lra"] is not None and league_lra else None)
    lines.sort(key=lambda l: (l["lukkari_rp"] is not None, l["lukkari_rp"]), reverse=True)
    return lines


def game_log(conn: sqlite3.Connection, player_id: int,
             season_id: int) -> list[dict]:
    """Per-match lines for the player page's game log."""
    rows = conn.execute(
        """SELECT pg.*, m.stadium FROM player_games pg
           LEFT JOIN matches m ON m.id = pg.match_id
           WHERE pg.player_id = ? AND pg.season_id = ?
           ORDER BY pg.date""", (player_id, season_id)).fetchall()
    out = []
    for r in rows:
        line = dict(r)
        line["tehot"] = r["kunnarit"] + r["lyodyt"] + r["tuodut"]
        line["kl_pct"] = (r["karkilyonnit"] / r["karki_yritykset"]
                          if r["karki_yritykset"] else None)
        out.append(line)
    return out


def player_seasons(conn: sqlite3.Connection, player_id: int,
                   lines_fn=None) -> list[dict]:
    """Season-by-season lines for one player (career page / trajectories).

    ``lines_fn(season_id)`` overrides season_lines — the web app passes a
    cached provider (with 35 years of history a career page would otherwise
    recompute dozens of full-season aggregations)."""
    lines_fn = lines_fn or (lambda sid: season_lines(conn, sid))
    season_ids = [r[0] for r in conn.execute(
        "SELECT DISTINCT season_id FROM player_games WHERE player_id = ?",
        (player_id,)).fetchall()]
    out = []
    for sid in season_ids:
        for line in lines_fn(sid):
            if line["player_id"] == player_id:
                line["season_id"] = sid
                out.append(line)
    out.sort(key=lambda l: l["year"])
    return out
