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


def test_period_points_rule_3_2_1_0():
    """The real rule, validated against official 2026 result boards:
    3 = clean 2-0; 2 = any other win; 1 = loss with tiebreak played;
    0 = loss without tiebreak. All shapes below occur in real data."""
    from pesis import db as db_, ingest
    conn = db_.connect(":memory:")
    sid = ingest.upsert_season(conn, 2026, "Testisarja")
    matches = [
        # (id, ph, pa, tiebreak, home runs, away runs, A pts, B pts)
        (1, 2, 0, 0, 8, 3, 3, 0),  # clean win
        (2, 2, 1, 1, 6, 9, 2, 1),  # tiebreak win DESPITE fewer runs
        (3, 1, 2, 1, 5, 5, 1, 2),  # B wins tiebreak on equal runs
        (4, 1, 0, 0, 7, 7, 2, 0),  # drawn period, no tiebreak: 1-0 (x-x, y<z)
        (5, 0, 1, 1, 4, 4, 1, 2),  # both periods drawn, decided in contest
    ]
    for mid, ph, pa, tb, hr, ar, _, _ in matches:
        ingest.insert_match(conn, sid, {
            "id": mid, "date": f"2026-06-0{mid}", "home_team": "A",
            "away_team": "B", "home_runs": hr, "away_runs": ar,
            "periods_home": ph, "periods_away": pa, "tiebreak": tb,
        })
    table = {t["team"]: t for t in simulate.standings(conn, sid)}
    assert table["A"]["points"] == sum(m[6] for m in matches)
    assert table["B"]["points"] == sum(m[7] for m in matches)
    assert table["A"]["wins"] == 3 and table["A"]["super_wins"] == 2
    assert table["A"]["super_losses"] == 2 and table["A"]["losses"] == 2
    assert table["B"]["super_wins"] == 2 and table["B"]["super_losses"] == 1


def test_full_season_odds_match_final_table():
    conn = _conn()
    sid = _season(conn)
    table = simulate.playoff_odds(conn, sid, as_of="2026-12-31", sims=50)
    for i, t in enumerate(table):
        assert t["odds"] == (100.0 if i < simulate.PLAYOFF_SPOTS else 0.0)
