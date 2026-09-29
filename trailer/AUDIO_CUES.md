# Audio cue sheet

Everything here is original and synthesized in `scripts/prepare.py` (no copyrighted music). Tempo 116 BPM, key of D major
(chords Dmaj9, Bm9, Gmaj9, A6sus, two bars each).

## Score structure

Main cut (75s, `public/audio/score-16x9.wav`)

| Time | What happens |
|---|---|
| 0.0 to 9.0s | Low D drone and air, swelling under the cold open |
| 9.0s | The drop: pad blooms and the kick starts as the wordmark lands |
| 9.0 to 50.0s | Confident pulse: kick on 1 and 3, soft offbeat hats, chord pads |
| 50.0 to 58.0s | Montage lift: eighth-note arpeggio, brighter hats |
| 58.0 to 66.0s | Pull back for the Constellation: drums drop out, sparse high bells |
| 66.0 to 70.6s | Tech beat: lighter kick and a riser |
| 70.6s | Final Dmaj9 chord with bells, fading out by 75s |

Vertical cut (45s, `public/audio/score-9x16.wav`): drone to 7.5s, drop at 7.5s, pulse to 32s, bells 32 to 40s, final chord at 41.3s.

## Sound effects

Each hit is its own `<Audio>` layer (`src/components/AudioLayer.tsx`). Turn them all off with `--props='{"sfx":false}'`,
or edit timings in the `cues` block of `src/timeline.json` (scene-local frames) and rerun `npm run prepare:assets`.

### Main cut (16:9)

