"""Play-by-play ingest from the pesistulokset.fi live-scoring feed.

``https://v1.pesistulokset.fi/api/v1/online/{match_id}/events`` is keyless and
returns the full event stream of a match: one *group* per game action, each
holding sub-events with a ``texts`` token list and a ``runnersAtBases`` array
(the base state AFTER that sub-event). ``parse_events`` normalizes the token
grammar into typed play rows; ``import_events`` stores them.

Ground rules learned from real payloads (see docs/aar for the derivation):

- ``runnersAtBases`` is authoritative: slot 0 = batter at home, slots 1-3 =
  bases, slot 4 = a transient "just scored" holder. The parser reads base
  states from it instead of simulating the grammar, which keeps it correct
  when a text form is unmodeled.
- Outs come ONLY from explicit ``{out: N}`` stat tokens (paloi, paloi
  kärpäsenä, tekninen palo). A koppi (``hit-caught``) is a fielding act, not
  an out, and a haava clears a runner without an out.
- Halves do not always end at three outs: the round rule (kierrossääntö) can
  end a half at 0-2 outs, and a walk-off half may be absent entirely. The
  half boundary is a (period, inning, bat_turn) change, never ``outs == 3``.
- period 0/1 = the two jaksot, 2 = supervuoro (may contain only markers),
  3 = kotiutuslyöntikilpailu. Periods >= 2 are stored but excluded from all
  run-environment stats.
- A kunnari scores one run and leaves the batter on third base.
- Unknown group types and tokens are recorded as warnings, never raised: the
  feed contains at least one undocumented group type ('x', tekninen palo).
"""

from __future__ import annotations

import gzip
import json
import time
import urllib.error
import urllib.request

EVENTS_URL = "https://v1.pesistulokset.fi/api/v1/online/{match_id}/events"

# Bump when the parser semantics change: stored plays with an older version
# are refetched and reparsed by `ingest-pbp`.
PARSE_VERSION = 1

_HEADERS = {
    "User-Agent": "mallo-analytics/0.1",
    "Accept": "application/json",
    "Accept-Encoding": "gzip",
}

# Finnish base words -> base number (4 = kotipesä).
_BASE_WORDS = {
    "ykköspesälle": 1, "ykköspesään": 1,
    "kakkospesälle": 2, "kakkospesään": 2,
    "kolmospesälle": 3, "kolmospesään": 3,
    "kotipesään": 4, "kotipesälle": 4, "kotiin": 4,
}

# Event text -> action. Longest/most specific first where prefixes overlap.
_EVENT_ACTIONS = (
    ("eteni harhaheitolla", "advance_error"),
    ("paloi kärpäsenä", "out_doubled"),
    ("löi kunnarin", "homerun"),
    ("kunnari ja juoksu", "homerun"),
    ("sai vapaataipaleen", "walk"),
    ("haavoittui", "wound"),
    ("haava", "wound"),
    ("paloi", "out"),
    ("palo", "out"),
    ("eteni", "advance"),
    ("karkasi", "advance"),
    ("juoksu", "run"),
    ("laiton", "foul"),
    ("ei tapahtumaa", "no_event"),
    ("vapaa", "no_event"),  # scoring-contest free result
)

_MARKER_TEXTS = ("alkoi", "päättyi")

# Groups that carry live game state (base runners, outs).
_STATE_GROUPS = {"o", "he", "x", "osc"}


def _mask(bases):
    return "".join("1" if b is not None else "0" for b in bases)


