#!/usr/bin/env python3
"""Simple HTTP server with no-cache headers to prevent stale JS."""
import http.server, functools, os

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

os.chdir(os.path.join(os.path.dirname(__file__), '..'))
http.server.HTTPServer(('', 8000), NoCacheHandler).serve_forever()
