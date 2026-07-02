from pesis import db, demo, ingest, similarity


def test_identical_lines_are_top_comps():
    conn = db.connect(":memory:")
    sid = ingest.upsert_season(conn, 2026, "Testisarja")
    base = {"date": "2026-06-01", "turns_at_bat": 5, "karkilyonti_yritykset": 8,
            "karkilyonnit": 4, "saatto_yritykset": 3, "saatot": 1,
            "eteneminen_yritykset": 4, "etenemiset": 2, "kunnarit": 0,
            "lyodyt": 1, "tuodut": 1, "haavat": 0, "palot": 1}
    for match in range(1, 11):  # 50 turns each -> qualified
        for pid, name, born in ((1, "Twin A", 1998), (2, "Twin B", 1998),
                                (3, "Different", 1992)):
            row = dict(base, player_id=pid, player_name=name, born_year=born,
                       match_id=match)
            if pid == 3:  # a much better, older player
                row.update(karkilyonnit=7, kunnarit=2, lyodyt=3, palot=0)
            ingest.insert_player_game(conn, sid, row)

    result = similarity.comps(conn, 1)
    assert result[0]["player_id"] == 2
    assert result[0]["score"] == 1000  # identical line, identical age
    assert all(c["player_id"] != 1 for c in result)  # never your own comp


def test_comps_run_on_demo_league():
    conn = db.connect(":memory:")
    demo.build_demo(conn, seed=5, years=(2025, 2026), matches_per_season=12)
    result = similarity.comps(conn, 1, limit=5)
    assert len(result) == 5
    assert result[0]["score"] >= result[-1]["score"]
