FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

COPY . .

# Bake the demo league so a fresh deploy serves content immediately.
# Once real ingest is wired to an API key, mount a Fly volume at /data
# and set PESIS_DB_PATH=/data/pesis.db instead.
RUN python -m pesis demo

EXPOSE 8080
CMD ["gunicorn", "-b", "0.0.0.0:8080", "-w", "2", "wsgi:app"]
