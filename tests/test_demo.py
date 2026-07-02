from pesis import db, demo


def test_demo_builds_and_is_deterministic():
    checksums = []
    for _ in range(2):
        conn = db.connect(":memory:")
        players = demo.build_demo(conn, seed=27, years=(2025, 2026),
                                  matches_per_season=8)
        n, tehot = conn.execute(
            "SELECT COUNT(*), SUM(kunnarit + lyodyt + tuodut) FROM player_games"
        ).fetchone()
        assert n > 1000
        assert len(players) == 120
        checksums.append((n, tehot))
        conn.close()
    assert checksums[0] == checksums[1]


def test_demo_attempts_bound_successes():
    conn = db.connect(":memory:")
    demo.build_demo(conn, seed=1, years=(2026,), matches_per_season=4)
    bad = conn.execute(
        """SELECT COUNT(*) FROM player_games
           WHERE karkilyonnit > karki_yritykset
              OR saatot > saatto_yritykset
              OR etenemiset > eteneminen_yritykset"""
    ).fetchone()[0]
    assert bad == 0
