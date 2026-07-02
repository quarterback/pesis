"""Flask UI: FanGraphs-style leaderboards, Savant-style player pages.

Percentile bars are HTML/CSS; time-series charts (the playoff-odds fangraph,
career minis) are D3, vendored under static/ and fed page-embedded JSON.
Reads the same SQLite store the CLI writes.
"""

from __future__ import annotations

import sqlite3

import csv
import io
import json
import os

from flask import Flask, Response, abort, g, render_template, request

from .. import context, db, metrics, projection, similarity, simulate, translate
from . import i18n

PCT_STATS = ["kl_pct", "saatto_pct", "eten_pct", "kunnari_rate",
             "lyoty_rate", "palo_rate", "tehot_per_turn"]

BASE_KL_KEYS = ["kl_base0", "kl_base1", "kl_base2", "kl_base3"]

LEADERBOARD_STATS = ["vyk", "jyk", "raa", "spark_index", "adv_plus", "adv1_pct", "adv2_pct",
                     "adv3_pct", "adv_home_pct", "adv1_plus", "adv2_plus",
                     "adv3_plus", "adv_home_plus", "runner_plus",
                     "out_avoid_plus", "money_kl_plus", "teho_plus",
                     "teho_plus_adj", "tehot", "kl_pct", "saatto_pct",
                     "eten_pct", "kunnarit", "lyodyt", "tuodut", "palo_rate"]


def pct_bucket(pct: int | None) -> int | None:
    """Percentile → diverging-ramp bucket 0..6 (red pole → neutral → blue pole)."""
    if pct is None:
        return None
    for i, ceiling in enumerate((10, 25, 40, 60, 75, 90)):
        if pct < ceiling:
            return i
    return 6


