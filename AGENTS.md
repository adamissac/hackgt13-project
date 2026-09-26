# Project instructions for AI coding agents (Codex reads AGENTS.md, Claude reads CLAUDE.md; keep them identical)

Read this file and everything in `docs/` before writing code. If a request conflicts with `docs/`, stop and ask.

## What we are building
A networking app for events (career fairs, hackathons). Users log in with LinkedIn, connect GitHub/Facebook,
upload a resume. AI extracts their interests. The app ranks who they should meet at an event, verifies a real
conversation with a QR handshake, and asks a short checklist afterward. An organizer dashboard shows a live
map of interest communities. Full scope and priorities: `SCOPE.md`.

## Stack (do not swap without team agreement)
- `mobile/`    React Native with Expo dev build, TypeScript, Expo Router
- `supabase/`  Postgres + pgvector, Supabase Auth (LinkedIn OIDC login), Storage (resume PDFs), Realtime
- `ml/`        Python FastAPI service: extraction (Claude API), embeddings (bge-small, 384 dims), scoring, models
- `dashboard/` Next.js + D3 organizer dashboard
- Push: Expo Notifications. Bluetooth: react-native-ble-plx. Location: expo-location. QR: expo-camera.

## Contracts (source of truth)
- Database: `docs/schema.sql`. Use these exact table and column names.
- API between mobile and ML service: `docs/api.md`. Use these exact request/response shapes.
- Changing either file requires telling the whole team first.

## Rules
- TypeScript strict mode in `mobile/` and `dashboard/`. Type API responses from `docs/api.md`.
- Never hardcode secrets. Read from environment variables listed in `.env.example`.
- Never put `SUPABASE_SERVICE_KEY` or any OAuth client secret in `mobile/`.
- Keep changes inside the folder you were asked to work on.
- Prefer small, working increments. After each change, explain how to run and test it.
- Privacy: only building-level location leaves the phone outside events; never store raw coordinates.
- Current API docs change often (TikTok, Facebook Graph, ble-plx, Expo). If unsure of an API, say so
  instead of guessing, and ask for the docs.

## Owners
- Adam: `mobile/` app shell, `supabase/`, auth, push
- Alan: `ml/` extraction, profiles, scoring, ranker, encounter model, FastAPI
- Arjun: `ml/` ingestion (GitHub, resume PDF, Facebook), synthetic data, `dashboard/`
- Akshar: `mobile/` Bluetooth, QR handshake, geofencing, pitch