def parse_events(payload: dict, match_id: int) -> dict:
    """Normalize an /online/{id}/events payload. Pure; never raises on
    unknown grammar — unrecognized tokens become warnings."""
    groups = payload.get("events") or []
    warnings: list[str] = []
    n_warnings = 0

    plays: list[dict] = []
    lineups: list[dict] = []

    # half state
    half_key = None
    outs = 0
    bases: list = [None, None, None]
    bat_team = None

    # opening batting order reconstruction: team_id -> [player ids in order]
    first_cycle: dict[int, list[int]] = {}
    cycle_done: dict[int, bool] = {}
    lineup_phase: dict[int, int] = {}
    pitcher: dict[int, int | None] = {}

    def warn(msg):
        nonlocal n_warnings
        n_warnings += 1
        if len(warnings) < 20:
            warnings.append(msg)

    seq = 0
    for g in groups:
        gtype = g.get("groupType") or "?"
        period = g.get("period") or 0
        inning = g.get("inning") or 0
        bat_turn = g.get("batTurn") or 0
        # NOTE: the payload's hTeam is NOT the home team — it mirrors the
        # acting team on most groups. Home/away is resolved in import_events
        # by joining batter ids to player_games.home.
        g_team = g.get("team")
        batter = g.get("batter")

        if gtype in _STATE_GROUPS:
            key = (period, inning, bat_turn)
            if key != half_key:
                half_key = key
                outs = 0
                bases = [None, None, None]
                bat_team = None
            if g_team is not None:
                bat_team = g_team

        for e in (g.get("events") or []):
            texts = e.get("texts") or []
            rb = e.get("runnersAtBases")

            action = None
            actor = None
            to_base = None
            out_inc = 0
            caught = 0
            runs = 0
            hit_x = hit_y = None
            hit_number = None
            pointhits = pointhitf = tailhits = None
            sub_token = None

            for tx in texts:
                if isinstance(tx, str):
                    low = tx.strip().lower()
                    for word, base in _BASE_WORDS.items():
                        if word in low:
                            to_base = base
                            break
                    if "lyöntivuorossa" in low or "lyöntivuoro" == low:
                        action = action or "at_bat"
                    if "jätettiin välistä" in low:
                        action = "skipped"
                    if "tekninen palo" in low:
                        action = "out_technical"
                    continue
                if not isinstance(tx, dict):
                    warn(f"non-dict token: {tx!r}")
                    continue
                ttype = tx.get("type")
                if ttype == "player":
                    if actor is None:
                        actor = tx.get("id")
                    if tx.get("settling-at-bat"):
                        action = action or "at_bat"
                elif ttype == "event":
                    text = (tx.get("text") or "").strip()
                    low = text.lower()
                    matched = None
                    for prefix, act in _EVENT_ACTIONS:
                        if low.startswith(prefix):
                            matched = act
                            break
                    if matched:
                        action = matched
                    elif any(m in low for m in _MARKER_TEXTS):
                        action = "marker"
                    else:
                        action = action or "unknown"
                        warn(f"unknown event text: {text[:60]}")
                elif ttype == "stat":
                    for k, v in tx.items():
                        if k in ("type", "hide"):
                            continue
                        if k == "out":
                            out_inc += 1
                        elif k in ("score", "wtscore", "walkscore"):
                            runs += 1
                        elif k == "pointhits":
                            pointhits = v
                        elif k == "pointhitf":
                            pointhitf = v
                        elif k == "tailhits":
                            tailhits = v
                        elif k in ("homerun", "runner-at-3", "periodend",
                                   "oscscore", "osctype", "match-started",
                                   "match-ended"):
                            pass
                        else:
                            warn(f"unknown stat key: {k}")
                elif ttype == "hit":
                    h = tx.get("hit")
                    if h:
                        hit_number = h.get("hit_number")
                        try:
                            x, y = float(h.get("x") or 0), float(h.get("y") or 0)
                        except (TypeError, ValueError):
                            x = y = 0.0
                        if x or y:
                            hit_x, hit_y = x, y
                        if h.get("caught"):
                            caught = 1
                            action = action or "koppi"
                        elif h.get("out"):
                            action = action or "foul"
                        else:
                            action = action or "hit"
                elif ttype == "hit-caught":
                    caught = 1
                elif ttype == "hit-out":
                    pass  # 'laiton' marker; the hit token already set foul
                elif ttype == "substitution":
                    sub_token = tx
                    action = "substitution"
                elif ttype == "scoring-contest-pair":
                    action = action or "osc_pair"
                elif ttype in ("team", "manager"):
                    pass  # warnings/notes aimed at the bench, not the game state
                else:
                    action = action or "unknown"
                    warn(f"unknown token type: {ttype}")

            if action is None:
                action = {"m": "marker", "t": "timeout", "doc": "marker",
                          "n": "note"}.get(gtype, "unknown")
                if action == "unknown":
                    warn(f"undecoded sub-event in group {gtype}")

            if action == "homerun":
                runs = max(runs, 1)  # kunnari scores one; no score token

            bases_before = list(bases)
            outs_before = outs
            outs += out_inc

            from_base = None
            if actor is not None:
                if actor in bases_before:
                    from_base = bases_before.index(actor) + 1
                elif actor == batter:
                    from_base = 0

            new_bases = bases
            if rb and len(rb) >= 4:
                new_bases = list(rb[1:4])

            plays.append({
                "match_id": match_id, "seq": seq, "group_id": g.get("id")
                if isinstance(g.get("id"), int) else None,
                "group_type": gtype, "period": period, "inning": inning,
                "bat_turn": bat_turn, "bat_team_id": bat_team,
                "is_home_bat": None,  # resolved against player_games at import
                "batter_id": batter, "actor_id": actor, "action": action,
                "from_base": from_base, "to_base": to_base,
                "out": 1 if out_inc else 0, "caught": caught, "runs": runs,
                "hit_x": hit_x, "hit_y": hit_y, "hit_number": hit_number,
                "pointhits": pointhits, "pointhitf": pointhitf,
                "tailhits": tailhits,
                "outs_before": outs_before, "outs_after": outs,
                "base_state_before": _mask(bases_before),
                "base_state_after": _mask(new_bases),
                "runners_before": json.dumps(bases_before),
                "ts": g.get("timestamp"),
            })
            seq += 1
            bases = new_bases

            # opening-order reconstruction from the first batter cycle
            if action == "at_bat" and bat_team is not None and actor is not None:
                order = first_cycle.setdefault(bat_team, [])
                if not cycle_done.get(bat_team):
                    if actor in order:
                        cycle_done[bat_team] = True
                    else:
                        order.append(actor)

            if sub_token is not None:
                team_id = sub_token.get("team")
                new_order = sub_token.get("newLineUp") or []
                phase = lineup_phase.get(team_id, 0) + 1
                lineup_phase[team_id] = phase
                pid = sub_token.get("pitcher")
                pitcher[team_id] = int(pid) if pid is not None else None
                for slot, raw_id in enumerate(new_order, start=1):
                    try:
                        player_id = int(raw_id)
                    except (TypeError, ValueError):
                        warn(f"bad lineup id: {raw_id!r}")
                        continue
                    lineups.append({
                        "match_id": match_id, "team_id": team_id,
                        "is_home": None,  # resolved at import
                        "phase": phase, "slot": slot, "player_id": player_id,
                        "pitcher_id": pitcher[team_id],
                        "source": "substitution",
                    })

    # phase 0: reconstructed opening order (usage order; jokers appear when
    # they first batted, not by official card slot)
    for team_id, order in first_cycle.items():
        for slot, player_id in enumerate(order, start=1):
            lineups.append({
                "match_id": match_id, "team_id": team_id,
                "is_home": None,  # resolved at import
                "phase": 0, "slot": slot, "player_id": player_id,
                "pitcher_id": None, "source": "reconstructed",
            })

    meta = {
        "finished": bool(payload.get("finished")),
        "n_groups": len(groups),
        "n_plays": len(plays),
        "n_warnings": n_warnings,
        "warnings": warnings,
    }
    return {"plays": plays, "lineups": lineups, "meta": meta}


