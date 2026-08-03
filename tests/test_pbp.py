import json
import pathlib

from pesis import db, pbp

H, A = 100, 200  # home / away upstream team ids


def g(gtype, subs, *, period=0, inning=0, bat_turn=0, team=A, batter=None,
      gid=1, ts=0):
    return {"id": gid, "groupType": gtype, "period": period, "inning": inning,
            "batTurn": bat_turn, "team": team, "hTeam": H, "batter": batter,
            "pairIndex": None, "hitNumber": None, "hit": None,
            "events": subs, "timestamp": ts}


def sub(texts, bases=None):
    e = {"texts": texts}
    if bases is not None:
        e["runnersAtBases"] = bases
    return e


def hit_tok(caught=False, out=False, x="50.0", y="50.0"):
    return {"type": "hit", "hit": {"id": 1, "team_id": A,
                                   "batter_player_id": 0, "x": x, "y": y,
                                   "caught": caught, "out": out,
                                   "hit_number": 1}}


def P(pid, **kw):
    return {"type": "player", "id": pid, **kw}


def E(text):
    return {"type": "event", "text": text}


def S(**kw):
    return {"hide": True, "type": "stat", **kw}


PAYLOAD = {"finished": True, "events": [
    g("m", [sub([E("Ottelu alkoi"), S(**{"match-started": "2026-08-01"})],
                [None] * 5)]),
    # batter 1 up, advances to 1st on his 2nd hit
    g("o", [sub(["Lyöntivuorossa", P(1, **{"settling-at-bat": True})],
                [1, None, None, None, None])], batter=1),
    g("o", [sub(["1. lyönti", hit_tok()], [1, None, None, None, None]),
            sub([P(1), E("eteni"), "ykköspesälle", S(pointhits=0)],
                [None, 1, None, None, None])], batter=1),
    # batter 2: koppi wipes runner 1 via haava — NO out
    g("o", [sub(["Lyöntivuorossa", P(2, **{"settling-at-bat": True})],
                [2, 1, None, None, None])], batter=2),
    g("o", [sub(["1. lyönti", hit_tok(caught=True),
                 {"type": "hit-caught", "text": "koppi"}],
                [2, 1, None, None, None]),
            sub([P(1), E("haavoittui"), "kakkospesälle", S(pointhitf=1)],
                [2, None, None, None, None])], batter=2),
    # batter 2 reaches on a trailing-advance-flavored hit
    g("o", [sub(["2. lyönti", hit_tok()], [2, None, None, None, None]),
            sub([P(2), S(tailhits=0), E("eteni"), "ykköspesälle"],
                [None, 2, None, None, None])], batter=2),
    # batter 3: runner 2 burned at second — a real out
    g("o", [sub(["Lyöntivuorossa", P(3, **{"settling-at-bat": True})],
                [3, 2, None, None, None])], batter=3),
    g("o", [sub(["1. lyönti", hit_tok()], [3, 2, None, None, None]),
            sub([P(2), E("paloi"), S(out=1), "kakkospesälle", S(pointhitf=1)],
                [3, None, None, None, None]),
            sub([P(3), E("eteni"), "ykköspesälle"],
                [None, 3, None, None, None])], batter=3),
    # batter 4: koppi + kärpänen double-off = exactly one out
    g("o", [sub(["Lyöntivuorossa", P(4, **{"settling-at-bat": True})],
                [4, 3, None, None, None])], batter=4),
    g("o", [sub(["1. lyönti", hit_tok(caught=True),
                 {"type": "hit-caught", "text": "koppi"}],
                [4, 3, None, None, None]),
            sub([P(3), E("paloi kärpäsenä"), S(out=1), "kotipesään"],
                [4, None, None, None, None])], batter=4),
    # batter 4 hits a kunnari: one run, batter stays on third
    g("o", [sub(["2. lyönti", hit_tok()], [4, None, None, None, None]),
            sub([P(4), E("löi kunnarin!"), S(homerun=2)],
                [None, None, None, 4, None])], batter=4),
    # batter 5: brings 4 home (score token), then advances on a wild throw
    g("o", [sub(["Lyöntivuorossa", P(5, **{"settling-at-bat": True})],
                [5, None, None, 4, None])], batter=5),
    g("o", [sub(["1. lyönti", hit_tok()], [5, None, None, 4, None]),
            sub([P(4), E("eteni"), "kotipesään", S(pointhits=3), S(score=3)],
                [5, None, None, None, 4]),
            sub([P(5), E("eteni harhaheitolla"), "ykköspesälle"],
                [None, 5, None, None, None])], batter=5),
    # batter 6 walks
    g("o", [sub(["Lyöntivuorossa", P(6, **{"settling-at-bat": True})],
                [6, 5, None, None, None])], batter=6),
    g("o", [sub([P(6), E("sai vapaataipaleen väärien syöttöjen johdosta"),
                 "ykköspesälle"], [None, 6, 5, None, None])], batter=6),
    # technical palo: group type 'x', team is null
    g("x", [sub(["Tekninen palo", S(out=1)], [None, 6, 5, None, None])],
      team=None),
    # substitution with mixed str/int ids
    g("is", [sub([{"type": "team", "id": A},
                  "muutti lyöntijärjestystä.",
                  {"type": "substitution", "team": A,
                   "newLineUp": ["1", 2, "3", 4, "5", 6, "7", 8, "9",
                                 "10", 11, "12"],
                   "pitcher": "3"}], [None] * 5)], team=A),
    # next half: state must reset (round rule ended previous at 2 outs)
    g("o", [sub(["Lyöntivuorossa", P(51, **{"settling-at-bat": True})],
                [51, None, None, None, None])],
      inning=1, bat_turn=1, team=H, batter=51),
    # scoring contest rows are stored but flagged by period 3
    g("osc", [sub(["1. pari:", "lyöjänä", P(51), "etenijänä", P(52),
                   {"type": "scoring-contest-pair"}],
                  [51, None, None, 52, None]),
              sub(["1. lyönti:", E("ei tapahtumaa"),
                   {"type": "hit", "hit": None}],
                  [51, None, None, 52, None])],
      period=3, team=H, batter=51),
    # unknown group type + unknown stat key: warn, never crash
    g("z", [sub([E("jotain uutta"), S(mysterystat=7)], [None] * 5)]),
]}


