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
    palot         outs on the player's own advance attempts, as lead or
                  trailing runner (runpadv_outs + runtadv_out); outs by
                  other runners during the turn are not included
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

-- Play-by-play fetch ledger: one row per match ever attempted, so matches
-- without live scoring ('missing') are never refetched on the daily run.
CREATE TABLE IF NOT EXISTS pbp_meta (
    match_id      INTEGER PRIMARY KEY,     -- == matches.id == upstream match id
    season_id     INTEGER,
    fetched_at    TEXT NOT NULL,           -- ISO UTC of the last attempt
    status        TEXT NOT NULL,           -- 'ok' | 'missing' | 'error' | 'unfinished'
    finished      INTEGER,                 -- payload finished flag
    parse_version INTEGER,                 -- pbp.PARSE_VERSION used for the stored plays
    n_groups      INTEGER,
    n_plays       INTEGER,
    n_warnings    INTEGER NOT NULL DEFAULT 0,
    warnings      TEXT                     -- JSON sample of unrecognized tokens
);

-- One row per play-by-play sub-event. Parsed form only; the raw JSON is not
-- kept (the Actions cache holds the DB and raw payloads are ~230 KB/match).
CREATE TABLE IF NOT EXISTS plays (
    match_id     INTEGER NOT NULL,
    seq          INTEGER NOT NULL,          -- order over the whole match
    season_id    INTEGER NOT NULL,
    group_id     INTEGER,                   -- upstream event-group id
    group_type   TEXT NOT NULL,             -- 'o','he','m','is','t','x','osc','doc',...
    period       INTEGER NOT NULL,          -- 0/1 jakso, 2 supervuoro, 3 scoring contest
    inning       INTEGER NOT NULL,
    bat_turn     INTEGER NOT NULL,          -- 0 = opening half, 1 = closing half
    bat_team_id  INTEGER,                   -- upstream id of the batting team
    is_home_bat  INTEGER,                   -- 1 when the batting team is the home team
    batter_id    INTEGER,
    actor_id     INTEGER,                   -- the player the sub-event is about
    action       TEXT NOT NULL,             -- see pbp.py action enum
    from_base    INTEGER,                   -- 0 = home, 1..3
    to_base      INTEGER,                   -- 1..3, 4 = kotipesä
    out          INTEGER NOT NULL DEFAULT 0,-- explicit {out:1} events only
    caught       INTEGER NOT NULL DEFAULT 0,-- koppi: a fielding act, never an out
    runs         INTEGER NOT NULL DEFAULT 0,
    hit_x        REAL,                      -- 0-100; NULL when unrecorded (0,0)
    hit_y        REAL,
    hit_number   INTEGER,
    pointhits    INTEGER,                   -- kärkilyönti success base index
    pointhitf    INTEGER,                   -- kärkilyönti failure base index
    tailhits     INTEGER,                   -- saatto index on trailing advances
    outs_before  INTEGER NOT NULL DEFAULT 0,
    outs_after   INTEGER NOT NULL DEFAULT 0,
    base_state_before TEXT,                 -- '000'..'111' occupancy of 1st/2nd/3rd
    base_state_after  TEXT,
    runners_before    TEXT,                 -- JSON [id|null x3]
    ts           INTEGER,                   -- seconds from match start
    PRIMARY KEY (match_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_plays_season ON plays(season_id, action);
CREATE INDEX IF NOT EXISTS idx_plays_match  ON plays(match_id);

-- Batting order per team per match; phase 0 = opening order, +1 per change.
CREATE TABLE IF NOT EXISTS lineups (
    match_id   INTEGER NOT NULL,
    team_id    INTEGER NOT NULL,            -- upstream team id
    is_home    INTEGER,
    phase      INTEGER NOT NULL,
    slot       INTEGER NOT NULL,            -- 1..12 (10..12 jokerit in official orders)
    player_id  INTEGER NOT NULL,
    pitcher_id INTEGER,                     -- lukkari during this phase
    source     TEXT NOT NULL,               -- 'reconstructed' | 'substitution'
    PRIMARY KEY (match_id, team_id, phase, slot)
);

CREATE INDEX IF NOT EXISTS idx_lineups_player ON lineups(player_id);
"""


def connect(path: str | None = None) -> sqlite3.Connection:
    path = path or DEFAULT_DB_PATH
    if path != ":memory:":
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    # If the target DB is missing/empty and a seed exists, use seed instead
    if not os.path.isfile(path) or os.path.getsize(path) == 0:
        seed_path = "/app/seed/pesis.db"
        if os.path.isfile(seed_path) and os.path.getsize(seed_path) > 0:
            path = seed_path
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    # WAL lets the nightly refresh write while the web app keeps reading
    conn.execute("PRAGMA journal_mode=WAL")
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