def create_app(db_path: str | None = None) -> Flask:
    app = Flask(__name__)
    app.config["DB_PATH"] = db_path or db.DEFAULT_DB_PATH
    app.jinja_env.filters["rate"] = (
        lambda v: "—" if v is None else f"{v:.3f}".lstrip("0") or "0")
    app.jinja_env.globals["pct_bucket"] = pct_bucket

    def conn() -> sqlite3.Connection:
        if "db" not in g:
            g.db = db.connect(app.config["DB_PATH"])
        return g.db

    # -- language: Finnish default, ?lang= toggle persisted in a cookie -----

    @app.before_request
    def resolve_lang():
        asked = request.args.get("lang")
        if asked in i18n.LANGS:
            g.lang = asked
            g.lang_cookie = asked
        else:
            g.lang = request.cookies.get("lang", i18n.DEFAULT_LANG)
            if g.lang not in i18n.LANGS:
                g.lang = i18n.DEFAULT_LANG

    @app.after_request
    def persist_lang(resp):
        if getattr(g, "lang_cookie", None):
            resp.set_cookie("lang", g.lang_cookie, max_age=365 * 86400)
        return resp

    @app.context_processor
    def lang_context():
        def lang_url(lang: str) -> str:
            args = {k: v for k, v in request.args.items() if k != "lang"}
            args["lang"] = lang
            from urllib.parse import urlencode
            return f"{request.path}?{urlencode(args)}"
        return {"t": lambda key: i18n.t(key, g.lang), "lang": g.lang,
                "lang_url": lang_url}

    # season aggregates only change when an ingest writes the DB (the daily
    # refresh loop), so cache them process-wide and invalidate on the DB
    # file's mtime; with 35 years of history a career page would otherwise
    # recompute ~100 full-season aggregations
    _lines_cache: dict[int, list[dict]] = {}
    _cache_stamp: list[float] = [0.0]

    def _db_mtime() -> float:
        try:
            return os.path.getmtime(app.config["DB_PATH"])
        except OSError:
            return 0.0

    def cached_lines(season_id: int) -> list[dict]:
        stamp = _db_mtime()
        if stamp != _cache_stamp[0]:
            _lines_cache.clear()
            _cache_stamp[0] = stamp
        if season_id not in _lines_cache:
            _lines_cache[season_id] = metrics.season_lines(conn(), season_id)
        # copies: callers (add_percentiles) mutate lines in place
        return [dict(l) for l in _lines_cache[season_id]]

    _odds_cache: dict[int, dict] = {}

    def cached_odds_history(season_id: int) -> dict:
        stamp = _db_mtime()
        if stamp != _cache_stamp[0]:
            _lines_cache.clear()
            _odds_cache.clear()
            _cache_stamp[0] = stamp
        if season_id not in _odds_cache:
            _odds_cache[season_id] = simulate.odds_history(conn(), season_id)
        return _odds_cache[season_id]

    @app.teardown_appcontext
    def close(_exc):
        if "db" in g:
            g.pop("db").close()

    def seasons():
        return conn().execute(
            "SELECT id, year, series FROM seasons ORDER BY year DESC, series").fetchall()

    @app.context_processor
    def nav_context():
        # one nav entry per series' latest season — every league (women's and
        # men's alike) is a first-class, one-click destination
        try:
            rows = conn().execute(
                """SELECT id, year, series FROM seasons s
                   WHERE year = (SELECT MAX(year) FROM seasons
                                 WHERE series = s.series)
                   ORDER BY series""").fetchall()
        except sqlite3.Error:
            rows = []
        return {"nav_seasons": rows}

    def pick_season(all_seasons):
        sid = request.args.get("sid", type=int)
        year = request.args.get("year", type=int)
        for s in all_seasons:
            if s["id"] == sid or (sid is None and s["year"] == year):
                return s
        return all_seasons[0]

    @app.route("/")
    @app.route("/leaderboard")
    def leaderboard():
        all_seasons = seasons()
        if not all_seasons:
            return render_template("empty.html")
        stat = request.args.get("stat", "vyk")
        if stat not in LEADERBOARD_STATS:
            abort(400)
        season = pick_season(all_seasons)
        lines = metrics.leaderboard(conn(), season["id"], stat, limit=50)
        return render_template("leaderboard.html", lines=lines, stat=stat,
                               stats=LEADERBOARD_STATS, season=season,
                               seasons=all_seasons)

    @app.route("/projections")
    def projections():
        c = conn()
        all_seasons = seasons()
        if not all_seasons:
            return render_template("empty.html")
        season = pick_season(all_seasons)
        league = metrics.league_rates(cached_lines(season["id"]))
        ids = [r[0] for r in c.execute(
            "SELECT DISTINCT player_id FROM player_games WHERE season_id = ?",
            (season["id"],)).fetchall()]
        projs = [projection.project_player(c, pid, league=league) for pid in ids]
        projs = [p for p in projs if p["teho_plus_proj"] is not None
                 and p["stats"]["kl_pct"]["effective_n"] >= 20]
        projs.sort(key=lambda p: p["teho_plus_proj"], reverse=True)
        return render_template("projections.html", projs=projs[:50],
                               season=season, seasons=all_seasons)

    @app.route("/about")
    def about():
        return render_template("about.html")

    @app.route("/glossary")
    def glossary():
        return render_template("glossary.html")

    @app.route("/leaderboard.csv")
    def leaderboard_csv():
        all_seasons = seasons()
        if not all_seasons:
            abort(404)
        season = pick_season(all_seasons)
        stat = request.args.get("stat", "vyk")
        if stat not in LEADERBOARD_STATS:
            abort(400)
        lines = metrics.leaderboard(conn(), season["id"], stat, limit=1000)
        cols = ["name", "team", "games", "turns_at_bat", "kunnarit", "lyodyt",
                "tuodut", "tehot", "kl_pct", "saatto_pct", "eten_pct",
                "palo_rate", "vyk", "jyk", "raa", "adv_plus", "adv1_pct", "adv2_pct", "adv3_pct",
                "adv_home_pct", "adv1_plus", "adv2_plus", "adv3_plus",
                "adv_home_plus", "runner_plus", "out_avoid_plus",
                "spark_index", "money_kl_pct", "money_kl_plus",
                "teho_plus", "teho_plus_adj"]
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(cols)
        for l in lines:
            w.writerow([l.get(c) for c in cols])
        return Response(buf.getvalue(), mimetype="text/csv", headers={
            "Content-Disposition":
                f"attachment; filename={season['series']}-{season['year']}-{stat}.csv"})

    @app.route("/search")
    def search():
        q = (request.args.get("q") or "").strip()
        rows = conn().execute(
            """SELECT DISTINCT p.id, p.name, MAX(pg.team) AS team,
                      MAX(s.year) AS last_year
               FROM players p JOIN player_games pg ON pg.player_id = p.id
               JOIN seasons s ON s.id = pg.season_id
               WHERE p.name LIKE ? GROUP BY p.id ORDER BY p.name LIMIT 50""",
            (f"%{q}%",)).fetchall() if len(q) >= 2 else []
        return render_template("search.html", q=q, results=rows)

    @app.route("/team/<team>")
    def team(team: str):
        all_seasons = seasons()
        if not all_seasons:
            return render_template("empty.html")
        c = conn()
        season = pick_season(all_seasons)
        # default to the latest season this team actually appears in
        if not request.args.get("sid"):
            row = c.execute(
                """SELECT season_id FROM player_games WHERE team = ?
                   ORDER BY date DESC LIMIT 1""", (team,)).fetchone()
            if row:
                season = next((s for s in all_seasons if s["id"] == row[0]), season)
        roster = [l for l in metrics.season_lines(c, season["id"])
                  if l["team"] == team]
        if not roster:
            abort(404)
        roster.sort(key=lambda l: l["tehot"], reverse=True)
        matches = c.execute(
            """SELECT * FROM matches WHERE season_id = ?
               AND (home_team = ? OR away_team = ?) ORDER BY date""",
            (season["id"], team, team)).fetchall()
        standing = next((t for t in simulate.standings(c, season["id"])
                         if t["team"] == team), None)
        return render_template("team.html", team=team, season=season,
                               roster=roster, matches=matches,
                               standing=standing)

    @app.route("/match/<int:match_id>")
    def match(match_id: int):
        c = conn()
        m = c.execute("SELECT m.*, s.series, s.year FROM matches m "
                      "JOIN seasons s ON s.id = m.season_id WHERE m.id = ?",
                      (match_id,)).fetchone()
        if not m:
            abort(404)
        lines = c.execute(
            """SELECT pg.*, p.name,
                      pg.kunnarit + pg.lyodyt + pg.tuodut AS tehot
               FROM player_games pg JOIN players p ON p.id = pg.player_id
               WHERE pg.match_id = ?
               ORDER BY pg.team, tehot DESC""", (match_id,)).fetchall()
        sides = {}
        for l in lines:
            sides.setdefault(l["team"], []).append(l)
        return render_template("match.html", m=m, sides=sides)

    @app.route("/player/<int:player_id>/baseball")
    def baseball(player_id: int):
        t = translate.translate_player(conn(), player_id,
                                       year=request.args.get("year", type=int))
        if not t:
            abort(404)
        return render_template("baseball.html", tr=t)

    @app.route("/baseball")
    def baseball_table():
        all_seasons = seasons()
        if not all_seasons:
            return render_template("empty.html")
        season = pick_season(all_seasons)
        sort = request.args.get("sort", "wrc_plus")
        rows = translate.translate_season(conn(), season["id"], sort=sort, limit=100)
        sort_options = ["wrc_plus", "h600_equiv", "avg_equiv", "hr600_equiv",
                        "hr_rbi600_equiv", "r600_equiv", "k_pct_equiv",
                        "teho_plus"]
        return render_template("baseball_leaderboard.html", rows=rows,
                               season=season, seasons=all_seasons, sort=sort,
                               sort_options=sort_options)

    @app.route("/league")
    def league():
        all_seasons = seasons()
        if not all_seasons:
            return render_template("empty.html")
        season = pick_season(all_seasons)
        c = conn()
        as_of = request.args.get("as_of") or None
        if as_of:
            table = simulate.playoff_odds(c, season["id"], as_of=as_of)
        else:
            table = simulate.standings(c, season["id"])
        # mid-season default demo: suggest a cutoff that leaves games to play
        same_series = [s["id"] for s in all_seasons
                       if s["series"] == season["series"]]
        history = cached_odds_history(season["id"])
        return render_template("league.html", table=table, season=season,
                               seasons=all_seasons, as_of=as_of,
                               graph_json=(json.dumps(history)
                                           if len(history.get("dates", [])) > 1
                                           else None),
                               parks=context.park_factors(c, same_series),
                               weather=context.weather_effects(c, same_series))

    @app.route("/player/<int:player_id>")
    def player(player_id: int):
        c = conn()
        row = c.execute("SELECT * FROM players WHERE id = ?", (player_id,)).fetchone()
        if not row:
            abort(404)
        career = metrics.player_seasons(c, player_id, lines_fn=cached_lines)
        if not career:
            abort(404)
        current = career[-1]
        season_lines = cached_lines(current["season_id"])
        metrics.add_percentiles(season_lines)
        line = next(l for l in season_lines if l["player_id"] == player_id)
        # anchor the projection prior to the player's OWN league — the
        # default "latest season" would be arbitrary with four leagues loaded
        proj = projection.project_player(
            c, player_id,
            league=metrics.league_rates(cached_lines(current["season_id"])))
        career_json = json.dumps([
            {"year": s["year"], "kl_pct": s["kl_pct"], "teho_plus": s["teho_plus"]}
            for s in career])
        base_lines = metrics.base_kl_lines(c, current["season_id"])
        metrics.add_percentiles(base_lines, stats=tuple(BASE_KL_KEYS))
        base_kl = next((b for b in base_lines if b["player_id"] == player_id), None)
        if base_kl and all(base_kl.get(f"{k}_tries", 0) == 0
                           for k in BASE_KL_KEYS):
            base_kl = None  # no per-base data (demo league)
        return render_template("player.html", player=row, career=career,
                               line=line, proj=proj, career_json=career_json,
                               pct_stats=PCT_STATS,
                               base_kl=base_kl,
                               base_keys=BASE_KL_KEYS,
                               log=metrics.game_log(c, player_id,
                                                    current["season_id"]),
                               comps=similarity.comps(c, player_id,
                                                      lines_fn=cached_lines))

    return app
