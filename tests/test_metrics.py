from pesis import db, ingest, metrics


def _row(pid, name, match_id, **stats):
    base = {"player_id": pid, "player_name": name, "match_id": match_id,
            "date": "2026-06-01", "turns_at_bat": 10,
            "karkilyonti_yritykset": 10, "karkilyonnit": 5,
            "saatto_yritykset": 4, "saatot": 2,
            "eteneminen_yritykset": 5, "etenemiset": 3,
            "kunnarit": 1, "lyodyt": 2, "tuodut": 1, "haavat": 0, "palot": 2}
    base.update(stats)
    return base


def _build():
    conn = db.connect(":memory:")
    sid = ingest.upsert_season(conn, 2026, "Testisarja")
    ingest.insert_player_game(conn, sid, _row(1, "A", 1))
    ingest.insert_player_game(conn, sid, _row(2, "B", 1, kunnarit=3, lyodyt=4,
                                              karkilyonnit=8, palot=0))
    return conn, sid


def test_rates_and_tehot():
    conn, sid = _build()
    lines = {l["name"]: l for l in metrics.season_lines(conn, sid)}
    a, b = lines["A"], lines["B"]
    assert a["tehot"] == 4 and b["tehot"] == 8
    assert a["kl_pct"] == 0.5 and b["kl_pct"] == 0.8
    assert a["palo_rate"] == 0.2


def test_teho_plus_is_league_indexed():
    conn, sid = _build()
    lines = metrics.season_lines(conn, sid)
    # league tehot/turn = 12/20 = 0.6; A = 0.4 -> 67, B = 0.8 -> 133
    by_name = {l["name"]: l["teho_plus"] for l in lines}
    assert by_name == {"A": 67, "B": 133}


def test_percentiles_flip_for_negative_stats():
    conn, sid = _build()
    lines = metrics.season_lines(conn, sid)
    metrics.add_percentiles(lines, stats=("kl_pct", "palo_rate"), min_turns=1)
    by_name = {l["name"]: l for l in lines}
    # B is better at both: more kärkilyönnit, fewer palot
    assert by_name["B"]["pct_kl_pct"] > by_name["A"]["pct_kl_pct"]
    assert by_name["B"]["pct_palo_rate"] > by_name["A"]["pct_palo_rate"]


def test_mallo_indices_are_league_indexed_and_distinct():
    conn, sid = _build()
    lines = {l["name"]: l for l in metrics.season_lines(conn, sid)}
    assert lines["B"]["adv_plus"] > lines["A"]["adv_plus"]
    assert lines["B"]["out_avoid_plus"] > lines["A"]["out_avoid_plus"]
    assert lines["B"]["spark_index"] > lines["A"]["spark_index"]
    assert lines["A"]["spark_index"] != lines["A"]["teho_plus"]


def test_official_1_2_3_k_advancement_splits_from_raw_rows():
    conn = db.connect(":memory:")
    sid = ingest.upsert_season(conn, 2026, "Testisarja")
    ingest.insert_player_game(conn, sid, _row(
        1, "A", 1,
        batpe_succeeded_0=1, batpe_tries_0=4,
        batpe_succeeded_1=2, batpe_tries_1=4,
        batpe_succeeded_2=1, batpe_tries_2=4,
        batpe_succeeded_3=0, batpe_tries_3=4,
    ))
    ingest.insert_player_game(conn, sid, _row(
        2, "B", 1,
        batpe_succeeded_0=3, batpe_tries_0=4,
        batpe_succeeded_1=3, batpe_tries_1=4,
        batpe_succeeded_2=2, batpe_tries_2=4,
        batpe_succeeded_3=2, batpe_tries_3=4,
    ))
    lines = {l["name"]: l for l in metrics.season_lines(conn, sid)}
    assert lines["A"]["adv1_pct"] == 0.25
    assert lines["B"]["adv_home_pct"] == 0.5
    assert lines["B"]["adv1_plus"] > lines["A"]["adv1_plus"]
    assert lines["B"]["adv_home_plus"] > lines["A"]["adv_home_plus"]


def test_value_stats_accumulate_above_replacement():
    conn, sid = _build()
    lines = {l["name"]: l for l in metrics.season_lines(conn, sid)}
    assert lines["B"]["jyk"] > lines["A"]["jyk"]
    assert lines["B"]["vyk"] > lines["A"]["vyk"]
    assert lines["B"]["raa"] > lines["A"]["raa"]
    assert lines["B"]["jyk"] != lines["B"]["teho_plus"]


def test_lukkari_lines_use_raw_position_and_runs_allowed():
    conn = db.connect(":memory:")
    sid = ingest.upsert_season(conn, 2026, "Testisarja")
    ingest.insert_match(conn, sid, {"id": 1, "date": "2026-06-01",
                                   "home_team": "A", "away_team": "B",
                                   "home_runs": 2, "away_runs": 5})
    ingest.insert_match(conn, sid, {"id": 2, "date": "2026-06-02",
                                   "home_team": "A", "away_team": "B",
                                   "home_runs": 3, "away_runs": 4})
    ingest.insert_player_game(conn, sid, _row(1, "L A", 1, team="A", opponent="B",
                                             home=1, up="L"))
    ingest.insert_player_game(conn, sid, _row(1, "L A", 2, team="A", opponent="B",
                                             home=1, up="L"))
    ingest.insert_player_game(conn, sid, _row(2, "L B", 1, team="B", opponent="A",
                                             home=0, position="lukkari"))
    ingest.insert_player_game(conn, sid, _row(2, "L B", 2, team="B", opponent="A",
                                             home=0, position="lukkari"))
    lines = {l["name"]: l for l in metrics.lukkari_lines(conn, sid, min_games=1)}
    assert lines["L A"]["runs_allowed"] == 9
    assert lines["L B"]["runs_allowed"] == 5
    assert lines["L B"]["lra_minus"] < lines["L A"]["lra_minus"]
    assert lines["L B"]["lukkari_rp"] > lines["L A"]["lukkari_rp"]
