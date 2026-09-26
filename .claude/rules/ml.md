---
paths:
  - "ml/**"
---
# ML service rules (FastAPI)
- A working reference implementation already exists in `ml/ml/` (read `ml/README.md`, run `python run_demo.py`). Build endpoints on top of it. Don't rewrite modules that work.
- Every endpoint except `/health` verifies the Supabase JWT. The service key, OAuth secrets, the Anthropic key, and signing keys stay server-side.
- Request, response, and error shapes match `docs/api.md` exactly (`{"error": "message"}` on errors). Change the contract only through `/contract-change`.
- Enforce scope on the server; never trust the client or the model. Quick profiles only for current matches or connections. Graph data without second-degree person edges. Chatbot tools limited to what the caller may see.
- Claude API: model IDs live in `ml/ml/config.py`. Run `/claude-api` before writing SDK code. Validate structured output with pydantic, retry once, then fail loudly. Cache long static system prompts. Send the minimum personal data.
- Every metric in a report, log, or pitch says whether it came from synthetic or real data.
- pytest covers privacy invariants and scoring math first.
