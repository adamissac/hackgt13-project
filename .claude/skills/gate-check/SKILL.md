---
name: gate-check
description: "Report team status against the current checkpoint in MASTER_SPEC Section 12.3 and the Section 14 definition-of-done checklist. Use when the user types /gate-check or asks whether the team is on track."
disable-model-invocation: true
context: fork
agent: Explore
background: false
---

Read `MASTER_SPEC.md` Sections 12 and 14, `PROGRESS.md`, and skim `mobile/`, `ml/`, `dashboard/`, and `supabase/`. Do not modify anything.

Output:
1. The current gate (check the date and time) and what it requires.
2. Every Must item from Section 12.2 marked ✅ works end to end, 🟡 partial, or ❌ missing, each with one line of evidence (a PROGRESS.md entry or a file path).
3. The Section 14 checklist with the same marks.
4. The top 3 risks to the next gate, and which cut from Section 12.4 to make first if behind.
Under 50 lines.
