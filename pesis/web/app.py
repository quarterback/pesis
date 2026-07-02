"""Flask UI: FanGraphs-style leaderboards, Savant-style player pages.

Server-rendered, no JS chart library — percentile bars are HTML/CSS, the
career sparkline is inline SVG built here. Reads the same SQLite store the
CLI writes.
"""

from __future__ import annotations

import sqlite3

from flask import Flask, abort, g, render_template, request

from .. import context, db, metrics, similarity, simulate, tahko, translate

PCT_STATS = [
    ("kl_pct", "Kärkilyönti-%"),
    ("saatto_pct", "Saatto-%"),
    ("eten_pct", "Etenemis-%"),
    ("kunnari_rate", "Kunnarit / vuoro"),
    ("lyoty_rate", "Lyödyt / vuoro"),
    ("palo_rate", "Palot / vuoro"),
    ("tehot_per_turn", "Tehot / vuoro"),
]

LEADERBOARD_STATS = ["teho_plus", "teho_plus_adj", "tehot", "kl_pct",
                     "saatto_pct", "eten_pct", "kunnarit", "lyodyt", "tuodut",
                     "palo_rate"]


def pct_bucket(pct: int | None) -> int | None:
    """Percentile → diverging-ramp bucket 0..6 (red pole → neutral → blue pole)."""
    if pct is None:
        return None
    for i, ceiling in enumerate((10, 25, 40, 60, 75, 90)):
        if pct < ceiling:
            return i
    return 6


def sparkline(values: list[float], width: int = 220, height: int = 44,
              pad: int = 5) -> dict | None:
    """Points for an inline-SVG line (2px stroke, ringed end dot)."""
    vals = [v for v in values if v is not None]
    if len(vals) < 2:
        return None
    lo, hi = min(vals), max(vals)
    span = (hi - lo) or 1.0
    step = (width - 2 * pad) / (len(values) - 1)
    pts = [
        (round(pad + i * step, 1),
         round(height - pad - (height - 2 * pad) * (v - lo) / span, 1))
        for i, v in enumerate(values) if v is not None
    ]
    return {"points": " ".join(f"{x},{y}" for x, y in pts), "end": pts[-1],
            "width": width, "height": height}


def traj_svg(career: list, width: int = 320, height: int = 118) -> dict | None:
    """Build SVG data for TEHO+ career trajectory chart (Mallo design)."""
    pad_x, label_h = 30, 14
    data = [(s["year"], s["teho_plus"]) for s in career if s.get("teho_plus") is not None]
    if len(data) < 2:
        return None
    years, vals = zip(*data)
    lo, hi = min(vals), max(vals)
    span = (hi - lo) or 1.0
    baseline = height - label_h
    inner_h = baseline - pad_x
    inner_w = width - 2 * pad_x
    step = inner_w / (len(vals) - 1)
    pts = [
        (round(pad_x + i * step, 1),
         round(baseline - inner_h * (v - lo) / span, 1))
        for i, v in enumerate(vals)
    ]
    poly = " ".join(f"{x},{y}" for x, y in pts)
    area = poly + f" {pts[-1][0]},{baseline} {pts[0][0]},{baseline}"
    dots = [{"x": x, "y": y, "label": str(yr)} for (x, y), yr in zip(pts, years)]
    return {
        "points": poly, "area": area, "dots": dots,
        "baseline": baseline, "width": width, "height": height,
        "area_opacity": 0.18,
    }


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

    @app.teardown_appcontext
    def close(_exc):
        if "db" in g:
            g.pop("db").close()

    def seasons():
        return conn().execute(
            "SELECT id, year, series FROM seasons ORDER BY year DESC").fetchall()

    @app.route("/")
    @app.route("/leaderboard")
    def leaderboard():
        all_seasons = seasons()
        if not all_seasons:
            return render_template("empty.html")
        year = request.args.get("year", type=int) or all_seasons[0]["year"]
        stat = request.args.get("stat", "teho_plus")
        if stat not in LEADERBOARD_STATS:
            abort(400)
        season = next((s for s in all_seasons if s["year"] == year), all_seasons[0])
        lines = metrics.leaderboard(conn(), season["id"], stat, limit=50)
        return render_template("leaderboard.html", lines=lines, stat=stat,
                               stats=LEADERBOARD_STATS, season=season,
                               seasons=all_seasons)

    @app.route("/projections")
    def projections():
        c = conn()
        league = tahko.latest_league_means(c)
        ids = [r[0] for r in c.execute(
            "SELECT DISTINCT player_id FROM player_games").fetchall()]
        projs = [tahko.project_player(c, pid, league=league) for pid in ids]
        projs = [p for p in projs if p["teho_plus_proj"] is not None
                 and p["stats"]["kl_pct"]["effective_n"] >= 20]
        projs.sort(key=lambda p: p["teho_plus_proj"], reverse=True)
        return render_template("projections.html", projs=projs[:50])

    @app.route("/about")
    def about():
        return render_template("about.html")

    @app.route("/player/<int:player_id>/baseball")
    def baseball(player_id: int):
        t = translate.translate_player(conn(), player_id,
                                       year=request.args.get("year", type=int))
        if not t:
            abort(404)
        return render_template("baseball.html", t=t)

    @app.route("/league")
    def league():
        all_seasons = seasons()
        if not all_seasons:
            return render_template("empty.html")
        year = request.args.get("year", type=int) or all_seasons[0]["year"]
        season = next((s for s in all_seasons if s["year"] == year), all_seasons[0])
        c = conn()
        as_of = request.args.get("as_of") or None
        if as_of:
            table = simulate.playoff_odds(c, season["id"], as_of=as_of)
        else:
            table = simulate.standings(c, season["id"])
        # mid-season default demo: suggest a cutoff that leaves games to play
        return render_template("league.html", table=table, season=season,
                               seasons=all_seasons, as_of=as_of,
                               parks=context.park_factors(c),
                               weather=context.weather_effects(c))

    @app.route("/player/<int:player_id>")
    def player(player_id: int):
        c = conn()
        row = c.execute("SELECT * FROM players WHERE id = ?", (player_id,)).fetchone()
        if not row:
            abort(404)
        career = metrics.player_seasons(c, player_id)
        if not career:
            abort(404)
        current = career[-1]
        season_lines = metrics.season_lines(c, current["season_id"])
        metrics.add_percentiles(season_lines)
        line = next(l for l in season_lines if l["player_id"] == player_id)
        proj = tahko.project_player(c, player_id)
        traj = traj_svg(career)
        return render_template("player.html", player=row, career=career,
                               line=line, proj=proj, traj=traj,
                               pct_stats=PCT_STATS,
                               comps=similarity.comps(c, player_id))

    return app