def _parse():
    return pbp.parse_events(PAYLOAD, match_id=999)


def _rows(parsed, action):
    return [p for p in parsed["plays"] if p["action"] == action]


def test_advance_and_base_states():
    parsed = _parse()
    adv = _rows(parsed, "advance")
    first = adv[0]
    assert first["actor_id"] == 1 and first["to_base"] == 1
    assert first["base_state_before"] == "000"
    assert first["base_state_after"] == "100"
    assert first["out"] == 0 and first["pointhits"] == 0


def test_koppi_is_not_an_out():
    parsed = _parse()
    koppi = _rows(parsed, "koppi")
    assert koppi and all(k["caught"] == 1 and k["out"] == 0 for k in koppi)
    wounds = _rows(parsed, "wound")
    assert wounds and all(w["out"] == 0 for w in wounds)
    # the wound cleared the runner without touching the out count
    assert wounds[0]["outs_before"] == wounds[0]["outs_after"] == 0
    assert wounds[0]["base_state_after"] == "000"


def test_paloi_counts_one_out():
    parsed = _parse()
    outs = _rows(parsed, "out")
    assert outs[0]["out"] == 1
    assert outs[0]["outs_before"] == 0 and outs[0]["outs_after"] == 1
    assert outs[0]["to_base"] == 2 and outs[0]["from_base"] == 1


def test_karpanen_single_out_after_koppi():
    parsed = _parse()
    doubled = _rows(parsed, "out_doubled")
    assert len(doubled) == 1 and doubled[0]["out"] == 1
    # koppi + kärpänen together produced exactly one out (1 from paloi earlier)
    assert doubled[0]["outs_after"] == 2


def test_kunnari_scores_one_and_stays_on_third():
    parsed = _parse()
    hr = _rows(parsed, "homerun")[0]
    assert hr["runs"] == 1
    assert hr["base_state_after"] == "001"


def test_score_token_run():
    parsed = _parse()
    runs = [p for p in parsed["plays"] if p["runs"] and p["action"] == "advance"]
    assert runs and runs[0]["to_base"] == 4 and runs[0]["actor_id"] == 4


def test_error_advance_and_walk():
    parsed = _parse()
    assert _rows(parsed, "advance_error")[0]["actor_id"] == 5
    walk = _rows(parsed, "walk")[0]
    assert walk["actor_id"] == 6 and walk["to_base"] == 1