# ── DB layer ────────────────────────────────────────────────────────────────

_PLAY_COLS = (
    "match_id", "seq", "season_id", "group_id", "group_type", "period",
    "inning", "bat_turn", "bat_team_id", "is_home_bat", "batter_id",
    "actor_id", "action", "from_base", "to_base", "out", "caught", "runs",
    "hit_x", "hit_y", "hit_number", "pointhits", "pointhitf", "tailhits",
    "outs_before", "outs_after", "base_state_before", "base_state_after",
    "runners_before", "ts",
)


def _team_home_map(conn, match_id: int, plays: list, lineups: list) -> dict:
    """Upstream team id -> home flag, resolved through the batters' own
    player_games rows (the payload itself never identifies the home side)."""
    home_by_player = {r["player_id"]: r["home"] for r in conn.execute(
        "SELECT player_id, home FROM player_games WHERE match_id = ?",
        (match_id,))}
    mapping: dict = {}
    for p in plays:
        tid, batter = p.get("bat_team_id"), p.get("batter_id")
        if tid is not None and tid not in mapping and batter in home_by_player:
            mapping[tid] = home_by_player[batter]
    for l in lineups:
        tid = l.get("team_id")
        if tid is not None and tid not in mapping \
                and l.get("player_id") in home_by_player:
            mapping[tid] = home_by_player[l["player_id"]]
    return mapping


def import_events(conn, match_id: int, payload: dict, season_id: int) -> dict:
    """Parse and store one match's PBP. Idempotent: delete + reinsert."""
    parsed = parse_events(payload, match_id)
    meta = parsed["meta"]
    team_home = _team_home_map(conn, match_id, parsed["plays"], parsed["lineups"])
    for p in parsed["plays"]:
        p["is_home_bat"] = team_home.get(p.get("bat_team_id"))
    for l in parsed["lineups"]:
        l["is_home"] = team_home.get(l.get("team_id"))
    conn.execute("DELETE FROM plays WHERE match_id = ?", (match_id,))
    conn.execute("DELETE FROM lineups WHERE match_id = ?", (match_id,))
    rows = [tuple(dict(p, season_id=season_id).get(c) for c in _PLAY_COLS)
            for p in parsed["plays"]]
    conn.executemany(
        f"INSERT INTO plays ({','.join(_PLAY_COLS)}) "
        f"VALUES ({','.join('?' * len(_PLAY_COLS))})", rows)
    conn.executemany(
        "INSERT OR REPLACE INTO lineups "
        "(match_id, team_id, is_home, phase, slot, player_id, pitcher_id, source) "
        "VALUES (?,?,?,?,?,?,?,?)",
        [(l["match_id"], l["team_id"], l["is_home"], l["phase"], l["slot"],
          l["player_id"], l["pitcher_id"], l["source"])
         for l in parsed["lineups"]])
    record_attempt(conn, match_id, season_id,
                   "ok" if meta["finished"] else "unfinished", meta)
    return meta


