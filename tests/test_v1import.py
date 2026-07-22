from pesis import db, v1import

PAYLOAD = {
    "data": [
        {"player_id": 51, "match_id": 900, "match_date": "2026-06-01",
         "team_id": 1, "opponent_team_id": 2, "is_home": 1,
         "temperature": 18, "windy": 1, "rainy": 0, "spectators": 1500,
         "turns_at_bat": 4, "homeruns": 1, "scorings": 2, "runs": 1,
         "batpe_total_succeeded": 3, "batpe_total_tries": 5,
         "batadv_succeeded": 1, "batadv_tries": 2,
         "runpadv_succeeded": 2, "runpadv_tries": 3, "runpadv_caughts": 1,
         "runpadv_outs": 0,
         "runtadv_succeeded": 1, "runtadv_tries": 1, "runtadv_caughts": 0,
         "runtadv_out": 1},
    ],
    "maps": {
        "player": [{"id": 51, "value": {"id": 51, "name": "Testi Pelaaja"}}],
        "team": [{"id": 1, "value": {"shorthand": "ViVe"}},
                 {"id": 2, "value": {"shorthand": "Manse"}}],
        "matches": [{"id": 900, "value": {
            "home": 1, "away": 2, "date": "2026-06-01T15:00:00.000000Z",
            "stadium": {"name": "Saarikenttä, Vimpeli"},
            "result": {"details": {
                "runs_home_first_period": 3, "runs_away_first_period": 2,
                "runs_home_second_period": 4, "runs_away_second_period": 0,
                "runs_home_super_inning": None, "runs_away_super_inning": None,
                "runs_home_scoring_contest": 2, "runs_away_scoring_contest": 1,
            }}}}],
    },
}


def test_import_payload_normalizes_v1_fields():
    conn = db.connect(":memory:")
    stats = v1import.import_payload(conn, PAYLOAD, 2026, "Miesten Superpesis")
    assert stats == {"players": 1, "rows": 1, "matches": 1}

    pg = conn.execute("SELECT * FROM player_games").fetchone()
    assert pg["kunnarit"] == 1 and pg["lyodyt"] == 2 and pg["tuodut"] == 1
    assert pg["karkilyonnit"] == 3 and pg["karki_yritykset"] == 5
    assert pg["saatot"] == 1 and pg["saatto_yritykset"] == 2
    assert pg["etenemiset"] == 3 and pg["eteneminen_yritykset"] == 4
    assert pg["haavat"] == 1   # runpadv_caughts + runtadv_caughts
    assert pg["palot"] == 1    # runpadv_outs + runtadv_out (upstream typo)
    assert pg["team"] == "ViVe" and pg["opponent"] == "Manse" and pg["home"] == 1

    m = conn.execute("SELECT * FROM matches").fetchone()
    assert m["stadium"] == "Saarikenttä, Vimpeli"
    assert m["date"] == "2026-06-01"
    # periods + super inning, scoring contest excluded
    assert (m["home_runs"], m["away_runs"]) == (7, 2)
    assert m["wind"] == 1 and m["attendance"] == 1500

    name = conn.execute("SELECT name FROM players WHERE id = 51").fetchone()[0]
    assert name == "Testi Pelaaja"


CATALOG = {"seasons": {"seasons": [
    {"season": {"id": 10, "season": 2015},
     "seasonSerieses": [
         {"seasonSeries": {"id": 100, "name": "Miesten Superpesis"}},
         {"seasonSeries": {"id": 101, "name": "Miesten Suomensarja"}},
     ]},
    {"season": {"id": 20, "season": 2026},
     "seasonSerieses": [
         {"seasonSeries": {"id": 200, "name": "Miesten Superpesis"}},
         {"seasonSeries": {"id": 201, "name": "Miesten suomensarja"}},
     ]},
]}}


def test_resolve_series_matches_both_suomensarja_spellings():
    # The catalog capitalizes 'Suomensarja' through 2019 and lowercases it
    # from 2020 — one alias must resolve in both eras.
    assert v1import.resolve_series(CATALOG, 2015, "suomensarja-miehet") == (10, 101)
    assert v1import.resolve_series(CATALOG, 2026, "suomensarja-miehet") == (20, 201)


def test_exact_catalog_names_still_resolve():
    assert v1import.resolve_series(CATALOG, 2015, "Miesten Superpesis") == (10, 100)
    assert v1import.resolve_series(CATALOG, 2026, "Miesten suomensarja") == (20, 201)


def test_suomensarja_label_is_canonical_for_both_spellings():
    # Both catalog spellings and the CLI alias must land on one DB label so
    # a series' history never forks on upstream capitalization drift.
    for key in ("suomensarja-miehet", "miesten suomensarja", "Miesten suomensarja"):
        assert v1import.SERIES_ALIASES.get(key.lower()) == "Miesten Suomensarja"
    for key in ("suomensarja-naiset", "naisten suomensarja"):
        assert v1import.SERIES_ALIASES.get(key.lower()) == "Naisten Suomensarja"


def test_flag_wind_buckets_used_for_v1_data():
    from pesis import context
    conn = db.connect(":memory:")
    v1import.import_payload(conn, PAYLOAD, 2026, "Miesten Superpesis")
    buckets = context.weather_effects(conn)
    assert [b["wind"] for b in buckets] == ["tuulinen"]  # only windy=1 data
