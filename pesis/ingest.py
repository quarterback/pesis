"""Normalize pesistulokset.fi API payloads into the local store.

The per-player per-match rows from ``/stats-tool/players`` carry ~82 fields.
FIELD_MAP maps our normalized columns to candidate upstream keys; the first
key present in a row wins. The map was drafted from observed API traffic
(e.g. ``turns_at_bat``, ``batadv`` for saatot, ``runpadv``/``runtadv`` for
kärki-/takaetenemiset) — confirm it against ``/public/stats-definitions``
with a real key before a full backfill, and extend it rather than renaming
columns. Unmapped fields are preserved verbatim in ``player_games.raw``.
"""

from __future__ import annotations

import json
import sqlite3

from .api import PesisApi

# normalized column -> candidate upstream keys, first match wins
FIELD_MAP: dict[str, tuple[str, ...]] = {
    "turns_at_bat": ("turns_at_bat", "batTurns", "vuorot"),
    "kunnarit": ("kunnarit", "homeruns", "hr"),
    "lyodyt": ("lyodyt", "batted_in", "l"),
    "tuodut": ("tuodut", "runs", "t"),
    "karkilyonnit": ("karkilyonnit", "advhits", "kl"),
    "karki_yritykset": ("karkilyonti_yritykset", "advhit_tries", "kly"),
    "saatot": ("saatot", "batadv"),
    "saatto_yritykset": ("saatto_yritykset", "batadv_tries"),
    "etenemiset": ("etenemiset", "runpadv", "runadv"),
    "eteneminen_yritykset": ("eteneminen_yritykset", "runpadv_tries", "runadv_tries"),
    "haavat": ("haavat", "wounds"),
    "palot": ("palot", "outs"),
}


def _pick(row: dict, keys: tuple[str, ...]) -> int:
    for key in keys:
        if key in row and row[key] is not None:
            return int(row[key])
    return 0


def upsert_player(conn: sqlite3.Connection, pid: int, name: str,
                  born_year: int | None = None) -> None:
    conn.execute(
        "INSERT INTO players (id, name, born_year) VALUES (?, ?, ?) "
        "ON CONFLICT(id) DO UPDATE SET name = excluded.name, "
        "born_year = COALESCE(excluded.born_year, players.born_year)",
        (pid, name, born_year),
    )


def insert_match(conn: sqlite3.Connection, season_id: int, match: dict) -> None:
    """Store one match's context row. ``match`` keys mirror the columns; the
    real ``/public/match`` payload carries stadium, weather, temperature and
    spectators — map them here when wiring the real backfill."""
    conn.execute(
        """INSERT OR REPLACE INTO matches
           (id, season_id, date, home_team, away_team, stadium, temperature,
            wind, rain, attendance, home_runs, away_runs,
            periods_home, periods_away, tiebreak)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (match["id"], season_id, match["date"], match["home_team"],
         match["away_team"], match.get("stadium"), match.get("temperature"),
         match.get("wind"), match.get("rain"), match.get("attendance"),
         match.get("home_runs"), match.get("away_runs"),
         match.get("periods_home"), match.get("periods_away"),
         match.get("tiebreak")),
    )


def upsert_season(conn: sqlite3.Connection, year: int, series: str) -> int:
    conn.execute(
        "INSERT OR IGNORE INTO seasons (year, series) VALUES (?, ?)", (year, series)
    )
    return conn.execute(
        "SELECT id FROM seasons WHERE year = ? AND series = ?", (year, series)
    ).fetchone()[0]


def insert_player_game(conn: sqlite3.Connection, season_id: int, row: dict) -> None:
    """Insert one normalized player-game. ``row`` is an upstream stat row plus
    the keys player_id, player_name, match_id, date (and optionally team,
    opponent, home, born_year)."""
    upsert_player(conn, row["player_id"], row["player_name"], row.get("born_year"))
    values = {col: _pick(row, keys) for col, keys in FIELD_MAP.items()}
    conn.execute(
        f"""INSERT OR REPLACE INTO player_games
            (player_id, season_id, match_id, date, team, opponent, home,
             {', '.join(values)}, raw)
            VALUES (?, ?, ?, ?, ?, ?, ?, {', '.join('?' * len(values))}, ?)""",
        (row["player_id"], season_id, row["match_id"], row["date"],
         row.get("team"), row.get("opponent"), row.get("home"),
         *values.values(), json.dumps(row, ensure_ascii=False)),
    )


def ingest_series(conn: sqlite3.Connection, api: PesisApi, year: int,
                  series_id: int, series_name: str) -> int:
    """Backfill one series-season from the API. Returns rows inserted.

    Expects ``/stats-tool/players`` rows keyed per player per match; adjust
    here (not in the DB schema) if the live payload nests differently.
    """
    season_id = upsert_season(conn, year, series_name)
    rows = api.stats_players(series_id=series_id)
    count = 0
    for row in rows if isinstance(rows, list) else rows.get("data", []):
        insert_player_game(conn, season_id, row)
        count += 1
    conn.commit()
    return count
