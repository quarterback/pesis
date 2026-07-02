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


def test_park_adjusted_teho_corrects_run_environment():
    from pesis import metrics
    conn = _conn()
    sid = conn.execute("SELECT id FROM seasons ORDER BY year DESC LIMIT 1").fetchone()[0]
    lines = [l for l in metrics.season_lines(conn, sid)
             if l["turns_at_bat"] >= metrics.QUALIFY_TURNS]

    def team_shift(team):
        diffs = [l["teho_plus_adj"] - l["teho_plus"]
                 for l in lines if l["team"] == team]
        return sum(diffs) / len(diffs)

    # Vimpeli (PF 1.12) hitters get deflated; Joensuu (0.90) hitters inflated
    assert team_shift("Vimpeli") < team_shift("Joensuu")
    assert team_shift("Vimpeli") < 0 < team_shift("Joensuu")


def test_empty_store_returns_no_factors():
    conn = db.connect(":memory:")
    assert context.park_factors(conn) == []
    assert context.weather_effects(conn) == []
