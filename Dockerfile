FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

COPY . .
RUN chmod +x entrypoint.sh

# Bake a current-season snapshot (keyless via v1.pesistulokset.fi; demo
# league as offline fallback). At runtime entrypoint.sh copies it onto the
# data volume ONLY if the volume is empty — an existing volume (e.g. with
# the 1991→ historical backfill) is never overwritten by a deploy.
RUN PESIS_DB_PATH=/app/seed/pesis.db python -m pesis ingest-v1 --year 2026 --series all \
    || PESIS_DB_PATH=/app/seed/pesis.db python -m pesis demo

EXPOSE 8080
CMD ["./entrypoint.sh"]
