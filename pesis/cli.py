"""Command-line entry points: ``python -m pesis <command>``."""

from __future__ import annotations

import argparse
import json

from . import db, demo, metrics, tahko


def cmd_demo(args) -> None:
    conn = db.connect(args.db)
    demo.build_demo(conn, seed=args.seed)
    n = conn.execute("SELECT COUNT(*) FROM player_games").fetchone()[0]
    seasons = conn.execute("SELECT year, series FROM seasons ORDER BY year").fetchall()
    print(f"demo league built: {n} player-games across "
          f"{', '.join(str(s['year']) for s in seasons)} → {args.db or db.DEFAULT_DB_PATH}")


def cmd_ingest(args) -> None:
    from .api import PesisApi
    from .ingest import ingest_series
    conn = db.connect(args.db)
    api = PesisApi()
    n = ingest_series(conn, api, args.year, args.series_id, args.series_name)
    print(f"ingested {n} player-game rows for {args.series_name} {args.year}")


def _season_id(conn, year: int | None) -> int:
    row = conn.execute(
        "SELECT id FROM seasons WHERE (? IS NULL OR year = ?) ORDER BY year DESC LIMIT 1",
        (year, year)).fetchone()
    if not row:
        raise SystemExit("no seasons in the DB — run `python -m pesis demo` or ingest first")
    return row[0]


def cmd_leaderboard(args) -> None:
    conn = db.connect(args.db)
    lines = metrics.leaderboard(conn, _season_id(conn, args.year), args.stat,
                                limit=args.limit)
    fmt = "{:<3} {:<22} {:<10} {:>5} {:>7} {:>8}"
    print(fmt.format("#", "player", "team", "turns", "tehot", args.stat))
    for i, l in enumerate(lines, 1):
        val = l[args.stat]
        val = f"{val:.3f}" if isinstance(val, float) else str(val)
        print(fmt.format(i, l["name"][:22], (l["team"] or "")[:10],
                         l["turns_at_bat"], l["tehot"], val))


def cmd_project(args) -> None:
    conn = db.connect(args.db)
    league = tahko.latest_league_means(conn)
    if args.player:
        proj = tahko.project_player(conn, args.player, league=league)
        print(json.dumps(proj, indent=2, ensure_ascii=False))
        return
    ids = [r[0] for r in conn.execute(
        "SELECT DISTINCT player_id FROM player_games").fetchall()]
    projs = [tahko.project_player(conn, pid, league=league) for pid in ids]
    projs = [p for p in projs if p["teho_plus_proj"] is not None]
    projs.sort(key=lambda p: p["teho_plus_proj"], reverse=True)
    fmt = "{:<3} {:<22} {:>4} {:>10} {:>8}"
    print(fmt.format("#", "player", "age", "TEHO+proj", "KL%proj"))
    for i, p in enumerate(projs[:args.limit], 1):
        print(fmt.format(i, p["name"][:22], p["age"] or "-",
                         p["teho_plus_proj"], f"{p['stats']['kl_pct']['rate']:.3f}"))


def cmd_fit(args) -> None:
    conn = db.connect(args.db)
    league = tahko.latest_league_means(conn)
    for spec in tahko.DEFAULT_SPECS:
        tuned = tahko.fit_decay(conn, spec, league_mean=league.get(spec.name, 0.0))
        print(f"{spec.name:<14} beta={tuned.beta:<6} prior_strength={tuned.prior_strength}")


def cmd_runserver(args) -> None:
    from .web.app import create_app
    create_app(args.db).run(host="0.0.0.0", port=args.port, debug=False)


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(prog="pesis", description=__doc__)
    parser.add_argument("--db", default=None, help="SQLite path (default data/pesis.db)")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("demo", help="build the seeded synthetic league")
    p.add_argument("--seed", type=int, default=27)
    p.set_defaults(func=cmd_demo)

    p = sub.add_parser("ingest", help="backfill one series-season from the API")
    p.add_argument("--year", type=int, required=True)
    p.add_argument("--series-id", type=int, required=True)
    p.add_argument("--series-name", required=True)
    p.set_defaults(func=cmd_ingest)

    p = sub.add_parser("leaderboard", help="print a season leaderboard")
    p.add_argument("--stat", default="teho_plus")
    p.add_argument("--year", type=int, default=None)
    p.add_argument("--limit", type=int, default=25)
    p.set_defaults(func=cmd_leaderboard)

    p = sub.add_parser("project", help="TAHKO projections (all players or one)")
    p.add_argument("--player", type=int, default=None)
    p.add_argument("--limit", type=int, default=25)
    p.set_defaults(func=cmd_project)

    p = sub.add_parser("fit", help="walk-forward tune decay/prior per stat")
    p.set_defaults(func=cmd_fit)

    p = sub.add_parser("runserver", help="serve the web UI")
    p.add_argument("--port", type=int, default=5000)
    p.set_defaults(func=cmd_runserver)

    args = parser.parse_args(argv)
    args.func(args)
