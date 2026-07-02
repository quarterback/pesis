#!/usr/bin/env python3
"""Minimal static file server for local preview of site/."""
import http.server, sys, os

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5000
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "site")

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def translate_path(self, path):
        p = super().translate_path(path)
        if not os.path.exists(p) and '.' not in os.path.basename(p):
            return os.path.join(ROOT, "index.html")
        return p

    def log_message(self, fmt, *args):
        pass

with http.server.HTTPServer(("", PORT), Handler) as httpd:
    print(f"Mallo static → http://localhost:{PORT}/", flush=True)
    httpd.serve_forever()
