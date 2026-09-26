# Scope

## Demo story (3 minutes)
1. Log in with LinkedIn, connect GitHub, upload resume.
2. See extracted interests with evidence; delete one wrong tag.
3. Check in to "HackGT 13"; see ranked matches with green highlights and "why you matched".
4. Two people talk, scan each other's QR, fill checklist; connection appears on both phones.
5. Big screen: community map, clusters labeled, new connection drawn live, biggest missed-connection gap highlighted.

## Must have (demo breaks without these)          Owner
- [ ] LinkedIn login (Supabase Auth)                Adam
- [ ] GitHub connect + ingestion                    Arjun
- [ ] Resume PDF upload + text extraction           Arjun
- [ ] Interest extraction (Claude) + review screen  Alan (API) / Adam (screen)
- [ ] V1 match ranking with explanations            Alan
- [ ] QR handshake + checklist + mutual connect     Akshar
- [ ] Community map dashboard                       Arjun

## Should have
- [ ] Facebook likes                                Arjun
- [ ] Conversation starters                         Alan
- [ ] Bluetooth radar                               Akshar
- [ ] Learned ranker + AUC comparison               Alan
- [ ] Encounter classifier recap                    Alan

## Nice to have
- [ ] Open-to-chat geofencing (mocked location)     Akshar
- [ ] Zone map                                      Akshar
- [ ] TikTok, photo hobbies, UWB arrow              anyone free

## Explicitly OUT
Instagram, background location tracking, precise indoor positioning, live location sharing, in-app messaging.

## Checkpoints (adjust to official deadline)
- Sat noon: every must-have works end to end, even if ugly. If not, nothing below starts.
- Sat 6pm: should-haves work or get cut.
- Sat midnight: feature freeze.
- Sun morning: polish, record backup demo video, rehearse pitch.

## Cut order if behind
TikTok, photos, UWB, zones, geofencing, learned ranker (keep V1), Bluetooth radar (keep QR).
