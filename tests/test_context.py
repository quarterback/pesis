from pesis import context, db, demo


def _conn():
    conn = db.connect(":memory:")
    demo.build_demo(conn, seed=11, years=(2024, 2025, 2026), matches_per_season=20)
    return conn


def test_park_factors_recover_latent_environment():
    conn = _conn()
    pf = {p["stadium"]: p["pf"] for p in context.park_factors(conn)}
    assert len(pf) == 10
    # demo bakes Vimpeli 1.12 and Joensuu 0.90 — extremes must come out ordered
    assert pf["Vimpeli stadion"] > 100 > pf["Joensuu stadion"]
    best = max(demo.PARK, key=demo.PARK.get)
    worst = min(demo.PARK, key=demo.PARK.get)
    assert pf[f"{best} stadion"] > pf[f"{worst} stadion"]


def test_wind_lifts_kunnari_rate():
    conn = _conn()
    buckets = context.weather_effects(conn)
    assert len(buckets) == 3
    calm, _, windy = buckets
    assert windy["kunnari_rate"] > calm["kunnari_rate"]


def test_empty_store_returns_no_factors():
    conn = db.connect(":memory:")
    assert context.park_factors(conn) == []
    assert context.weather_effects(conn) == []
