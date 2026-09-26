#!/usr/bin/env python3
"""Point the mobile app at a live ML service URL.

Usage: python3 scripts/set-mobile-api-url.py <url> [path/to/mobile/.env]
Creates mobile/.env from mobile/.env.example if missing, sets EXPO_PUBLIC_API_BASE_URL=<url> and
EXPO_PUBLIC_USE_MOCKS=0, and keeps every other line as it was.
"""
import os
import sys

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = sys.argv[1].rstrip("/")
path = sys.argv[2] if len(sys.argv) > 2 else os.path.join(root, "mobile", ".env")
example = os.path.join(os.path.dirname(path), ".env.example")

if os.path.exists(path):
    lines = open(path).read().splitlines()
elif os.path.exists(example):
    lines = open(example).read().splitlines()
else:
    lines = []

wanted = {"EXPO_PUBLIC_API_BASE_URL": url, "EXPO_PUBLIC_USE_MOCKS": "0"}
seen = set()
out = []
for line in lines:
    key = line.split("=", 1)[0].strip()
    if key in wanted and "=" in line and not line.lstrip().startswith("#"):
        if key not in seen:
            out.append(f"{key}={wanted[key]}")
            seen.add(key)
        continue
    out.append(line)
out += [f"{k}={v}" for k, v in wanted.items() if k not in seen]

with open(path, "w") as f:
    f.write("\n".join(out) + "\n")
print(f"Updated {path}: EXPO_PUBLIC_API_BASE_URL={url}, EXPO_PUBLIC_USE_MOCKS=0")
