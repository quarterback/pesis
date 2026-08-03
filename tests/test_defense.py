import json

from pesis import db, defense

PLAY_COLS = ("match_id", "seq", "season_id", "group_type", "period", "inning",
             "bat_turn", "bat_team_id", "is_home_bat", "batter_id", "actor_id",
             "action", "from_base", "to_base", "out", "caught", "runs",
             "pointhits", "tailhits", "outs_before", "outs_after",
             "base_state_before", "base_state_after", "runners_before")


def _conn():
    conn = db.connect(":memory:")
    conn.execute("INSERT INTO seasons (id, year, series) VALUES (1, 2026, 'Testisarja')")
    conn.execute("INSERT INTO matches (id, season_id, date, home_team, away_team) "
                 "VALUES (10, 1, '2026-06-01', 'Kotij', 'Vierasj')")
    return conn


def _insert(conn, rows):
    start = conn.execute("SELECT COALESCE(MAX(seq), 0) FROM plays").fetchone()[0]
    seq = {"n": start}

    def row(match_id, period, inning, bat_turn, action, *, actor=None,
            batter=None, out=0, caught=0, runs=0, frm=None, to=None,
            ob=0, oa=0, bsb="000", bsa="000", is_home_bat=0, ph=None, th=None):
        seq["n"] += 1
        return (match_id, seq["n"], 1, "o", period, inning, bat_turn,
                200 if not is_home_bat else 100, is_home_bat, batter, actor,
                action, frm, to, out, caught, runs, ph, th, ob, oa, bsb, bsa,
                json.dumps([None, None, None]))

    values = [row(*r[0], **r[1]) for r in rows]
    conn.executemany(
        f"INSERT INTO plays ({','.join(PLAY_COLS)}) "
        f"VALUES ({','.join('?' * len(PLAY_COLS))})", values)
    return conn


def _basic_season(conn):
    """Two halves batting by the away team (defense = home team).

    Half 1: hit from (000,0) -> runner to first; hit from (100,0) -> runner
    scores. 1 run total. Half 2: hit from (000,0) -> runner burned;
    hit from (000,1) -> nothing. 0 runs.
    """
    _insert(conn, [
        (((10, 0, 0, 0, "hit")), dict(batter=1)),
        (((10, 0, 0, 0, "advance")), dict(actor=1, frm=0, to=1, bsa="100", ph=0)),
        (((10, 0, 0, 0, "hit")), dict(batter=2, bsb="100")),
        (((10, 0, 0, 0, "advance")), dict(actor=1, frm=1, to=4, runs=1,
                                          bsb="100", bsa="000", ph=3)),
        (((10, 0, 1, 0, "hit")), dict(batter=3)),
        (((10, 0, 1, 0, "out")), dict(actor=3, frm=0, to=1, out=1, oa=1)),
        (((10, 0, 1, 0, "hit")), dict(batter=4, ob=1, oa=1)),
        (((10, 0, 1, 0, "no_event")), dict(ob=1, oa=1)),
    ])
    return conn


def test_re_table_from_samples():
    conn = _basic_season(_conn())
    table = defense.re_table(conn, 1)
    # (000,0) sampled twice: 1 run to go, then 0 -> mean 0.5
    assert abs(table[("000", 0)] - 0.5) < 1e-9
    # (100,0) sampled once with 1 run to go
    assert abs(table[("100", 0)] - 1.0) < 1e-9
    # (000,1) sampled once with 0 to go
    assert abs(table[("000", 1)] - 0.0) < 1e-9


def test_team_defense_shapes_and_koppi_is_not_out():
    conn = _basic_season(_conn())
    # add a koppi delivery that wipes a would-be runner via wound: no out
    _insert(conn, [
        (((10, 1, 0, 0, "koppi")), dict(batter=5, caught=1)),
        (((10, 1, 0, 0, "wound")), dict(actor=5, frm=0, to=1)),
    ])
    teams = defense.team_defense(conn, 1)
    assert len(teams) == 1
    t = teams[0]
    assert t["team"] == "Kotij"          # away team batted, home defended
    assert t["halves"] == 3
    assert t["koppi_pct"] is not None and t["koppi_pct"] > 0
    # out conversion counts the single real palo over 4 runner attempts
    assert t["out_conv"] is not None


def test_re24_event_values_thresholds_and_signs(monkeypatch):
    conn = _basic_season(_conn())
    # coverage below thresholds -> None
    assert defense.re24_event_values(conn, 1) is None
    monkeypatch.setattr(defense, "MIN_MATCHES", 1)
    monkeypatch.setattr(defense, "MIN_DELIVERIES", 1)
    # still None: wound/saatto/kunnari classes have no observations
    assert defense.re24_event_values(conn, 1) is None
    _insert(conn, [
        (((10, 1, 1, 0, "hit")), dict(batter=6)),
        (((10, 1, 1, 0, "homerun")), dict(actor=6, frm=0, runs=1, bsa="001")),
        (((10, 1, 1, 0, "hit")), dict(batter=7, bsb="001")),
        (((10, 1, 1, 0, "advance")), dict(actor=7, frm=0, to=1, bsb="001",
                                          bsa="101", th=0)),
        (((10, 1, 1, 0, "hit")), dict(batter=8, bsb="101")),
        (((10, 1, 1, 0, "wound")), dict(actor=7, frm=1, bsb="101", bsa="001")),
    ])
    w = defense.re24_event_values(conn, 1)
    assert w is not None
    assert set(w) == {"kunnarit", "karkilyonnit", "saatot", "etenemiset",
                      "haavat", "palot"}
    assert w["kunnarit"] > 0 and w["karkilyonnit"] > 0
    assert w["haavat"] < 0 and w["palot"] < 0


def test_coverage_counts():
    conn = _basic_season(_conn())
    cov = defense.coverage(conn, 1)
    assert cov["matches_pbp"] == 1 and cov["matches_total"] == 1
    assert cov["deliveries"] == 4
