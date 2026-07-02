#!/usr/bin/env python3
"""Export all computed data from SQLite to site/data/ as static JSON files.

Run once after each DB refresh:
    python export.py

The site/ directory can then be deployed to Netlify, Vercel, or any static host.
"""
from __future__ import annotations
import json, re, unicodedata
from pathlib import Path
from pesis import context, db, metrics, projection, similarity, simulate

LEADERBOARD_STATS = [
    "teho_plus", "teho_plus_adj", "tehot", "kl_pct",
    "saatto_pct", "eten_pct", "kunnarit", "lyodyt", "tuodut", "palo_rate",
]
PCT_STATS = ["kl_pct", "saatto_pct", "eten_pct", "kunnari_rate",
             "lyoty_rate", "palo_rate", "tehot_per_turn"]
BASE_KL_KEYS = ["kl_base0", "kl_base1", "kl_base2", "kl_base3"]
OUT = Path("site/data")


def slugify(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^\w]+", "-", s.lower()).strip("-")


def dump(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))


def rows_to_dicts(rows) -> list[dict]:
    return [dict(r) for r in rows]


def main():
    conn = db.connect()
    print("Exporting…")

    # ── Seasons & nav ──────────────────────────────────────────────────
    all_seasons = rows_to_dicts(conn.execute(
        "SELECT id, year, series FROM seasons ORDER BY year DESC, series"
    ).fetchall())
    nav_seasons = rows_to_dicts(conn.execute(
        """SELECT id, year, series FROM seasons s
           WHERE year = (SELECT MAX(year) FROM seasons WHERE series = s.series)
           ORDER BY series"""
    ).fetchall())
    dump(OUT / "meta.json", {"seasons": all_seasons, "nav_seasons": nav_seasons})
    print(f"  meta.json  ({len(all_seasons)} seasons)")

    # ── Season-lines cache ─────────────────────────────────────────────
    _cache: dict = {}
    def cached_lines(sid):
        if sid not in _cache:
            _cache[sid] = metrics.season_lines(conn, sid)
        return [dict(l) for l in _cache[sid]]

    # ── Players index (search) ─────────────────────────────────────────
    index = rows_to_dicts(conn.execute(
        """SELECT DISTINCT p.id, p.name, MAX(pg.team) AS team, MAX(s.year) AS last_year
           FROM players p
           JOIN player_games pg ON pg.player_id = p.id
           JOIN seasons s ON s.id = pg.season_id
           GROUP BY p.id ORDER BY p.name"""
    ).fetchall())
    dump(OUT / "players" / "index.json", index)
    print(f"  players/index.json  ({len(index)} players)")

    # ── Per-season exports ─────────────────────────────────────────────
    for season in all_seasons:
        sid = season["id"]
        lines = cached_lines(sid)

        # Leaderboard: all players with percentiles added
        lb_lines = [dict(l) for l in lines]
        metrics.add_percentiles(lb_lines)
        dump(OUT / "leaderboard" / f"{sid}.json", {
            "season": season,
            "stats": LEADERBOARD_STATS,
            "players": lb_lines,
        })

        # League standings + odds + context
        same_series = [s["id"] for s in all_seasons if s["series"] == season["series"]]
        table = simulate.standings(conn, sid)
        history = simulate.odds_history(conn, sid)
        dump(OUT / "league" / f"{sid}.json", {
            "season": season,
            "standings": table,
            "odds_history": history if len(history.get("dates", [])) > 1 else None,
            "parks": context.park_factors(conn, same_series),
            "weather": context.weather_effects(conn, same_series),
        })

        # Projections
        league_rates = metrics.league_rates(cached_lines(sid))
        pids = [r[0] for r in conn.execute(
            "SELECT DISTINCT player_id FROM player_games WHERE season_id = ?",
            (sid,)).fetchall()]
        projs = []
        for pid in pids:
            p = projection.project_player(conn, pid, league=league_rates)
            if (p["teho_plus_proj"] is not None
                    and p["stats"]["kl_pct"]["effective_n"] >= 20):
                projs.append(p)
        projs.sort(key=lambda p: p["teho_plus_proj"], reverse=True)
        dump(OUT / "projections" / f"{sid}.json", {
            "season": season, "projections": projs[:50],
        })

        # Teams
        teams = {l["team"] for l in lines if l.get("team")}
        for team in teams:
            roster = sorted(
                [l for l in cached_lines(sid) if l.get("team") == team],
                key=lambda l: l["tehot"], reverse=True)
            if not roster:
                continue
            matches = rows_to_dicts(conn.execute(
                """SELECT * FROM matches WHERE season_id = ?
                   AND (home_team = ? OR away_team = ?) ORDER BY date""",
                (sid, team, team)).fetchall())
            standing = next(
                (t for t in simulate.standings(conn, sid) if t["team"] == team), None)
            slug = slugify(team)
            dump(OUT / "teams" / f"{slug}-{sid}.json", {
                "team": team, "slug": slug, "season": season,
                "roster": roster, "matches": matches, "standing": standing,
            })

        print(f"  season {season['year']} {season['series']}  "
              f"(id={sid}, {len(teams)} teams)")

    # ── Player profiles ────────────────────────────────────────────────
    player_ids = [r[0] for r in conn.execute("SELECT id FROM players").fetchall()]
    for pid in player_ids:
        row = conn.execute("SELECT * FROM players WHERE id = ?", (pid,)).fetchone()
        if not row:
            continue
        career = metrics.player_seasons(conn, pid, lines_fn=cached_lines)
        if not career:
            continue
        current = career[-1]

        sl = [dict(l) for l in cached_lines(current["season_id"])]
        metrics.add_percentiles(sl)
        line = next((l for l in sl if l["player_id"] == pid), None)
        if not line:
            continue

        proj = projection.project_player(
            conn, pid,
            league=metrics.league_rates(cached_lines(current["season_id"])))

        career_json = [
            {"year": s["year"], "kl_pct": s["kl_pct"], "teho_plus": s["teho_plus"]}
            for s in career
        ]

        base_lines = metrics.base_kl_lines(conn, current["season_id"])
        metrics.add_percentiles(base_lines, stats=tuple(BASE_KL_KEYS))
        base_kl = next((b for b in base_lines if b["player_id"] == pid), None)
        if base_kl and all(base_kl.get(f"kl_base{k}_tries", 0) == 0 for k in range(4)):
            base_kl = None

        game_log = metrics.game_log(conn, pid, current["season_id"])
        comps = similarity.comps(conn, pid, lines_fn=cached_lines)

        dump(OUT / "players" / f"{pid}.json", {
            "player": dict(row),
            "career": career,
            "line": line,
            "proj": proj,
            "career_json": career_json,
            "pct_stats": PCT_STATS,
            "base_kl": base_kl,
            "base_keys": BASE_KL_KEYS,
            "log": [dict(g) for g in game_log],
            "comps": comps,
        })

    print(f"  {len(player_ids)} player profiles")

    # ── Match box scores ───────────────────────────────────────────────
    all_matches = conn.execute(
        "SELECT m.*, s.series, s.year FROM matches m "
        "JOIN seasons s ON s.id = m.season_id"
    ).fetchall()
    for m in all_matches:
        mid = m["id"]
        lines = conn.execute(
            """SELECT pg.*, p.name,
                      pg.kunnarit + pg.lyodyt + pg.tuodut AS tehot
               FROM player_games pg JOIN players p ON p.id = pg.player_id
               WHERE pg.match_id = ? ORDER BY pg.team, tehot DESC""",
            (mid,)).fetchall()
        sides: dict = {}
        for l in lines:
            sides.setdefault(l["team"], []).append(dict(l))
        dump(OUT / "matches" / f"{mid}.json", {"match": dict(m), "sides": sides})

    print(f"  {len(all_matches)} match box scores")
    print("Done.")


if __name__ == "__main__":
    main()
