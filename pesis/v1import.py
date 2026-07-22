"""Keyless import of real Superpesis data from v1.pesistulokset.fi.

The legacy results site serves the same stats-tool data as the official API,
but same-origin and WITHOUT an api key: one GET to
``/api/v1/stats-tool/players?season=&seasonSeries=&phase=`` returns every
per-player per-match row for a series-season (82 fields — weather,
attendance, per-period scores, kärkilyönnit by base, the lot) plus ``maps``
that resolve player names, teams and matches (with real stadiums).

This is the bridge until the official key (requested from
tulospalvelu@pesis.fi) arrives; it makes one polite request per
series-season. Season/seasonSeries ids come from the catalog blob embedded
in the site's HTML (82 seasons of them).

Field semantics (upstream → normalized):
    homeruns              kunnarit
    scorings              lyödyt (runs batted home)
    runs / runs_tries     tuodut / tuontiyritykset (as runner)
    batpe_total_*         kärkilyönnit: succeeded/tries (by base in raw)
    batadv_*              saatot (advancing trailing runners as batter)
    runpadv_* / runtadv_* etenemiset as lead/trailing runner; their
                          ``caughts`` are haavat (wounds), ``outs`` palot
    turns_at_bat          plate turns
    windy / rainy         0/1 flags (NOT m/s — context.weather_effects
                          detects flag data and buckets accordingly)
"""

from __future__ import annotations

import gzip
import http.client
import json
import re
import sqlite3
import time
import urllib.error
import urllib.request

from . import ingest

V1_BASE = "https://v1.pesistulokset.fi"
# gzip matters: payloads are multi-MB and long chunked transfers are the
# main failure mode — compressed they are ~10x smaller
_HEADERS = {"User-Agent": "mallo-analytics/0.1 (mallo pesäpallo analytics)",
            "Accept": "application/json",
            "Accept-Encoding": "gzip"}

SERIES_ALIASES = {
    "miehet": "Miesten Superpesis", "naiset": "Naisten Superpesis",
    "ykkonen-miehet": "Miesten Ykköspesis",
    "ykkonen-naiset": "Naisten Ykköspesis",
    "suomensarja-miehet": "Miesten Suomensarja",
    "suomensarja-naiset": "Naisten Suomensarja",
    # The catalog spells Suomensarja with a lowercase s from 2020 on
    # ('Miesten suomensarja'); lookups are keyed on the lowercased input, so
    # these entries fold both catalog spellings into one canonical DB label.
    "miesten suomensarja": "Miesten Suomensarja",
    "naisten suomensarja": "Naisten Suomensarja",
}


def _get(url: str, retries: int = 5):
    """GET with gzip + retries — transient truncated reads happen on the big
    payloads; a build-time bake must survive them."""
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers=_HEADERS)
            with urllib.request.urlopen(req, timeout=120) as resp:
                body = resp.read()
                if resp.headers.get("Content-Encoding") == "gzip":
                    body = gzip.decompress(body)
                return body.decode("utf-8")
        except (http.client.IncompleteRead, urllib.error.URLError,
                TimeoutError, gzip.BadGzipFile):
            if attempt == retries:
                raise
            time.sleep(1 + attempt)


def fetch_catalog() -> dict:
    """Season/series catalog embedded as JSON in the v1 stats page HTML."""
    html = _get(f"{V1_BASE}/tilastot")
    m = re.search(r'\{"seasons"', html)
    if not m:
        raise RuntimeError("catalog blob not found in v1 page — layout changed?")
    data, _end = json.JSONDecoder().raw_decode(html, m.start())
    return data


def resolve_series(catalog: dict, year: int, series_name: str) -> tuple[int, int]:
    """(season id, seasonSeries id) for e.g. (2026, 'Miesten Superpesis').

    Matching is case-insensitive: the catalog's capitalization drifts across
    eras (Suomensarja is 'Miesten Suomensarja' through 2019, 'Miesten
    suomensarja' from 2020), and the DB label must not fork on that.
    """
    wanted = SERIES_ALIASES.get(series_name.lower(), series_name).lower()
    for s in catalog["seasons"]["seasons"]:
        if s["season"]["season"] != year:
            continue
        for ss in s["seasonSerieses"]:
            row = ss["seasonSeries"]
            if row["name"].lower() == wanted:
                return s["season"]["id"], row["id"]
        raise LookupError(f"series {series_name!r} not found in {year}")
    raise LookupError(f"season {year} not in catalog")


def fetch_stats(season_id: int, season_series_id: int, phase: int = 1) -> dict:
    url = (f"{V1_BASE}/api/v1/stats-tool/players?season={season_id}"
           f"&seasonSeries={season_series_id}&phase={phase}")
    return json.loads(_get(url))


def _index(map_list) -> dict:
    return {e["id"]: e["value"] for e in (map_list or [])}