def test_technical_palo_charged_to_batting_team():
    parsed = _parse()
    tech = _rows(parsed, "out_technical")[0]
    assert tech["out"] == 1
    assert tech["bat_team_id"] == A  # carried from the half, group team is null


def test_half_change_resets_state():
    parsed = _parse()
    second_half = [p for p in parsed["plays"]
                   if p["inning"] == 1 and p["bat_turn"] == 1]
    assert second_half[0]["outs_before"] == 0
    assert second_half[0]["base_state_before"] == "000"
    assert second_half[0]["bat_team_id"] == H
    assert second_half[0]["is_home_bat"] is None  # resolved only at import


def test_osc_rows_flagged_by_period():
    parsed = _parse()
    osc = [p for p in parsed["plays"] if p["group_type"] == "osc"]
    assert osc and all(p["period"] == 3 for p in osc)


def test_unknown_tokens_warn_but_never_raise():
    parsed = _parse()
    assert parsed["meta"]["n_warnings"] >= 2  # unknown event text + stat key
    assert any("mysterystat" in w for w in parsed["meta"]["warnings"])


def test_lineups_reconstructed_and_substituted():
    parsed = _parse()
    phase0 = [l for l in parsed["lineups"]
              if l["team_id"] == A and l["phase"] == 0]
    assert [l["player_id"] for l in sorted(phase0, key=lambda l: l["slot"])] \
        == [1, 2, 3, 4, 5, 6]
    assert all(l["source"] == "reconstructed" for l in phase0)
    phase1 = [l for l in parsed["lineups"]
              if l["team_id"] == A and l["phase"] == 1]
    assert len(phase1) == 12
    assert all(isinstance(l["player_id"], int) for l in phase1)
    assert phase1[0]["pitcher_id"] == 3
    assert phase1[0]["source"] == "substitution"


def test_import_events_roundtrip_and_meta():
    conn = db.connect(":memory:")
    conn.execute("INSERT INTO seasons (id, year, series) VALUES (7, 2026, 'T')")
    # player_games rows carry the home flag the payload lacks
    conn.execute("INSERT INTO players (id, name) VALUES (1, 'A'), (51, 'B')")
    conn.execute("INSERT INTO player_games (player_id, season_id, match_id, "
                 "date, home) VALUES (1, 7, 999, '2026-06-01', 0)")
    conn.execute("INSERT INTO player_games (player_id, season_id, match_id, "
                 "date, home) VALUES (51, 7, 999, '2026-06-01', 1)")
    meta = pbp.import_events(conn, 999, PAYLOAD, season_id=7)
    # away team A's plays resolve to is_home_bat = 0, home team H's to 1
    flags = {r["bat_team_id"]: r["is_home_bat"] for r in conn.execute(
        "SELECT DISTINCT bat_team_id, is_home_bat FROM plays "
        "WHERE match_id = 999 AND bat_team_id IS NOT NULL")}
    assert flags[A] == 0 and flags[H] == 1
    n = conn.execute("SELECT COUNT(*) c FROM plays WHERE match_id=999").fetchone()["c"]
    assert n == meta["n_plays"] > 0
    pm = conn.execute("SELECT * FROM pbp_meta WHERE match_id=999").fetchone()
    assert pm["status"] == "ok" and pm["parse_version"] == pbp.PARSE_VERSION
    # idempotent re-import
    pbp.import_events(conn, 999, PAYLOAD, season_id=7)
    n2 = conn.execute("SELECT COUNT(*) c FROM plays WHERE match_id=999").fetchone()["c"]
    assert n2 == n


def test_real_trimmed_payload():
    fx = pathlib.Path(__file__).parent / "fixtures" / "pbp_trimmed.json"
    payload = json.loads(fx.read_text())
    parsed = pbp.parse_events(payload, match_id=128954)
    plays = parsed["plays"]
    assert len(plays) > 200
    # koppi is never an out anywhere in real data
    assert all(p["out"] == 0 for p in plays if p["action"] == "koppi")
    # every explicit out is 1..3 within its half
    assert all(1 <= p["outs_after"] <= 3 for p in plays if p["out"])
    # regulation innings only in periods 0/1; osc rows flagged period 3
    assert any(p["period"] == 3 for p in plays)
    # low unknown-token noise on real data
    assert parsed["meta"]["n_warnings"] <= len(plays) * 0.05
