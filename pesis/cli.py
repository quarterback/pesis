"""Command-line entry points: ``python -m pesis <command>``."""

from __future__ import annotations

import argparse
import json

from . import context, db, demo, metrics, projection, similarity, simulate, translate


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


def cmd_ingest_v1(args) -> None:
    import time as _time

    from . import v1import
    conn = db.connect(args.db)
    series = {"both": ["miehet", "naiset"],
              "all": ["miehet", "naiset", "ykkonen-miehet", "ykkonen-naiset"],
              }.get(args.series, [args.series])
    catalog = v1import.fetch_catalog()
    years = range(args.from_year or args.year, (args.to_year or args.year) + 1)
    for year in years:
        for s in series:
            try:
                stats = v1import.import_series(conn, year, s, phase=args.phase,
                                               catalog=catalog)
            except LookupError as exc:
                print(f"{year} {s}: skipped ({exc})")
                continue
            print(f"{year} {s}: {stats['rows']} player-game rows, "
                  f"{stats['matches']} matches, {stats['players']} players",
                  flush=True)
            _time.sleep(1)  # be polite on multi-season backfills


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
    league = projection.latest_league_means(conn)
    if args.player:
        proj = projection.project_player(conn, args.player, league=league)
        print(json.dumps(proj, indent=2, ensure_ascii=False))
        return
    ids = [r[0] for r in conn.execute(
        "SELECT DISTINCT player_id FROM player_games").fetchall()]
    projs = [projection.project_player(conn, pid, league=league) for pid in ids]
    projs = [p for p in projs if p["teho_plus_proj"] is not None]
    projs.sort(key=lambda p: p["teho_plus_proj"], reverse=True)
    fmt = "{:<3} {:<22} {:>4} {:>10} {:>8}"
    print(fmt.format("#", "player", "age", "eTEHO+", "KL%proj"))
    for i, p in enumerate(projs[:args.limit], 1):
        print(fmt.format(i, p["name"][:22], p["age"] or "-",
                         p["teho_plus_proj"], f"{p['stats']['kl_pct']['rate']:.3f}"))


def cmd_fit(args) -> None:
    conn = db.connect(args.db)
    league = projection.latest_league_means(conn)
    for spec in projection.DEFAULT_SPECS:
        tuned = projection.fit_decay(conn, spec, league_mean=league.get(spec.name, 0.0))
        print(f"{spec.name:<14} beta={tuned.beta:<6} prior_strength={tuned.prior_strength}")


def cmd_standings(args) -> None:
    conn = db.connect(args.db)
    sid = _season_id(conn, args.year)
    rows = (simulate.playoff_odds(conn, sid, as_of=args.as_of, seed=args.seed)
            if args.as_of else simulate.standings(conn, sid))
    cols = "{:<3} {:<12} {:>3} {:>3} {:>3} {:>3} {:>3} {:>4} {:>6}"
    header = cols.format("#", "team", "G", "W", "Ws", "Ls", "L", "pts", "diff")
    print(header + ("   playoff%" if args.as_of else ""))
    for i, t in enumerate(rows, 1):
        line = cols.format(i, t["team"], t["games"], t["wins"], t["super_wins"],
                           t["super_losses"], t["losses"], t["points"], t["run_diff"])
        if args.as_of:
            line += f"   {t['odds']:>6.1f}"
        print(line)


def cmd_parks(args) -> None:
    conn = db.connect(args.db)
    print("{:<20} {:>6} {:>10} {:>5}".format("stadium", "games", "runs/game", "PF"))
    for p in context.park_factors(conn):
        print("{:<20} {:>6} {:>10} {:>5}".format(
            p["stadium"], p["games"], p["runs_per_game"], p["pf"]))
    print()
    print("{:<22} {:>6} {:>13} {:>10}".format("wind", "games", "kunnarit/turn", "runs/game"))
    for w in context.weather_effects(conn):
        print("{:<22} {:>6} {:>13} {:>10}".format(
            w["wind"], w["games"], w["kunnari_rate"], w["runs_per_game"]))