| Time | Frame | Sound | Gain |
|---|---|---|---|
|  4.20s | 126 | star shimmer (`sfx/shimmer.wav`) | 0.32 |
|  6.20s | 186 | whoosh (`sfx/whoosh.wav`) | 0.256 |
|  7.93s | 238 | riser (`sfx/rise.wav`) | 0.42 |
|  9.00s | 270 | logo hit (`sfx/impact.wav`) | 0.85 |
| 11.57s | 347 | whoosh (`sfx/whoosh.wav`) | 0.32 |
| 13.70s | 411 | UI tap (`sfx/tap.wav`) | 0.45 |
| 14.17s | 425 | short swish (`sfx/swish.wav`) | 0.132 |
| 15.23s | 457 | UI tap (`sfx/tap.wav`) | 0.45 |
| 15.50s | 465 | soft chime (`sfx/chime_soft.wav`) | 0.35 |
| 16.97s | 509 | short swish (`sfx/swish.wav`) | 0.132 |
| 17.70s | 531 | tick (item arrives) (`sfx/tick.wav`) | 0.22 |
| 18.00s | 540 | tick (item arrives) (`sfx/tick.wav`) | 0.22 |
| 18.30s | 549 | tick (item arrives) (`sfx/tick.wav`) | 0.22 |
| 18.60s | 558 | tick (item arrives) (`sfx/tick.wav`) | 0.22 |
| 18.90s | 567 | tick (item arrives) (`sfx/tick.wav`) | 0.22 |
| 19.90s | 597 | UI tap (`sfx/tap.wav`) | 0.45 |
| 20.23s | 607 | short swish (`sfx/swish.wav`) | 0.11 |
| 22.40s | 672 | tick (item arrives) (`sfx/tick.wav`) | 0.22 |
| 22.67s | 680 | tick (item arrives) (`sfx/tick.wav`) | 0.22 |
| 22.93s | 688 | tick (item arrives) (`sfx/tick.wav`) | 0.22 |
| 24.67s | 740 | UI tap (`sfx/tap.wav`) | 0.45 |
| 24.87s | 746 | short swish (`sfx/swish.wav`) | 0.132 |
| 26.40s | 792 | whoosh (`sfx/whoosh.wav`) | 0.256 |
| 28.93s | 868 | whoosh (`sfx/whoosh.wav`) | 0.256 |
| 29.20s | 876 | tick (item arrives) (`sfx/tick.wav`) | 0.176 |
| 29.40s | 882 | tick (item arrives) (`sfx/tick.wav`) | 0.176 |
| 29.60s | 888 | tick (item arrives) (`sfx/tick.wav`) | 0.176 |
| 29.80s | 894 | tick (item arrives) (`sfx/tick.wav`) | 0.176 |
| 33.00s | 990 | switch click (`sfx/toggle.wav`) | 0.6 |
| 33.33s | 1000 | soft Bluetooth ping (`sfx/ping_soft.wav`) | 0.28 |
| 34.47s | 1034 | radar ping (`sfx/ping.wav`) | 0.42 |
| 34.93s | 1048 | node pop (`sfx/pop.wav`) | 0.38 |
| 35.17s | 1055 | node pop (`sfx/pop.wav`) | 0.38 |
| 35.40s | 1062 | node pop (`sfx/pop.wav`) | 0.342 |
| 35.60s | 1068 | radar ping (`sfx/ping.wav`) | 0.336 |
| 35.63s | 1069 | node pop (`sfx/pop.wav`) | 0.342 |
| 35.87s | 1076 | node pop (`sfx/pop.wav`) | 0.342 |
| 37.27s | 1118 | whoosh (`sfx/whoosh.wav`) | 0.256 |
| 38.47s | 1154 | UI tap (`sfx/tap.wav`) | 0.45 |
| 38.67s | 1160 | verified chime (`sfx/chime.wav`) | 0.5 |
| 40.13s | 1204 | whoosh (`sfx/whoosh.wav`) | 0.224 |
| 40.40s | 1212 | soft Bluetooth ping (`sfx/ping_soft.wav`) | 0.224 |
| 41.33s | 1240 | soft Bluetooth ping (`sfx/ping_soft.wav`) | 0.224 |
| 42.27s | 1268 | soft Bluetooth ping (`sfx/ping_soft.wav`) | 0.224 |
| 43.20s | 1296 | verified chime (`sfx/chime.wav`) | 0.5 |
| 43.80s | 1314 | whoosh (`sfx/whoosh.wav`) | 0.224 |
| 44.20s | 1326 | tick (item arrives) (`sfx/tick.wav`) | 0.22 |
| 45.33s | 1360 | whoosh (`sfx/whoosh.wav`) | 0.224 |
| 46.20s | 1386 | UI tap (`sfx/tap.wav`) | 0.45 |
| 46.67s | 1400 | UI tap (`sfx/tap.wav`) | 0.45 |
| 47.13s | 1414 | UI tap (`sfx/tap.wav`) | 0.45 |
| 47.93s | 1438 | UI tap (`sfx/tap.wav`) | 0.45 |
| 48.13s | 1444 | short swish (`sfx/swish.wav`) | 0.132 |
| 48.33s | 1450 | verified chime (`sfx/chime.wav`) | 0.5 |
| 50.00s | 1500 | short swish (`sfx/swish.wav`) | 0.22 |
| 51.20s | 1536 | short swish (`sfx/swish.wav`) | 0.22 |
| 52.67s | 1580 | short swish (`sfx/swish.wav`) | 0.22 |
| 54.13s | 1624 | short swish (`sfx/swish.wav`) | 0.22 |
| 55.60s | 1668 | short swish (`sfx/swish.wav`) | 0.22 |
| 56.53s | 1696 | long riser (`sfx/rise_long.wav`) | 0.46 |
| 58.00s | 1740 | soft hit (`sfx/impact_soft.wav`) | 0.5 |
| 61.33s | 1840 | whoosh (`sfx/whoosh.wav`) | 0.288 |
| 64.53s | 1936 | node pop (`sfx/pop.wav`) | 0.38 |
| 64.67s | 1940 | soft Bluetooth ping (`sfx/ping_soft.wav`) | 0.224 |
| 65.00s | 1950 | radar ping (`sfx/ping.wav`) | 0.336 |
| 66.20s | 1986 | tick (item arrives) (`sfx/tick.wav`) | 0.22 |
| 66.40s | 1992 | tick (item arrives) (`sfx/tick.wav`) | 0.22 |
| 66.60s | 1998 | tick (item arrives) (`sfx/tick.wav`) | 0.22 |
| 66.80s | 2004 | tick (item arrives) (`sfx/tick.wav`) | 0.22 |
| 67.00s | 2010 | tick (item arrives) (`sfx/tick.wav`) | 0.22 |
| 69.33s | 2080 | whoosh (`sfx/whoosh.wav`) | 0.288 |
| 70.60s | 2118 | logo hit (`sfx/impact.wav`) | 0.85 |

### Vertical cut (9:16)

