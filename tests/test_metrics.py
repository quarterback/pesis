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
