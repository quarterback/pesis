from pesis import db, demo, ingest, translate


def _fixture():
    """Three qualified players: league-average, elite, and out-prone."""
    conn = db.connect(":memory:")
    sid = ingest.upsert_season(conn, 2026, "Testisarja")
    base = {"date": "2026-06-01", "turns_at_bat": 5, "karkilyonti_yritykset": 8,
            "karkilyonnit": 4, "saatto_yritykset": 2, "saatot": 1,
            "eteneminen_yritykset": 4, "etenemiset": 2, "kunnarit": 0,
            "lyodyt": 1, "tuodut": 1, "haavat": 0, "palot": 1}
    variants = {
        1: dict(player_name="Avg Antti"),
        2: dict(player_name="Elite Eero", karkilyonnit=7, kunnarit=1,
                lyodyt=3, palot=0),
        3: dict(player_name="Whiff Ville", karkilyonnit=2, palot=3),
    }
    for match in range(1, 11):
        for pid, extra in variants.items():
            row = dict(base, player_id=pid, born_year=1998, match_id=match, **extra)
            ingest.insert_player_game(conn, sid, row)
    return conn


def test_elite_translates_above_average_hitter():
    conn = _fixture()
    elite = translate.translate_player(conn, 2)
    avg_row = {r["mlb_stat"]: r for r in translate.translate_player(conn, 1)["rows"]}
    elite_row = {r["mlb_stat"]: r for r in elite["rows"]}
    assert float(elite_row["AVG"]["mlb_value"]) > float(avg_row["AVG"]["mlb_value"])
    assert elite["wrc_plus"] > 100


def test_out_prone_player_gets_high_k_rate():
    conn = _fixture()
    rows = {r["mlb_stat"]: r for r in translate.translate_player(conn, 3)["rows"]}
    elite = {r["mlb_stat"]: r for r in translate.translate_player(conn, 2)["rows"]}
    whiff_k = float(rows["K%"]["mlb_value"].rstrip("%"))
    elite_k = float(elite["K%"]["mlb_value"].rstrip("%"))
    assert whiff_k > 22.2 > elite_k  # worse than MLB mean; elite better


def test_pace_scales_to_162_games():
    conn = _fixture()
    t = translate.translate_player(conn, 2)
    assert t["games"] == 10
    assert t["pace"]["HR"] == round(10 * 162 / 10)  # 1 kunnari/game
    assert t["tier"] is not None


def test_translate_runs_on_demo_league():
    conn = db.connect(":memory:")
    demo.build_demo(conn, seed=9, years=(2026,), matches_per_season=12)
    t = translate.translate_player(conn, 1)
    assert t and t["qualified"]
    assert len(t["rows"]) == 5


def test_missing_player_returns_none():
    conn = db.connect(":memory:")
    assert translate.translate_player(conn, 999) is None
