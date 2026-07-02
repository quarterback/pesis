"""Mallo — a pesäpallo analytics engine built on pesistulokset.fi data.

Layers:
    api      — client for the official pesistulokset.fi JSON API
    db       — SQLite schema and connection handling
    ingest   — API → DB normalization
    demo     — seeded synthetic league, so everything runs without an API key
    metrics  — rate stats, league baselines, TEHO+, percentiles
    projection — daily player projections (decay-weighted, league-regressed)
"""

__version__ = "0.1.0"
