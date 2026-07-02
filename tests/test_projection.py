import statistics

from pesis import db, demo, ingest, projection

SPEC = projection.StatSpec("kl_pct", "karkilyonnit", "karki_yritykset",
                      beta=0.99, prior_strength=50.0)
LEAGUE = 0.55


def _games(spec_rows):
    """rows: (date, successes, attempts)"""
    return [{"date": d, SPEC.num: n, SPEC.den: a} for d, n, a in spec_rows]


def test_empty_history_returns_league_mean():
    proj = projection.project_stat([], SPEC, LEAGUE, "2026-06-01")
    assert proj["rate"] == LEAGUE
    assert proj["effective_n"] == 0


def test_small_samples_shrink_harder():
    small = projection.project_stat(_games([("2026-05-30", 8, 10)]), SPEC, LEAGUE, "2026-06-01")
    big = projection.project_stat(_games([("2026-05-30", 400, 500)]), SPEC, LEAGUE, "2026-06-01")
    # same observed 0.8, but the small sample must sit far closer to the prior
    assert LEAGUE < small["rate"] < big["rate"] < 0.8


def test_recent_games_outweigh_old_ones():
    hot_recent = _games([("2024-05-01", 5, 10), ("2026-05-30", 9, 10)])
    hot_ancient = _games([("2024-05-01", 9, 10), ("2026-05-30", 5, 10)])
    recent = projection.project_stat(hot_recent, SPEC, LEAGUE, "2026-06-01")["rate"]
    ancient = projection.project_stat(hot_ancient, SPEC, LEAGUE, "2026-06-01")["rate"]
    assert recent > ancient


def test_projections_track_latent_talent_in_demo():
    conn = db.connect(":memory:")
    players = demo.build_demo(conn, seed=7, years=(2025, 2026),
                              matches_per_season=20)
    league = projection.latest_league_means(conn)
    truths, projs = [], []
    for pid, p in players.items():
        proj = projection.project_player(conn, pid, as_of="2026-09-01", league=league)
        truths.append(p.rate("kl_rate", 2026))
        projs.append(proj["stats"]["kl_pct"]["rate"])
    r = statistics.correlation(truths, projs)
    assert r > 0.6, f"projection–truth correlation too weak: {r:.3f}"


def test_aging_curve_shape():
    conn = db.connect(":memory:")
    demo.build_demo(conn, seed=7, years=(2024, 2025, 2026), matches_per_season=16)
    curve = projection.aging_curve(conn, "kl_pct")
    assert curve, "no age deltas computed"
    old = [d for age, d in curve.items() if age >= 31]
    assert old and statistics.mean(old) < 0, "post-peak ages should decline on average"


def test_fit_decay_returns_spec_from_grid():
    conn = db.connect(":memory:")
    demo.build_demo(conn, seed=3, years=(2025, 2026), matches_per_season=6)
    tuned = projection.fit_decay(conn, SPEC, betas=(0.99, 0.999), strengths=(20.0, 100.0),
                            league_mean=LEAGUE)
    assert tuned.beta in (0.99, 0.999)
    assert tuned.prior_strength in (20.0, 100.0)
