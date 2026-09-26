---
paths:
  - "dashboard/**"
---
# Dashboard rules (Next.js)
- Connection Graph, personal dashboard, feed insights, and the organizer map live here. The mobile app embeds pages in a WebView.
- Embedded pages get auth by `postMessage` only, never in the URL. Keep the token in memory. Check message shape before trusting it.
- Privacy is part of rendering: show only people the API returned, never an edge between two of the viewer's connections, organizer views anonymized with groups of at least 5.
- Pages work at 390x844 with touch and pinch zoom and stay smooth with about 150 nodes.
- Deploy over HTTPS (Vercel) early. iOS WebViews block plain http pages unless the app adds exceptions.
- After a visual change, have `browser-tester` load the page and report console errors and what it sees.
