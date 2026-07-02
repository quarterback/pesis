"""SQLite schema for the analytics store.

One row of ``player_games`` per player per match — the grain both the metrics
layer and the projections operate on. Normalized columns cover the core
pesäpallo stat line; the full upstream payload is kept in ``raw`` (JSON) so new
metrics never require a re-fetch.

Column glossary (Finnish stat line → column):
    kunnarit      home runs (K)
    lyodyt        runs batted home as batter (L, lyödyt juoksut)
    tuodut        runs scored as runner (T, tuodut juoksut)
    karkilyonnit / karki_yritykset
                  advancing the lead runner: successes / attempts (KL / KLY)
    saatot / saatto_yritykset
                  advancing a trailing runner (saatto)
    etenemiset / eteneminen_yritykset
                  advances as the runner (kärki- + takaeteneminen)
    haavat        wounds (batter-caused outs-in-waiting on own advance)
    palot         outs (as batter or runner)
    turns_at_bat  plate turns — the denominator for per-turn rates
"""

from __future__ import annotations

import os
import sqlite3

DEFAULT_DB_PATH = os.environ.get("PESIS_DB_PATH", "data/pesis.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS players (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    born_year  INTEGER
);

CREATE TABLE IF NOT EXISTS seasons (
    id      INTEGER PRIMARY KEY,
    year    INTEGER NOT NULL,
    series  TEXT NOT NULL,            -- e.g. 'Superpesis (miehet)'
    UNIQUE (year, series)
);

CREATE TABLE IF NOT EXISTS matches (
    id          INTEGER PRIMARY KEY,
    season_id   INTEGER NOT NULL REFERENCES seasons(id),
    date        TEXT NOT NULL,
    home_team   TEXT NOT NULL,
    away_team   TEXT NOT NULL,
    stadium     TEXT,
    temperature REAL,               -- °C
    wind        REAL,               -- m/s
    rain        INTEGER,            -- 0/1
    attendance  INTEGER,
    home_runs   INTEGER,
    away_runs   INTEGER,
    periods_home INTEGER,           -- period points incl. tiebreak (periods can be DRAWN: 1-0, 0-1 occur)
    periods_away INTEGER,
    tiebreak    INTEGER             -- 1 if supervuoro/kotiutuslyöntikilpailu was played
);

CREATE INDEX IF NOT EXISTS idx_matches_season ON matches(season_id, date);

CREATE TABLE IF NOT EXISTS player_games (
    player_id            INTEGER NOT NULL REFERENCES players(id),
    season_id            INTEGER NOT NULL REFERENCES seasons(id),
    match_id             INTEGER NOT NULL,
    date                 TEXT NOT NULL,   -- ISO yyyy-mm-dd
    team                 TEXT,
    opponent             TEXT,
    home                 INTEGER,        -- 1 home / 0 away
    turns_at_bat         INTEGER NOT NULL DEFAULT 0,
    kunnarit             INTEGER NOT NULL DEFAULT 0,
    lyodyt               INTEGER NOT NULL DEFAULT 0,
    tuodut               INTEGER NOT NULL DEFAULT 0,
    karkilyonnit         INTEGER NOT NULL DEFAULT 0,
    karki_yritykset      INTEGER NOT NULL DEFAULT 0,
    saatot               INTEGER NOT NULL DEFAULT 0,
    saatto_yritykset     INTEGER NOT NULL DEFAULT 0,
    etenemiset           INTEGER NOT NULL DEFAULT 0,
    eteneminen_yritykset INTEGER NOT NULL DEFAULT 0,
    haavat               INTEGER NOT NULL DEFAULT 0,
    palot                INTEGER NOT NULL DEFAULT 0,
    raw                  TEXT,           -- full upstream JSON row
    PRIMARY KEY (player_id, match_id)
);

CREATE INDEX IF NOT EXISTS idx_pg_season ON player_games(season_id);
CREATE INDEX IF NOT EXISTS idx_pg_player_date ON player_games(player_id, date);
"""


def connect(path: str | None = None) -> sqlite3.Connection:
    path = path or DEFAULT_DB_PATH
    if path != ":memory:":
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    # additive migrations for DBs created before a column existed
    for ddl in ("ALTER TABLE matches ADD COLUMN periods_home INTEGER",
                "ALTER TABLE matches ADD COLUMN periods_away INTEGER",
                "ALTER TABLE matches ADD COLUMN tiebreak INTEGER"):
        try:
            conn.execute(ddl)
        except sqlite3.OperationalError:
            pass  # column already there
    return conn
