from pesis import db, demo, simulate


def _conn():
    conn = db.connect(":memory:")
    demo.build_demo(conn, seed=13, years=(2026,), matches_per_season=24)
    return conn


def _season(conn):
    return conn.execute("SELECT id FROM seasons").fetchone()[0]


def test_standings_conserve_games_and_points():
    conn = _conn()
    table = simulate.standings(conn, _season(conn))
    assert len(table) == 10
    matches = conn.execute("SELECT COUNT(*) FROM matches").fetchone()[0]
    assert sum(t["games"] for t in table) == 2 * matches
    assert sum(t["points"] for t in table) == 2 * matches
    assert sum(t["run_diff"] for t in table) == 0


def test_playoff_odds_are_sane_and_deterministic():
    conn = _conn()
    sid = _season(conn)
    cutoff = "2026-06-15"
    a = simulate.playoff_odds(conn, sid, as_of=cutoff, sims=500, seed=42)
    b = simulate.playoff_odds(conn, sid, as_of=cutoff, sims=500, seed=42)
    assert [t["odds"] for t in a] == [t["odds"] for t in b]
    assert any(t["remaining"] > 0 for t in a), "cutoff left no games to simulate"
    total = sum(t["odds"] for t in a)
    assert abs(total - 100 * simulate.PLAYOFF_SPOTS) < 1e-6
    # the current leader should not be an underdog to the current last place
    assert a[0]["odds"] > a[-1]["odds"]


def test_full_season_odds_match_final_table():
    conn = _conn()
    sid = _season(conn)
    table = simulate.playoff_odds(conn, sid, as_of="2026-12-31", sims=50)
    for i, t in enumerate(table):
        assert t["odds"] == (100.0 if i < simulate.PLAYOFF_SPOTS else 0.0)