def record_attempt(conn, match_id: int, season_id, status: str,
                   meta: dict | None = None) -> None:
    meta = meta or {}
    conn.execute(
        "INSERT OR REPLACE INTO pbp_meta (match_id, season_id, fetched_at, "
        "status, finished, parse_version, n_groups, n_plays, n_warnings, warnings) "
        "VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'), ?, ?, ?, ?, ?, ?, ?)",
        (match_id, season_id, status,
         1 if meta.get("finished") else 0 if meta else None,
         PARSE_VERSION if meta else None,
         meta.get("n_groups"), meta.get("n_plays"),
         meta.get("n_warnings", 0),
         json.dumps(meta.get("warnings", [])) if meta else None))


# ── Fetch ───────────────────────────────────────────────────────────────────

def fetch_events(match_id: int, retries: int = 3) -> dict | None:
    """GET the events payload. Returns None when the match has no live
    scoring (404 / HTML error page) — the caller records status 'missing'."""
    url = EVENTS_URL.format(match_id=match_id)
    last_err = None
    for attempt in range(retries):
        req = urllib.request.Request(url, headers=_HEADERS)
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = resp.read()
                if resp.headers.get("Content-Encoding") == "gzip":
                    data = gzip.decompress(data)
            return json.loads(data.decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code in (403, 404, 410):
                return None
            last_err = exc
        except json.JSONDecodeError:
            return None  # HTML error page — no live scoring for this match
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last_err = exc
        time.sleep(1 + attempt)
    raise RuntimeError(f"fetch_events({match_id}) failed: {last_err}")


def matches_needing_pbp(conn, year: int | None = None,
                        season_id: int | None = None,
                        since: str | None = None,
                        retry_errors: bool = False,
                        force: bool = False) -> list:
    """Finished-by-date matches whose PBP is absent, stale or retryable."""
    where = ["m.date < date('now')"]
    args: list = []
    if year is not None:
        where.append("s.year = ?")
        args.append(year)
    if season_id is not None:
        where.append("m.season_id = ?")
        args.append(season_id)
    if since:
        where.append("m.date >= ?")
        args.append(since)
    cond = ("1=1" if force else
            "pm.match_id IS NULL"
            " OR (pm.status = 'ok' AND pm.parse_version < ?)"
            " OR pm.status = 'unfinished'"
            + (" OR pm.status = 'error'" if retry_errors else ""))
    if not force:
        args.append(PARSE_VERSION)
    sql = (
        "SELECT m.id, m.season_id, m.date FROM matches m "
        "JOIN seasons s ON s.id = m.season_id "
        "LEFT JOIN pbp_meta pm ON pm.match_id = m.id "
        f"WHERE {' AND '.join(where)} AND ({cond}) "
        "ORDER BY m.date, m.id")
    # `?` order: the WHERE args come first, PARSE_VERSION belongs to `cond`
    return conn.execute(sql, args).fetchall()


def ingest_pbp(conn, year: int | None = None, season_id: int | None = None,
               since: str | None = None, limit: int | None = None,
               retry_errors: bool = False, force: bool = False,
               sleep_s: float = 1.0, log=print) -> dict:
    """Fetch + import PBP for every match that needs it. The daily driver."""
    todo = matches_needing_pbp(conn, year=year, season_id=season_id,
                               since=since, retry_errors=retry_errors,
                               force=force)
    if limit:
        todo = todo[:limit]
    counts = {"ok": 0, "unfinished": 0, "missing": 0, "error": 0}
    for i, row in enumerate(todo):
        mid, sid = row["id"], row["season_id"]
        try:
            payload = fetch_events(mid)
        except RuntimeError as exc:
            record_attempt(conn, mid, sid, "error")
            counts["error"] += 1
            log(f"  {mid}: error ({exc})")
            conn.commit()
            continue
        if payload is None or not payload.get("events"):
            record_attempt(conn, mid, sid, "missing")
            counts["missing"] += 1
        else:
            meta = import_events(conn, mid, payload, sid)
            counts["ok" if meta["finished"] else "unfinished"] += 1
            if meta["n_warnings"]:
                log(f"  {mid}: {meta['n_plays']} plays, "
                    f"{meta['n_warnings']} warnings")
        conn.commit()
        if i < len(todo) - 1:
            time.sleep(sleep_s)
    log(f"pbp: {len(todo)} matches attempted — "
        + ", ".join(f"{k}={v}" for k, v in counts.items() if v))
    return counts
