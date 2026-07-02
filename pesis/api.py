"""Client for the official pesistulokset.fi JSON API.

The results service (tulospalvelu) behind https://www.pesistulokset.fi is an
SPA fed entirely by a REST API at https://api.pesistulokset.fi/api/v1. The API
is documented at https://ttk.pesistulokset.fi/api-docs and third-party use is
officially supported (there is even a WordPress plugin). Every request needs
an ``apikey`` query parameter; keys are free — email tulospalvelu@pesis.fi.

Set the key in the environment::

    export PESISTULOKSET_API_KEY=...

Responses are cached on disk (default ``.cache/api``) so historical backfills
are polite to the service: a season from 1990 never changes, so it is fetched
exactly once.
"""

from __future__ import annotations

import hashlib
import json
import os
import time
import urllib.parse
import urllib.request

BASE_URL = "https://api.pesistulokset.fi/api/v1"
ENV_KEY = "PESISTULOKSET_API_KEY"


class ApiKeyMissing(RuntimeError):
    pass


class PesisApi:
    """Thin, cached client for the endpoints the analytics layer needs."""

    def __init__(self, api_key: str | None = None, cache_dir: str = ".cache/api",
                 min_interval: float = 0.5):
        self.api_key = api_key or os.environ.get(ENV_KEY)
        self.cache_dir = cache_dir
        self.min_interval = min_interval
        self._last_request = 0.0

    # -- transport -----------------------------------------------------------

    def get(self, path: str, **params) -> dict | list:
        """GET ``/api/v1{path}`` with the api key, JSON-decoded and disk-cached."""
        if not self.api_key:
            raise ApiKeyMissing(
                f"No API key. Set ${ENV_KEY} (free keys: email tulospalvelu@pesis.fi, "
                "docs at https://ttk.pesistulokset.fi/api-docs). "
                "For a keyless local sandbox, use `python -m pesis demo`."
            )
        params = {k: v for k, v in sorted(params.items()) if v is not None}
        cache_file = self._cache_path(path, params)
        if cache_file and os.path.exists(cache_file):
            with open(cache_file, encoding="utf-8") as f:
                return json.load(f)

        query = urllib.parse.urlencode({**params, "apikey": self.api_key})
        url = f"{BASE_URL}{path}?{query}"
        self._throttle()
        req = urllib.request.Request(url, headers={"User-Agent": "karki-analytics/0.1"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        if cache_file:
            os.makedirs(os.path.dirname(cache_file), exist_ok=True)
            with open(cache_file, "w", encoding="utf-8") as f:
                json.dump(data, f)
        return data

    def _cache_path(self, path: str, params: dict) -> str | None:
        if not self.cache_dir:
            return None
        digest = hashlib.sha256(
            json.dumps([path, params], sort_keys=True).encode()
        ).hexdigest()[:24]
        return os.path.join(self.cache_dir, f"{digest}.json")

    def _throttle(self) -> None:
        wait = self._last_request + self.min_interval - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        self._last_request = time.monotonic()

    # -- endpoints -----------------------------------------------------------

    def series_list(self, year: int | None = None):
        """All series (leagues). Covers 1945–present; 2026 alone has ~220 series."""
        return self.get("/public/series-list", year=year)

    def stats_definitions(self):
        """The canonical stat catalog — use this to confirm ingest.FIELD_MAP."""
        return self.get("/public/stats-definitions")

    def matches_list(self, series_id=None, level_id=None, team_id=None,
                     date=None, date_to=None, type="played", limit=None):
        return self.get("/public/matches-list", seriesId=series_id,
                        levelId=level_id, teamId=team_id, date=date,
                        dateTo=date_to, type=type, limit=limit)

    def match(self, match_id: int):
        """Line score by jakso, rosters, referees, stadium, weather, attendance."""
        return self.get("/public/match", id=match_id)

    def match_events(self, match_id: int):
        """Play-by-play event stream, incl. runnersAtBases per event."""
        return self.get(f"/online/{match_id}/events")

    def stats_players(self, series_id=None, season_id=None, **filters):
        """Per-player per-match stat rows (~82 fields) — the analytics goldmine."""
        return self.get("/stats-tool/players", seriesId=series_id,
                        seasonId=season_id, **filters)

    def player(self, player_id: int):
        return self.get(f"/public/player/{player_id}")
