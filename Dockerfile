FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

COPY . .

# Bake real current-season Superpesis data (keyless via v1.pesistulokset.fi)
# into the image; fall back to the synthetic demo league if the fetch fails.
# Re-deploying refreshes the snapshot. For daily updates without deploys,
# mount a Fly volume, set PESIS_DB_PATH, and cron `python -m pesis ingest-v1`.
RUN python -m pesis ingest-v1 --year 2026 --series both || python -m pesis demo

EXPOSE 8080
CMD ["gunicorn", "-b", "0.0.0.0:8080", "-w", "2", "wsgi:app"]
