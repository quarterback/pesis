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


def test_kl_pct_avg_is_linear_no_sanding():
    """KL% → AVG is a slope-1 linear recenter, so the AVG gap between two hitters
    must equal their raw KL% gap (the quantile map would sand it toward zero)."""
    conn = _fixture()
    avg = next(r for r in translate.translate_player(conn, 1)["rows"]
               if r["mlb_stat"] == "AVG")   # KL% 4/8 = .500
    elite = next(r for r in translate.translate_player(conn, 2)["rows"]
                 if r["mlb_stat"] == "AVG")  # KL% 7/8 = .875
    kl_gap = elite["pesis_value"] - avg["pesis_value"]
    avg_gap = float(elite["mlb_value"]) - float(avg["mlb_value"])
    assert abs(avg_gap - kl_gap) < 1e-6        # spacing preserved, not compressed
    # and it lands on a batting-average scale, not the raw .5+ KL% scale
    assert float(avg["mlb_value"]) == round(max(0.0, 0.250 + (0.500 - 0.533)), 3)


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
