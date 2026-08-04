from pesis import db, situational

PLAY_COLS = ("match_id", "seq", "season_id", "group_type", "period", "inning",
             "bat_turn", "batter_id", "actor_id", "action", "runs",
             "outs_before", "outs_after", "base_state_before",
             "base_state_after")


def _conn():
    conn = db.connect(":memory:")
    conn.execute("INSERT INTO seasons (id, year, series) VALUES (1, 2026, 'T')")
    return conn


class Seq:
    def __init__(self):
        self.n = 0

    def add(self, conn, action, *, batter=None, runs=0, state="000", outs=0):
        self.n += 1
        conn.execute(
            f"INSERT INTO plays ({','.join(PLAY_COLS)}) "
            f"VALUES ({','.join('?' * len(PLAY_COLS))})",
            (10, self.n, 1, "o", 0, 0, 0, batter, batter, action, runs,
             outs, outs, state, state))


def _season(conn, empty_pas=1, loaded_pas=1, loaded_runs=1):
    """A tiny league: plate appearances from empty and loaded states."""
    s = Seq()
    for i in range(empty_pas):
        s.add(conn, "at_bat", batter=1, state="000")
        s.add(conn, "hit", batter=1, state="000")
    for i in range(loaded_pas):
        s.add(conn, "at_bat", batter=2, state="111")
        s.add(conn, "hit", batter=2, state="111")
        s.add(conn, "advance", batter=2, runs=loaded_runs, state="111")
    return conn


def test_plate_appearances_split_on_at_bat():
    conn = _season(_conn(), empty_pas=2, loaded_pas=3)
    pas = situational.plate_appearances(conn, 1)
    assert len(pas) == 5
    assert sum(p["rbi"] for p in pas) == 3
    assert [p["state"] for p in pas].count("111") == 3


def test_kunnari_wildthrow_and_walk_runs_are_not_lyodyt():
    conn = _conn()
    s = Seq()
    s.add(conn, "at_bat", batter=1, state="111")
    s.add(conn, "homerun", batter=1, runs=1, state="111")       # kunnari
    s.add(conn, "advance_error", batter=1, runs=1, state="111")  # harhaheitto
    s.add(conn, "walk", batter=1, runs=1, state="111")           # vapaataival
    s.add(conn, "advance", batter=1, runs=1, state="111")        # a real lyöty
    pas = situational.plate_appearances(conn, 1)
    assert len(pas) == 1 and pas[0]["rbi"] == 1


def test_expected_table_is_per_state_average():
    conn = _season(_conn(), empty_pas=4, loaded_pas=4, loaded_runs=1)
    tab = situational.expected_table(situational.plate_appearances(conn, 1))
    assert tab[("000", 0)] == 0.0
    assert tab[("111", 0)] == 1.0


def test_lyo_rewards_beating_the_situation(monkeypatch):
    monkeypatch.setattr(situational, "MIN_PA", 1)
    conn = _conn()
    s = Seq()
    # two players in identical loaded situations; one drives runs in, one does not
    for _ in range(5):
        s.add(conn, "at_bat", batter=1, state="111")
        s.add(conn, "hit", batter=1, state="111")
        s.add(conn, "advance", batter=1, runs=1, state="111")
    for _ in range(5):
        s.add(conn, "at_bat", batter=2, state="111")
        s.add(conn, "hit", batter=2, state="111")
    res = situational.situational_lines(conn, 1)
    assert res[1]["lyodyt_oe"] > 0 > res[2]["lyodyt_oe"]
    # expectation is the same for both: they faced the same states
    assert res[1]["lyodyt_exp"] == res[2]["lyodyt_exp"]


def test_opportunity_alone_does_not_earn_credit(monkeypatch):
    monkeypatch.setattr(situational, "MIN_PA", 1)
    conn = _conn()
    s = Seq()
    # player 1 bats only with the bases loaded and converts at the league rate;
    # player 2 bats only with the bases empty and also matches the league rate
    for _ in range(4):
        s.add(conn, "at_bat", batter=1, state="111")
        s.add(conn, "advance", batter=1, runs=1, state="111")
    for _ in range(4):
        s.add(conn, "at_bat", batter=2, state="000")
    res = situational.situational_lines(conn, 1)
    assert res[1]["lyodyt_pbp"] == 4 and res[2]["lyodyt_pbp"] == 0
    # ...yet neither beat their own situations, so both sit at zero
    assert abs(res[1]["lyodyt_oe"]) < 1e-9
    assert abs(res[2]["lyodyt_oe"]) < 1e-9


def test_thin_seasons_return_nothing():
    conn = _season(_conn(), empty_pas=1, loaded_pas=1)
    assert situational.situational_lines(conn, 1) == {}


def test_add_situational_attaches_none_without_pbp():
    conn = _conn()
    lines = [{"player_id": 1}]
    situational.add_situational(conn, 1, lines)
    assert lines[0]["lyodyt_oe"] is None
    assert lines[0]["lyodyt_exp"] is None