| Time | Frame | Sound | Gain |
|---|---|---|---|
|  3.50s | 105 | star shimmer (`sfx/shimmer.wav`) | 0.32 |
|  5.17s | 155 | whoosh (`sfx/whoosh.wav`) | 0.256 |
|  6.60s | 198 | riser (`sfx/rise.wav`) | 0.42 |
|  7.50s | 225 | logo hit (`sfx/impact.wav`) | 0.85 |
|  9.57s | 287 | whoosh (`sfx/whoosh.wav`) | 0.32 |
| 11.27s | 338 | UI tap (`sfx/tap.wav`) | 0.45 |
| 11.67s | 350 | short swish (`sfx/swish.wav`) | 0.132 |
| 12.53s | 376 | UI tap (`sfx/tap.wav`) | 0.45 |
| 12.73s | 382 | soft chime (`sfx/chime_soft.wav`) | 0.35 |
| 13.93s | 418 | short swish (`sfx/swish.wav`) | 0.132 |
| 14.53s | 436 | tick (item arrives) (`sfx/tick.wav`) | 0.22 |
| 14.77s | 443 | tick (item arrives) (`sfx/tick.wav`) | 0.22 |
| 15.00s | 450 | tick (item arrives) (`sfx/tick.wav`) | 0.22 |
| 15.23s | 457 | tick (item arrives) (`sfx/tick.wav`) | 0.22 |
| 15.50s | 465 | tick (item arrives) (`sfx/tick.wav`) | 0.22 |
| 16.30s | 489 | UI tap (`sfx/tap.wav`) | 0.45 |
| 16.57s | 497 | short swish (`sfx/swish.wav`) | 0.11 |
| 18.80s | 564 | switch click (`sfx/toggle.wav`) | 0.6 |
| 19.07s | 572 | soft Bluetooth ping (`sfx/ping_soft.wav`) | 0.28 |
| 20.00s | 600 | radar ping (`sfx/ping.wav`) | 0.42 |
| 20.37s | 611 | node pop (`sfx/pop.wav`) | 0.38 |
| 20.57s | 617 | node pop (`sfx/pop.wav`) | 0.38 |
| 20.77s | 623 | node pop (`sfx/pop.wav`) | 0.342 |
| 20.93s | 628 | radar ping (`sfx/ping.wav`) | 0.336 |
| 20.97s | 629 | node pop (`sfx/pop.wav`) | 0.342 |
| 21.13s | 634 | node pop (`sfx/pop.wav`) | 0.342 |
| 22.27s | 668 | whoosh (`sfx/whoosh.wav`) | 0.256 |
| 23.27s | 698 | UI tap (`sfx/tap.wav`) | 0.45 |
| 23.40s | 702 | verified chime (`sfx/chime.wav`) | 0.5 |
| 24.60s | 738 | whoosh (`sfx/whoosh.wav`) | 0.224 |
| 24.83s | 745 | soft Bluetooth ping (`sfx/ping_soft.wav`) | 0.224 |
| 25.57s | 767 | soft Bluetooth ping (`sfx/ping_soft.wav`) | 0.224 |
| 26.30s | 789 | soft Bluetooth ping (`sfx/ping_soft.wav`) | 0.224 |
| 27.07s | 812 | verified chime (`sfx/chime.wav`) | 0.5 |
| 27.53s | 826 | whoosh (`sfx/whoosh.wav`) | 0.224 |
| 27.87s | 836 | tick (item arrives) (`sfx/tick.wav`) | 0.22 |
| 28.77s | 863 | whoosh (`sfx/whoosh.wav`) | 0.224 |
| 29.47s | 884 | UI tap (`sfx/tap.wav`) | 0.45 |
| 29.83s | 895 | UI tap (`sfx/tap.wav`) | 0.45 |
| 30.20s | 906 | UI tap (`sfx/tap.wav`) | 0.45 |
| 30.83s | 925 | UI tap (`sfx/tap.wav`) | 0.45 |
| 31.00s | 930 | short swish (`sfx/swish.wav`) | 0.132 |
| 31.17s | 935 | verified chime (`sfx/chime.wav`) | 0.5 |
| 32.00s | 960 | soft hit (`sfx/impact_soft.wav`) | 0.5 |
| 35.33s | 1060 | whoosh (`sfx/whoosh.wav`) | 0.288 |
| 38.53s | 1156 | node pop (`sfx/pop.wav`) | 0.38 |
| 38.67s | 1160 | soft Bluetooth ping (`sfx/ping_soft.wav`) | 0.224 |
| 39.00s | 1170 | radar ping (`sfx/ping.wav`) | 0.336 |
| 40.13s | 1204 | whoosh (`sfx/whoosh.wav`) | 0.256 |
| 40.67s | 1220 | star shimmer (`sfx/shimmer.wav`) | 0.256 |
| 41.27s | 1238 | logo hit (`sfx/impact.wav`) | 0.85 |

## Using your own track

Drop a royalty-free file at `public/music.mp3` and render with `--props='{"musicFile":"music.mp3"}'`.
Suggested feel: modern ambient electronic around 110 to 120 BPM, drop near 9s, pull back at 58s, resolve at 70s.
