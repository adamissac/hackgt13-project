"""Serve an Expo static web export with clean URLs and [param] route fallback."""
import http.server
import os
import re
import sys
from functools import partial

ROOT = sys.argv[1] if len(sys.argv) > 1 and __name__ == "__main__" else os.environ.get("EXPO_WEB_EXPORT", "/tmp/webexport")
PORT = 8081


def resolve(path: str) -> str:
    path = path.split("?")[0].split("#")[0]
    rel = path.lstrip("/")
    full = os.path.join(ROOT, rel)
    if rel and os.path.isfile(full):
        return rel
    for cand in (rel + ".html", os.path.join(rel, "index.html")):
        if os.path.isfile(os.path.join(ROOT, cand)):
            return cand
    # dynamic segments: /match/abc -> match/[id].html
    parts = [p for p in rel.split("/") if p]
    if parts:
        parent = os.path.join(ROOT, *parts[:-1])
        if os.path.isdir(parent):
            for name in os.listdir(parent):
                if re.fullmatch(r"\[[^\]]+\]\.html", name):
                    return os.path.join(*parts[:-1], name)
    return "index.html"


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def translate_path(self, path):
        return os.path.join(ROOT, resolve(path))


if __name__ == "__main__":
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), partial(Handler, directory=ROOT)).serve_forever()