def _normalize(row: dict) -> dict:
    return {
        "turns_at_bat": row.get("turns_at_bat") or 0,
        "kunnarit": row.get("homeruns") or 0,
        "lyodyt": row.get("scorings") or 0,
        "tuodut": row.get("runs") or 0,
        "karkilyonnit": row.get("batpe_total_succeeded") or 0,
        "karkilyonti_yritykset": row.get("batpe_total_tries") or 0,
        "saatot": row.get("batadv_succeeded") or 0,
        "saatto_yritykset": row.get("batadv_tries") or 0,
        "etenemiset": (row.get("runpadv_succeeded") or 0) + (row.get("runtadv_succeeded") or 0),
        "eteneminen_yritykset": (row.get("runpadv_tries") or 0) + (row.get("runtadv_tries") or 0),
        "haavat": (row.get("runpadv_caughts") or 0) + (row.get("runtadv_caughts") or 0),
        # upstream typo is real: runtadv_out (no s)
        "palot": (row.get("runpadv_outs") or 0) + (row.get("runtadv_out") or 0),
    }


def _int(v) -> int:
    """Historical payloads sometimes carry numbers as strings."""
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


def _match_runs(result: dict) -> tuple[int | None, int | None]:
    """Total runs per side: periods + super inning (scoring contest excluded —
    it's a shootout, not run environment)."""
    if not result:
        return None, None
    d = result.get("details") or result
    home = sum(_int(d.get(k)) for k in
               ("runs_home_first_period", "runs_home_second_period", "runs_home_super_inning"))
    away = sum(_int(d.get(k)) for k in
               ("runs_away_first_period", "runs_away_second_period", "runs_away_super_inning"))
    return home, away


def _match_periods(result: dict) -> tuple[int | None, int | None, int | None]:
    """(periods_home, periods_away, tiebreak_played). Periods can be DRAWN
    (results like 1-0 and 0-1 occur); a tiebreak (supervuoro and/or
    kotiutuslyöntikilpailu) is detected from its run fields being present —
    the loser's 1 point depends on it."""
    if not result:
        return None, None, None
    d = result.get("details") or result
    tiebreak = int(any(d.get(k) is not None for k in (
        "runs_home_super_inning", "runs_away_super_inning",
        "runs_home_scoring_contest", "runs_away_scoring_contest")))
    ph, pa = d.get("periods_home"), d.get("periods_away")
    return (None if ph is None else _int(ph),
            None if pa is None else _int(pa), tiebreak)


def import_payload(conn: sqlite3.Connection, payload: dict, year: int,
                   series_label: str) -> dict:
    """Load one stats-tool response into the store. Pure — testable offline."""
    players = _index(payload["maps"].get("player"))
    teams = _index(payload["maps"].get("team"))
    matches = _index(payload["maps"].get("matches"))
    season_id = ingest.upsert_season(conn, year, series_label)

    def team_name(tid):
        t = teams.get(tid)
        return (t.get("shorthand") or t.get("name")) if t else str(tid)

    match_weather: dict[int, dict] = {}
    n_rows = 0
    for row in payload["data"]:
        pid = row["player_id"]
        player = players.get(pid, {})
        normalized = _normalize(row)
        normalized.update({
            "player_id": pid,
            "player_name": player.get("name", f"#{pid}"),
            "match_id": row["match_id"],
            "date": row["match_date"],
            "team": team_name(row["team_id"]),
            "opponent": team_name(row.get("opponent_team_id")),
            "home": row.get("is_home"),
            "_v1": row,  # full upstream row rides along in `raw`
        })
        ingest.insert_player_game(conn, season_id, normalized)
        match_weather.setdefault(row["match_id"], {
            "temperature": row.get("temperature"),
            "wind": row.get("windy"), "rain": row.get("rainy"),
            "attendance": row.get("spectators"),
        })
        n_rows += 1

    n_matches = 0
    for mid, m in matches.items():
        home_runs, away_runs = _match_runs(m.get("result"))
        periods_home, periods_away, tiebreak = _match_periods(m.get("result"))
        stadium = (m.get("stadium") or {}).get("name")
        weather = match_weather.get(mid, {})
        ingest.insert_match(conn, season_id, {
            "id": mid, "date": (m.get("date") or "")[:10],
            "home_team": team_name(m.get("home")),
            "away_team": team_name(m.get("away")),
            "stadium": stadium, "home_runs": home_runs, "away_runs": away_runs,
            "periods_home": periods_home, "periods_away": periods_away,
            "tiebreak": tiebreak,
            **weather,
        })
        n_matches += 1

    conn.commit()
    return {"players": len(players), "rows": n_rows, "matches": n_matches}


def import_series(conn: sqlite3.Connection, year: int, series: str,
                  phase: int = 1, catalog: dict | None = None) -> dict:
    catalog = catalog or fetch_catalog()
    season_id, ss_id = resolve_series(catalog, year, series)
    label = SERIES_ALIASES.get(series.lower(), series)
    payload = fetch_stats(season_id, ss_id, phase)
    return import_payload(conn, payload, year, label)
