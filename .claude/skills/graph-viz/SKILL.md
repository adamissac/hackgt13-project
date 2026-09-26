---
name: graph-viz
description: "Build guide for the Connection Graph, organizer community map, personal dashboard, and feed insights in dashboard/, including react-force-graph settings, expand without resetting the layout, WebView auth, PNG export, and the privacy rules for each mode. Use for any work on dashboard pages, /graph data, charts, or anything visual the judges will see."
---

# Graph and dashboard build guide
Spec: MASTER_SPEC 3.11, 3.12, 6.13, and 10.

## Rendering
- `react-force-graph-2d` (canvas). In Next.js load it with `dynamic(() => import("react-force-graph-2d"), { ssr: false })` because it needs `window`.
- Forces from Section 10: link distance inversely proportional to weight, charge -120 for people and -60 for topics, collision radius = node radius + 4, and the self node pinned at the center (`fx`, `fy`).
- Draw nodes with `nodeCanvasObject`: size by score, a green ring for highlight or Open to Meet, label = first name plus top topic. Dashed links (`linkLineDash`) for suggested matches, solid for connections. Width by weight, color by facet.
- Use a colorblind-safe facet palette and never rely on color alone: the side panel repeats facets in text.
- Cap around 150 nodes. Beyond that, aggregate topics.

## Expand without reset
Keep node objects stable. Merge `/graph/expand` results into state by id with a functional update that keeps existing `x`, `y`, `vx`, `vy`, then reheat gently (`d3ReheatSimulation()` or an alpha around 0.3). Never rebuild the whole data object.

## Modes and privacy
- Matches: you, your allowed matches, and shared topic nodes. Expanding a topic reveals only other allowed people.
- My Network: you, your connections, and shared topics. Never an edge between two of your connections.
- Event Map (organizer): clusters without names, new connections as anonymous edges, and the gap table. Minimum group size 5. Poll the FastAPI endpoint every 5 to 10 seconds; organizers can't read `connections` directly.

## WebView embedding
- The app sends `{ "type": "auth", "token": "..." }` with `postMessage` after load and again when the token refreshes. Listen on both `window` and `document` (Android WebViews dispatch on `document`). Validate the shape and keep the token in memory.
- File downloads usually don't work inside a WebView. For "Export PNG", post the canvas `toDataURL()` result back to the app so it can share or save it.
- Deploy to Vercel (HTTPS) early so iOS loads the page.

## Timeline slider
Filter client-side from one fetch by `connected_at` (My Network) or event hour (Event Map). Don't refetch on every tick.
