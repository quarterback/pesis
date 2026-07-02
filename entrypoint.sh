#!/bin/sh
# Container entrypoint: seed the DB on first boot, refresh it daily, serve.
#
# - PESIS_DB_PATH normally points at a mounted volume (/data/pesis.db on
#   Fly). If the volume is empty, the current-season snapshot baked into the
#   image at /app/seed/pesis.db is copied in, so a fresh deploy serves real
#   data immediately.
# - A background loop re-ingests the current season every REFRESH_INTERVAL
#   seconds (default 24 h). SQLite runs in WAL mode, so the web workers keep
#   reading while the refresh writes; they notice the change via the DB file
#   mtime and drop their season caches.
# - Historical backfill is a one-time manual step (the volume keeps it):
#     fly ssh console -C "python -m pesis ingest-v1 --from-year 1991 --to-year 2026"
set -e

DB="${PESIS_DB_PATH:-/app/data/pesis.db}"
mkdir -p "$(dirname "$DB")"
if [ ! -s "$DB" ] && [ -s /app/seed/pesis.db ]; then
  echo "entrypoint: seeding $DB from baked snapshot"
  cp /app/seed/pesis.db "$DB"
fi

(
  while true; do
    sleep "${REFRESH_INTERVAL:-86400}"
    echo "entrypoint: refreshing current season"
    python -m pesis ingest-v1 --year "$(date +%Y)" --series both || \
      echo "entrypoint: refresh failed, keeping existing data"
  done
) &

exec gunicorn -b 0.0.0.0:8080 -w 2 wsgi:app
