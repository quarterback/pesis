#!/bin/sh
# Container entrypoint: seed on first boot, self-backfill, refresh daily, serve.
#
# Designed for a push-to-deploy workflow (GitHub -> Fly) with NO CLI steps:
# - PESIS_DB_PATH points at the mounted volume (/data/pesis.db on Fly; create
#   the volume once in the Fly web dashboard: Volumes -> pesis_data, 3 GB).
# - First boot on an empty volume: the current-season snapshot baked into the
#   image is copied in, so the site serves real data immediately; then the
#   full 1991-> historical backfill runs in the background (~10 min, WAL mode
#   keeps the site serving) and drops a marker on the volume so it never
#   re-runs. No volume mounted -> no auto-backfill (stays polite).
# - A loop re-ingests the current season every REFRESH_INTERVAL seconds
#   (default 24 h); workers notice the DB mtime change and drop caches.
set -e

DB="${PESIS_DB_PATH:-/app/data/pesis.db}"
DATA_DIR="$(dirname "$DB")"
mkdir -p "$DATA_DIR"

if [ ! -s "$DB" ] && [ -s /app/seed/pesis.db ]; then
  echo "entrypoint: seeding $DB from baked snapshot"
  cp /app/seed/pesis.db "$DB"
fi

on_volume() { grep -q " $DATA_DIR " /proc/mounts 2>/dev/null; }

if on_volume && [ ! -f "$DATA_DIR/.backfill-done" ]; then
  echo "entrypoint: starting one-time historical backfill in background"
  (
    python -m pesis ingest-v1 --from-year "${BACKFILL_FROM:-1991}" \
        --to-year "$(date +%Y)" --series all \
      && touch "$DATA_DIR/.backfill-done" \
      && echo "entrypoint: historical backfill complete" \
      || echo "entrypoint: backfill failed; will retry on next boot"
  ) &
fi

(
  while true; do
    sleep "${REFRESH_INTERVAL:-86400}"
    echo "entrypoint: refreshing current season"
    python -m pesis ingest-v1 --year "$(date +%Y)" --series all || \
      echo "entrypoint: refresh failed, keeping existing data"
  done
) &

exec gunicorn -b 0.0.0.0:8080 -w 2 wsgi:app
