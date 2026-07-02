"""Seeded synthetic league, so the whole stack runs without an API key.

Generates a plausible Superpesis-shaped dataset: teams, players with latent
per-stat true talent, an aging arc, and per-match stat lines sampled from that
talent. The point is NOT realism — it is a deterministic sandbox for the
metrics layer, the TAHKO projections, and the web UI, sized like a real
backfill (a few seasons × ~120 players × ~26 matches).

Because every line is sampled from known latent talent, the demo also doubles
as a test harness: TAHKO's projections can be scored against the true rates
that generated the data (see tests/test_tahko.py).
"""

from __future__ import annotations

import datetime
import random
import sqlite3

from . import ingest

FIRST = ["Aleksi", "Eero", "Henri", "Ilkka", "Juho", "Konsta", "Lauri", "Matti",
         "Niko", "Oskari", "Perttu", "Roope", "Sami", "Topi", "Veikko", "Väinö",
         "Anni", "Elina", "Heidi", "Iida", "Jenna", "Kaisa", "Laura", "Minna",
         "Noora", "Oona", "Pinja", "Ronja", "Sanni", "Tiia", "Venla", "Emma"]
LAST = ["Ahonen", "Hakala", "Heikkinen", "Järvinen", "Kinnunen", "Korhonen",
        "Laine", "Lehtonen", "Mäkelä", "Niemi", "Ojala", "Peltola", "Rantanen",
        "Salmi", "Toivonen", "Virtanen"]
TEAMS = ["Vimpeli", "Sotkamo", "Manse", "Joensuu", "Kouvola", "Hyvinkää",
         "Kempele", "Seinäjoki", "Imatra", "Alajärvi"]

# latent run environment per home stadium — the ground truth that
# context.park_factors() must recover (tests assert the ordering)
PARK = {"Vimpeli": 1.12, "Sotkamo": 0.94, "Manse": 1.06, "Joensuu": 0.90,
        "Kouvola": 1.00, "Hyvinkää": 1.03, "Kempele": 0.97, "Seinäjoki": 1.08,
        "Imatra": 0.92, "Alajärvi": 1.00}
WIND_KUNNARI = 0.05  # multiplicative kunnari boost per m/s of wind

# latent talent: stat -> (league mean, between-player sd)
TALENT = {
    "kl_rate": (0.55, 0.10),      # kärkilyönti-%
    "saatto_rate": (0.45, 0.09),
    "eten_rate": (0.50, 0.09),
    "kunnari_rate": (0.03, 0.03),  # per turn at bat
    "lyoty_rate": (0.18, 0.07),
    "tuotu_rate": (0.16, 0.06),
    "haava_rate": (0.05, 0.02),
    "palo_rate": (0.15, 0.04),
}
PEAK_AGE = 27
AGE_SLOPE = 0.004  # multiplicative talent loss per year² from peak


class DemoPlayer:
    def __init__(self, rng: random.Random, pid: int):
        self.id = pid
        self.name = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
        self.born_year = rng.randint(1992, 2006)
        self.talent = {
            stat: max(0.005, min(0.95, rng.gauss(mean, sd)))
            for stat, (mean, sd) in TALENT.items()
        }

    def rate(self, stat: str, year: int) -> float:
        """True talent with a quadratic aging arc around PEAK_AGE."""
        age = year - self.born_year
        factor = 1.0 - AGE_SLOPE * (age - PEAK_AGE) ** 2
        return max(0.003, min(0.97, self.talent[stat] * max(0.5, factor)))


def _game_row(rng: random.Random, p: DemoPlayer, year: int, match_id: int,
              date: str, team: str, opp: str, home: bool,
              park: float = 1.0, wind: float = 0.0) -> dict:
    turns = rng.choice([2, 3, 3, 4, 4, 5])
    kly = sum(rng.random() < 0.6 for _ in range(turns * 2))
    saatto_y = rng.randint(0, 3)
    eten_y = rng.randint(1, 5)
    kunnari_p = min(0.9, p.rate("kunnari_rate", year) * park * (1 + WIND_KUNNARI * wind))
    run_p = {stat: min(0.95, p.rate(stat, year) * park)
             for stat in ("lyoty_rate", "tuotu_rate")}
    row = {
        "player_id": p.id, "player_name": p.name, "born_year": p.born_year,
        "match_id": match_id, "date": date, "team": team, "opponent": opp,
        "home": int(home), "turns_at_bat": turns,
        "karkilyonti_yritykset": kly,
        "karkilyonnit": sum(rng.random() < p.rate("kl_rate", year) for _ in range(kly)),
        "saatto_yritykset": saatto_y,
        "saatot": sum(rng.random() < p.rate("saatto_rate", year) for _ in range(saatto_y)),
        "eteneminen_yritykset": eten_y,
        "etenemiset": sum(rng.random() < p.rate("eten_rate", year) for _ in range(eten_y)),
        "kunnarit": sum(rng.random() < kunnari_p for _ in range(turns)),
        "lyodyt": sum(rng.random() < run_p["lyoty_rate"] for _ in range(turns)),
        "tuodut": sum(rng.random() < run_p["tuotu_rate"] for _ in range(eten_y)),
        "haavat": sum(rng.random() < p.rate("haava_rate", year) for _ in range(turns)),
        "palot": sum(rng.random() < p.rate("palo_rate", year) for _ in range(turns)),
    }
    return row


def build_demo(conn: sqlite3.Connection, seed: int = 27,
               years: tuple[int, ...] = (2024, 2025, 2026),
               matches_per_season: int = 26) -> dict:
    """Populate ``conn`` with a deterministic synthetic league.

    Returns {player_id: DemoPlayer} so callers (tests) can compare TAHKO
    output against the latent truth.
    """
    rng = random.Random(seed)
    players: dict[int, DemoPlayer] = {}
    rosters: dict[str, list[DemoPlayer]] = {}
    pid = 1
    for team in TEAMS:
        rosters[team] = []
        for _ in range(12):
            p = DemoPlayer(rng, pid)
            players[pid] = p
            rosters[team].append(p)
            pid += 1

    match_id = 1
    for year in years:
        season_id = ingest.upsert_season(conn, year, "Demo-Superpesis")
        date = datetime.date(year, 5, 1)
        for _round in range(matches_per_season):
            order = TEAMS[:]
            rng.shuffle(order)
            for i in range(0, len(order), 2):
                home_team, away_team = order[i], order[i + 1]
                park = PARK[home_team]
                wind = round(rng.uniform(0.0, 8.0), 1)
                temp = round(rng.uniform(11.0, 28.0), 1)
                rain = int(rng.random() < 0.10)
                runs = {home_team: 0, away_team: 0}
                for team, opp, is_home in ((home_team, away_team, True),
                                           (away_team, home_team, False)):
                    for p in rosters[team]:
                        if rng.random() < 0.12:  # rests / injuries
                            continue
                        row = _game_row(rng, p, year, match_id, date.isoformat(),
                                        team, opp, is_home, park=park, wind=wind)
                        ingest.insert_player_game(conn, season_id, row)
                        runs[team] += row["tuodut"]
                ingest.insert_match(conn, season_id, {
                    "id": match_id, "date": date.isoformat(),
                    "home_team": home_team, "away_team": away_team,
                    "stadium": f"{home_team} stadion", "temperature": temp,
                    "wind": wind, "rain": rain,
                    "attendance": rng.randint(400, 4500),
                    "home_runs": runs[home_team], "away_runs": runs[away_team],
                })
                match_id += 1
            date += datetime.timedelta(days=rng.choice([3, 3, 4]))
    conn.commit()
    return players
