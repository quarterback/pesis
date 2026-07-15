#!/usr/bin/env python3
"""Export all computed data from SQLite to site/data/ as static JSON files.

Run once after each DB refresh:
    python export.py

The site/ directory can then be deployed to Netlify, Vercel, or any static host.
"""
from __future__ import annotations
import json, re, unicodedata
from datetime import datetime, timezone
from pathlib import Path
from pesis import context, db, metrics, projection, simulate, translate

# Mallo-native analytics only — the site is additive to pesistulokset, never a
# clone of its counting columns (kunnarit/lyodyt/tuodut/tehot) or published rates.
# VYK/JYK are the value stats (wins/runs above replacement — the WAR analog).
LEADERBOARD_STATS = [
    "vyk", "jyk", "spark_index", "adv_plus", "runner_plus", "out_avoid_plus", "money_kl_plus",
    "adv1_pct", "adv2_pct", "adv3_pct", "adv_home_pct",
    "adv1_plus", "adv2_plus", "adv3_plus", "adv_home_plus",
    "teho_plus", "teho_plus_adj",
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


# Only the fields each view actually reads — keeps the historical export small.
ROSTER_FIELDS = ["player_id", "name", "games", "turns_at_bat", "pos",
                 "spark_index", "adv_plus", "runner_plus", "out_avoid_plus", "teho_plus"]
CAREER_FIELDS = ["year", "season_id", "team", "age", "games", "turns_at_bat",
                 "vyk", "spark_index", "adv_plus", "runner_plus", "out_avoid_plus",
                 "money_kl_plus", "teho_plus", "teho_plus_adj"]
LEADERBOARD_PLAYER_FIELDS = (["player_id", "name", "team", "games", "turns_at_bat",
                              "pos", "raa"] + LEADERBOARD_STATS)


def slim(d: dict, fields) -> dict:
    return {k: d.get(k) for k in fields}


def translation_card(line: dict) -> dict | None:
    """Concise player→MLB baseball translation for one season line, reusing the
    quantile map in pesis/translate.py (percentiles must already be attached)."""
    rows = []
    for m in translate.MAPPINGS:
        pct = line.get(f"pct_{m['stat']}")
        value = line.get(m["stat"])
        if pct is None or value is None:
            continue
        mlb = translate.mlb_value_for(m, pct, value)
        rows.append({"pesis_label": m["pesis"], "pesis_value": value,
                     "percentile": pct, "mlb_stat": m["mlb"],
                     "mlb_value": format(mlb, m["fmt"])})
    if not rows:
        return None
    pct_prod = line.get("pct_tehot_per_turn")
    wrc = (round(translate._quantile_value(pct_prod, 100.0, 25.0, +1))
           if pct_prod is not None else None)
    # No 162-game pace: a ~30-game pesäpallo season doesn't extrapolate honestly
    # to a full MLB season, so it isn't a fair "how good" measure.
    return {
        "wrc_plus": wrc, "tier": translate.wrc_tier(wrc) if wrc is not None else None,
        "rows": rows,
    }


def main():
    conn = db.connect()
    print("Exporting…")

    # ── Seasons & nav ──────────────────────────────────────────────────
    all_seasons = rows_to_dicts(conn.execute(
        "SELECT id, year, series FROM seasons ORDER BY year DESC, series"
    ).fetchall())
    max_year = max((s["year"] for s in all_seasons), default=0)
    nav_seasons = rows_to_dicts(conn.execute(
        """SELECT id, year, series FROM seasons s
           WHERE year = (SELECT MAX(year) FROM seasons WHERE series = s.series)
           ORDER BY series"""
    ).fetchall())
    # Stamp when this export ran so the site can show a "data last refreshed"
    # line in the footer. The daily workflow runs export.py right after each
    # ingest, so this doubles as the "data has been run" timestamp.
    generated = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    dump(OUT / "meta.json", {
        "generated": generated,
        "seasons": all_seasons,
        "nav_seasons": nav_seasons,
    })
    print(f"  meta.json  ({len(all_seasons)} seasons, generated {generated})")

    # ── Season-lines cache ─────────────────────────────────────────────
    _cache: dict = {}
    def cached_lines(sid):
        if sid not in _cache:
            _cache[sid] = metrics.season_lines(conn, sid)
        return [dict(l) for l in _cache[sid]]

    # (player search index removed — search feature not needed)

    # ── Per-season exports ─────────────────────────────────────────────
    for season in all_seasons:
        sid = season["id"]
        if (OUT / "leaderboard" / f"{sid}.json").exists():
            print(f"  season {season['year']} {season['series']}  (skip — already exported)")
            cached_lines(sid)  # warm cache
            continue
        lines = cached_lines(sid)

        # Leaderboard: qualified players only (the board hides the rest), slimmed
        # to the fields the table/pills/CSV/position-filter actually read.
        lb_lines = [slim(l, LEADERBOARD_PLAYER_FIELDS)
                    for l in lines if l["turns_at_bat"] >= metrics.QUALIFY_TURNS]
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

        # Projections (PARE) — forward-looking, only meaningful for the current
        # season, so skip the expensive projection pass for historical years.
        if season["year"] == max_year:
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

        # Lukkari (pitcher) run-prevention leaderboard
        dump(OUT / "lukkari" / f"{sid}.json", {
            "season": season, "lukkarit": metrics.lukkari_lines(conn, sid),
        })

        # Teams — roster ranked by SPARK (Mallo composite), unqualified players last
        teams = {l["team"] for l in lines if l.get("team")}
        for team in teams:
            roster = sorted(
                [l for l in cached_lines(sid) if l.get("team") == team],
                key=lambda l: (l.get("spark_index") if l.get("spark_index") is not None
                               else -1, l["tehot"]), reverse=True)
            if not roster:
                continue
            standing = next(
                (t for t in simulate.standings(conn, sid) if t["team"] == team), None)
            slug = slugify(team)
            dump(OUT / "teams" / f"{slug}-{sid}.json", {
                "team": team, "slug": slug, "season": season,
                "roster": [slim(l, ROSTER_FIELDS) for l in roster], "standing": standing,
            })

        print(f"  season {season['year']} {season['series']}  "
              f"(id={sid}, {len(teams)} teams)")

    # ── Player profiles ────────────────────────────────────────────────
    # Cache percentile-added season lines and base_kl lines per season_id
    _pct_cache: dict = {}
    _base_cache: dict = {}
    _league_cache: dict = {}

    def pct_lines(sid):
        if sid not in _pct_cache:
            sl = [dict(l) for l in cached_lines(sid)]
            metrics.add_percentiles(sl)
            _pct_cache[sid] = sl
        return _pct_cache[sid]

    def base_lines_cached(sid):
        if sid not in _base_cache:
            bl = metrics.base_kl_lines(conn, sid)
            metrics.add_percentiles(bl, stats=tuple(BASE_KL_KEYS))
            _base_cache[sid] = bl
        return _base_cache[sid]

    def league_rates_cached(sid):
        if sid not in _league_cache:
            _league_cache[sid] = metrics.league_rates(cached_lines(sid))
        return _league_cache[sid]

    _trans_cache: dict = {}

    def translations_for(sid):
        if sid not in _trans_cache:
            tl = [dict(l) for l in cached_lines(sid)]
            metrics.add_percentiles(tl, stats=tuple(m["stat"] for m in translate.MAPPINGS)
                                    + ("tehot_per_turn",))
            _trans_cache[sid] = {l["player_id"]: card for l in tl
                                 if (card := translation_card(l))}
        return _trans_cache[sid]

    _lukkari_trans_cache: dict = {}

    def lukkari_trans_for(sid):
        """Per-player lukkari (pitcher) → MLB run-prevention card for a season."""
        if sid not in _lukkari_trans_cache:
            lk = metrics.lukkari_lines(conn, sid)
            lras = [l["lra"] for l in lk if l["lra"] is not None]
            n = len(lras)
            m: dict = {}
            for l in lk:
                if l["lra"] is None:
                    continue
                worse = sum(1 for x in lras if x > l["lra"])   # higher LRA = worse
                equal = sum(1 for x in lras if x == l["lra"])
                pct = round(100 * (worse + 0.5 * equal) / n) if n else 50
                era = translate.era_equivalent(pct)
                m[l["player_id"]] = {
                    "era": format(era, ".2f"), "tier": translate.era_tier(era),
                    "games": l["lukkari_games"],
                    "rows": [
                        {"pesis": "Päästetyt juoksut / ottelu (LRA)",
                         "arvo": format(l["lra"], ".2f"), "pctile": pct,
                         "mlb": "ERA", "kaannos": format(era, ".2f")},
                        {"pesis": "LRA- (sarjaindeksi, 100 = ka.)",
                         "arvo": str(l["lra_minus"]), "pctile": None,
                         "mlb": "ERA-", "kaannos": str(l["lra_minus"])},
                        {"pesis": "Estetyt juoksut (kausi)",
                         "arvo": str(l["lukkari_rp"]), "pctile": None,
                         "mlb": "Runs saved", "kaannos": str(l["lukkari_rp"])},
                    ],
                }
            _lukkari_trans_cache[sid] = m
        return _lukkari_trans_cache[sid]

    # Players ordered by most recent season first — 2026 gets written before older history
    player_ids = [r[0] for r in conn.execute(
        """SELECT DISTINCT p.id FROM players p
           JOIN player_games pg ON pg.player_id = p.id
           JOIN seasons s ON s.id = pg.season_id
           ORDER BY s.year DESC, p.id"""
    ).fetchall()]
    done = skipped = 0
    for pid in player_ids:
        out_path = OUT / "players" / f"{pid}.json"
        if out_path.exists():
            skipped += 1
            continue
        row = conn.execute("SELECT * FROM players WHERE id = ?", (pid,)).fetchone()
        if not row:
            continue
        career = metrics.player_seasons(conn, pid, lines_fn=cached_lines)
        if not career:
            continue
        current = career[-1]
        sid = current["season_id"]

        sl = pct_lines(sid)
        line = next((l for l in sl if l["player_id"] == pid), None)
        if not line:
            continue

        # PARE projection is forward-looking — only compute it for players whose
        # latest season is the current one (skips the expensive pass for retired
        # players and every historical season line).
        proj = (projection.project_player(conn, pid, league=league_rates_cached(sid))
                if current["year"] == max_year else None)

        career_json = [
            {"year": s["year"], "kl_pct": s["kl_pct"], "teho_plus": s["teho_plus"]}
            for s in career
        ]

        bl = base_lines_cached(sid)
        base_kl = next((b for b in bl if b["player_id"] == pid), None)
        if base_kl and all(base_kl.get(f"kl_base{k}_tries", 0) == 0 for k in range(4)):
            base_kl = None

        # Baseball translation — current-season players only (batting + lukkari)
        translation = (translations_for(sid).get(pid)
                       if current["year"] == max_year else None)
        pitching = (lukkari_trans_for(sid).get(pid)
                    if current["year"] == max_year else None)

        dump(out_path, {
            "player": dict(row),
            "career": [slim(s, CAREER_FIELDS) for s in career],
            "line": line,
            "proj": proj,
            "translation": translation,
            "pitching": pitching,
            "career_json": career_json,
            "pct_stats": PCT_STATS,
            "base_kl": base_kl,
            "base_keys": BASE_KL_KEYS,
            "comps": [],
        })
        done += 1

    print(f"  {len(player_ids)} player profiles  ({done} written, {skipped} skipped)")
    # Match box scores are intentionally NOT exported — the site is additive to
    # pesistulokset, not a re-hosting of its per-match line scores.
    print("Done.")


if __name__ == "__main__":
    main()
