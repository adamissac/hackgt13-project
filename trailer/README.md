# Constellation trailer

Remotion project for the Constellation launch trailer (HackGT 13).

| Output | Size | Length |
|---|---|---|
| `Trailer16x9` | 1920 x 1080, 30fps | 75s (2250 frames) |
| `Trailer9x16` | 1080 x 1920, 30fps | 45s (1350 frames) |
| `Sting` | 1920 x 1080, 30fps | 3s loop (90 frames) |

Rendered copies live in `renders/`.

## Setup
```bash
cd trailer
npm install
```

## Preview
```bash
npx remotion studio
```

## Render
```bash
npm run render:main       # out/constellation-trailer-16x9.mp4
npm run render:vertical   # out/constellation-trailer-9x16.mp4
npm run render:sting      # out/constellation-sting.mp4
npm run render:all
```
Posters: `npx remotion still src/index.ts Trailer16x9 out/poster-16x9.png --frame=2235`
(and `Trailer9x16 --frame=1335`).

Options: swap the music with `--props='{"musicFile":"music.mp3"}'` (file in `public/`), mute effects with
`--props='{"sfx":false}'`, or render silent with `--props='{"music":false,"sfx":false}'`.

## Regenerating assets
- `npm run prepare:assets` (Python 3 with numpy and Pillow): measures the captured screens, copies fonts,
  synthesizes the score and sound effects, and writes `src/audio/cues.json` from the cue list in `src/timeline.json`.
- Recapturing screens: build the app for web in demo mode
  (`cd mobile && EXPO_PUBLIC_USE_MOCKS=1 npx expo export --platform web --output-dir /tmp/webexport`), then run the
  Playwright scripts in `scripts/capture/` in order (`capture.py`, `capture2.py`, `capture3.py`). They serve the export locally and click through the demo flow. Set `EXPO_WEB_EXPORT` if the export lives somewhere other than `/tmp/webexport`, then run `npm run prepare:assets`.

## Layout
- `src/timeline.json`: scene order, timing, per-cut speed, and sound cues.
- `src/scenes/`: Opening, You, Matches, Meet, Proof, Montage, Constellation, Finale, Sting.
- `src/components/`: device frame, screen crops, taps, captions, stars and logo.
- `public/screens/`: captured app screens plus `manifest.json` (element positions in points).

See `BRIEF.md` for what each scene shows and `AUDIO_CUES.md` for the sound plan.
