# Constellation trailer brief

## What Constellation is
A networking app built at HackGT 13 around one rule: you can only connect with people you have actually talked to.
Most networking apps reward collecting strangers. Constellation rewards real conversations: it suggests who to meet,
helps you find them in the room, verifies the conversation happened in person, and only connects you if you both
privately say yes. Connection counts stay private.

## Features shown (all real in the repo)
1. Sign in, connect GitHub, upload a resume (onboarding).
2. AI-extracted skills and interests with evidence lines you can confirm or hide (Profile, Review mode).
3. Ranked matches with an AI ranked badge and match percentages (Home).
4. Match detail: "Why you should talk", icebreaker, shared topics, overlap by area.
5. Open to Meet switch ("Let people find you"), with Bluetooth distance bands: Very close, Nearby, Farther away.
6. Suggested meeting card, "Want to meet", mutual "You both want to meet".
7. In-person verification: Bluetooth encounter, QR code, GPS; then "What did you talk about?" and "Yes, connect".
8. Connected state with a private chat and an AI follow-up note.
9. Feed with AI briefs, suggested openers in chat, the Constellation AI assistant.
10. The Constellation graph (the app's atom view), and the organizer community map with missed-connection gaps.

## Brand
Light: background #F8F7F5, surface #FFFFFF, text #25272B, primary #1E3A8A, AI accent #475A8C, success #15803D.
Dark: background #0F1115, constellation sky #080D18, tint #4A6CD4, mark #8AA4EE.
Star facets: technical #59BFFF, career #E990EA, personal #62E4AD, academic #FFC568.
Type: Inter for everything, Space Mono (shipped with the app) for the tech beat.

## Screens featured
Captured from the Expo web build in demo mode (synthetic demo people only): sign-in, onboarding, profile review,
home (switch off, on, mutual), Maya's match page, verify (QR), checklist (unchecked and checked), connected,
follow-up note, feed, chat opener, assistant, Constellation tab.

## Rebuilt in code instead of screenshotted
- The Constellation atom (hero shot), rebuilt from `features/graph/Atom.tsx`, `atomLayout.ts`, `starStyle.ts`.
- The logo mark and wordmark, from `components/Brand.tsx`.
- The Bluetooth distance radar: the app shows nearby people on a map, so this is an explanatory graphic using the
  app's real band names, not a screen from the app.
- Bluetooth waves, signal graph and "Conversation verified" beat: explanatory graphics.
- The organizer community map, restyled from `dashboard/components/CommunityMap.tsx`. The gap label numbers
  ("2 of ~11 expected") follow the dashboard's format but are illustrative, not real event data.
