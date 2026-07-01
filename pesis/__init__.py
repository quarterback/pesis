"""Kärki — a pesäpallo analytics engine built on pesistulokset.fi data.

Layers:
    api      — client for the official pesistulokset.fi JSON API
    db       — SQLite schema and connection handling
    ingest   — API → DB normalization
    demo     — seeded synthetic league, so everything runs without an API key
    metrics  — rate stats, league baselines, TEHO+, percentiles
    tahko    — TAHKO projections (decayed + regressed daily player projections)
"""

__version__ = "0.1.0"
