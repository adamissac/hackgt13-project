# Judge demo script (about 3 minutes)

Use **demo mode** for the judges: sign-in screen → "Try the demo (no account needed)". It runs the whole
loop on one phone with simulated people (lib/demo). To start over: Profile → Demo settings → Restart the demo.
Live mode (real sign-in, Railway server, real Bluetooth on dev builds) uses the same screens.

1. **Open to Meet** (Home). Flip the big switch ON. Say: "Discovery is on; only compatible people can be suggested, never my exact location."
2. **Nearby tab.** The radar shows matches by rough distance (Bluetooth bands, not GPS). Maya is the big filled dot: 87% match, very close.
3. **Tap Maya.** "Why you should talk" (AI), the icebreaker (Copy / Another / Ask AI), topic strength bars, overlap by area. Say: "It answers *why should I talk to this person*."
4. **Want to meet.** Status says "We'll let you know if it's mutual." Nobody ever sees a no. A few seconds later: 🔔 "You and Maya both want to meet 🎉".
5. **Message.** Send "Want to meet by the sponsor tables?" Maya replies.
6. **Find Maya.** Share location → arrow + "nearby" → "very close". Say: "Location only unlocks after a mutual yes, only rough distance, deleted after."
   (No location permission? Tap "Demo: we met and talked (simulate Bluetooth)".)
7. **Conversation verified.** After you're close for a bit, Bluetooth verification fires → "How did it go?"
8. **Checklist.** Tick RAG + AI internships → "Yes, connect" → "You're connected with Maya Patel." Both had to say yes.
9. **Assistant tab.** Ask "Who here should I talk to about RAG?" then "What should I ask Maya?"
10. **Profile → Your connections / Connection graph.** Maya appears with how you met and what you talked about. No public counts anywhere.

The four things to land in the first minute: Open to Meet · AI finds compatible people nearby · mutual yes unlocks chat + find each other · verified conversation → both choose to connect.
