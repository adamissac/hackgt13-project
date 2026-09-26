---
name: demo-day
description: "Demo script, rehearsal checklist, backup video plan, and judge Q&A for the HackGT 13 pitch. Use for anything about the pitch, demo flow, slides, rehearsal, recording the backup video, demo data, or answering judges' questions."
---

# Demo day
Story (MASTER_SPEC 12.1, about 3 minutes):
1. Sign in with LinkedIn, connect GitHub, upload a resume, type what you're looking for.
2. The AI profile appears with evidence lines. Remove one wrong tag.
3. Check in to HackGT 13, turn on Open to Meet. "Do you want to meet Maya?" with shared topics and the overlap chart. Both tap Yes; chat opens with an AI icebreaker.
4. Connection Graph: you, your matches, topic nodes. Expand "reinforcement learning" and two more people appear.
5. Meet and talk. Verify (Bluetooth or QR), fill the checklist, both say yes. The connection appears with an AI follow-up draft.
6. A private invite QR connects a friend you already know.
7. Big screen: the organizer community map with labeled clusters, the new connection drawn live, and the biggest missed-connection gap highlighted.
8. Close: nobody can see anyone else's connection count.

## Before every run-through
- The event has 60 to 100 synthetic attendees plus the real team. Test connections between the two demo phones are cleared, and the second demo phone's profile shares rare topics with the first so the suggestion is compelling.
- Both demo phones charged, same build, Bluetooth on, Event Mode on, screen timeout off, notifications allowed.
- FastAPI reachable over venue Wi-Fi and over a phone hotspot. The dashboard URL loads on the big screen.
- Fallbacks ready: QR verification if Bluetooth is slow, the recorded video if the network dies.

## Backup video (Sunday morning)
Screen-record both phones plus the big screen for the whole story. Under 3 minutes, no dead air, captions on key moments.

## Judge Q&A, one line each
- Why IDF: sharing a rare interest predicts a good conversation; sharing "Python" with 180 people means nothing.
- Complementarity: we match what one person seeks with what the other offers, in both directions.
- Learned ranker: starts as a hand-tuned score and learns from verified conversations. Current numbers are on simulated outcomes, and we say so.
- Encounter classifier: Bluetooth measures proximity, not conversation. The known false positive is "same table, not talking", which is why QR verification and a minimum dwell time exist.
- Privacy: rotating Bluetooth IDs resolved only on the server, building-level presence, live location only after a mutual yes and only until you meet, no public counts, no stranger search, and a silent "no".
- LinkedIn: sign-in identity only. We never scrape. Profile data is typed by the user or comes from their resume.