def cmd_comps(args) -> None:
    conn = db.connect(args.db)
    result = similarity.comps(conn, args.player, year=args.year, limit=args.limit)
    if not result:
        raise SystemExit("no qualified season for that player")
    print("{:<5} {:<22} {:>5} {:>4} {:>6}".format("score", "player", "year", "age", "TEHO+"))
    for c in result:
        print("{:<5} {:<22} {:>5} {:>4} {:>6}".format(
            c["score"], c["name"][:22], c["year"], c["age"], c["teho_plus"]))


def cmd_mlb(args) -> None:
    conn = db.connect(args.db)
    t = translate.translate_player(conn, args.player, year=args.year)
    if not t:
        raise SystemExit("no season line for that player")
    print(f"{t['name']} ({t['team']}, {t['year']}) — "
          f"wRC+ equiv {t['wrc_plus']} ({t['tier']}); "
          f"162-game pace {t['pace']['HR']} HR / {t['pace']['RBI']} RBI / {t['pace']['R']} R")
    for r in t["rows"]:
        print(f"  {r['pesis_label']:<42} p{r['percentile']:<3} → "
              f"{r['mlb_stat']:<12} {r['mlb_value']}")


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

    p = sub.add_parser("ingest-v1",
                       help="keyless import of real data via v1.pesistulokset.fi")
    p.add_argument("--year", type=int, default=2026)
    p.add_argument("--from-year", type=int, default=None,
                   help="backfill start (granular data exists from 1991)")
    p.add_argument("--to-year", type=int, default=None)
    p.add_argument("--series", default="both",
                   help="miehet | naiset | ykkonen-miehet | ykkonen-naiset | "
                        "both (Superpesis) | all (Superpesis + Ykköspesis), "
                        "or any exact series name from the catalog")
    p.add_argument("--phase", type=int, default=1, help="1 = runkosarja")
    p.set_defaults(func=cmd_ingest_v1)

    p = sub.add_parser("leaderboard", help="print a season leaderboard")
    p.add_argument("--stat", default="teho_plus")
    p.add_argument("--year", type=int, default=None)
    p.add_argument("--limit", type=int, default=25)
    p.set_defaults(func=cmd_leaderboard)

    p = sub.add_parser("project", help="PARE projections (all players or one)")
    p.add_argument("--player", type=int, default=None)
    p.add_argument("--limit", type=int, default=25)
    p.set_defaults(func=cmd_project)

    p = sub.add_parser("fit", help="walk-forward tune decay/prior per stat")
    p.set_defaults(func=cmd_fit)

    p = sub.add_parser("standings", help="standings; with --as-of adds playoff odds")
    p.add_argument("--year", type=int, default=None)
    p.add_argument("--as-of", default=None, help="cutoff date, e.g. 2026-06-15")
    p.add_argument("--seed", type=int, default=1)
    p.set_defaults(func=cmd_standings)

    p = sub.add_parser("parks", help="park factors and weather effects")
    p.set_defaults(func=cmd_parks)

    p = sub.add_parser("comps", help="similarity scores for a player's season")
    p.add_argument("--player", type=int, required=True)
    p.add_argument("--year", type=int, default=None)
    p.add_argument("--limit", type=int, default=5)
    p.set_defaults(func=cmd_comps)

    p = sub.add_parser("mlb", help="pesis → baseball translation for a player")
    p.add_argument("--player", type=int, required=True)
    p.add_argument("--year", type=int, default=None)
    p.set_defaults(func=cmd_mlb)

    p = sub.add_parser("runserver", help="serve the web UI")
    p.add_argument("--port", type=int, default=5000)
    p.set_defaults(func=cmd_runserver)

    args = parser.parse_args(argv)
    args.func(args)
