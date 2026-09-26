"""Synthetic data. You have ZERO real data at 7pm Friday, so bootstrap with this.

1. make_population()      procedural fake attendees in the exact raw format extraction produces
2. llm_population()       optional: Claude writes more realistic fake profiles (same format)
3. simulate_meetings()    who met whom + outcomes, from a HIDDEN ground-truth model
4. simulate_ble_sessions() RSSI time series for the encounter classifier

Be upfront with judges: the ranker learns this simulator's preferences. The point is proving
the training loop works end to end; real handshake data replaces it after launch.
"""
import json
import math
import numpy as np

ARCHETYPES = {
    "ml_research": dict(technical=["machine learning", "pytorch", "reinforcement learning", "computer vision",
                                   "natural language processing", "transformers", "python"],
                        career=["ai research", "phd programs", "ml engineering"],
                        academic=["computer science", "linear algebra", "probability"]),
    "quant": dict(technical=["time series analysis", "statistics", "c++", "python", "stochastic calculus",
                             "backtesting"],
                  career=["quantitative research", "trading", "hedge funds"],
                  academic=["mathematics", "statistics", "economics"]),
    "fullstack": dict(technical=["react", "typescript", "node.js", "postgresql", "aws", "python"],
                      career=["startups", "product engineering", "software engineering"],
                      academic=["computer science"]),
    "robotics": dict(technical=["ros", "embedded systems", "c++", "control systems", "computer vision"],
                     career=["autonomous vehicles", "hardware startups"],
                     academic=["mechanical engineering", "electrical engineering"]),
    "bio": dict(technical=["bioinformatics", "genomics", "time series analysis", "python", "r"],
                career=["biotech", "computational biology research"],
                academic=["biology", "biomedical engineering"]),
    "design": dict(technical=["figma", "ui design", "user research", "react"],
                   career=["product design", "ux research"],
                   academic=["industrial design", "psychology"]),
    "climate": dict(technical=["energy systems", "data analysis", "gis", "python"],
                    career=["climate tech", "energy policy"],
                    academic=["environmental engineering"]),
    "security": dict(technical=["cybersecurity", "reverse engineering", "networking", "rust"],
                     career=["security engineering", "defense tech"],
                     academic=["computer science"]),
}
PERSONAL = ["rock climbing", "soccer", "basketball", "chess", "film photography", "guitar", "cooking",
            "hiking", "anime", "running", "piano", "poker", "volunteering", "video games",
            "formula 1", "atlanta united", "jazz", "reading sci-fi", "powerlifting", "salsa dancing"]
FIRST = ["Aarav", "Maya", "Jordan", "Priya", "Leo", "Sofia", "Ethan", "Zara", "Noah", "Ava", "Kai",
         "Isha", "Mateo", "Chloe", "Arjun", "Nia", "Owen", "Lina", "Ravi", "Emma", "Diego", "Hana"]


def _pick(rng, pool, lo, hi):
    k = min(len(pool), int(rng.integers(lo, hi + 1)))
    return list(rng.choice(pool, size=k, replace=False))


def make_population(n=200, recruiter_frac=0.15, secondary_frac=0.3, seed=7):
    rng = np.random.default_rng(seed)
    keys = list(ARCHETYPES)
    people = []
    for i in range(n):
        prim = keys[rng.integers(len(keys))]
        sec = keys[rng.integers(len(keys))] if rng.random() < secondary_frac else None
        role = "recruiter" if rng.random() < recruiter_frac else "student"
        A = ARCHETYPES[prim]
        raw = []

        def add(names, facet, source, s_lo, s_hi):
            for nm in names:
                raw.append({"name": nm, "facet": facet, "source": source,
                            "strength": float(rng.uniform(s_lo, s_hi)),
                            "months_ago": float(rng.exponential(6)),
                            "depth": float(rng.uniform(0.5, 1.5)),
                            "evidence": f"{source}: {nm}"})
        add(_pick(rng, A["technical"], 3, 5), "technical", "github", 0.5, 1.0)
        add(_pick(rng, A["career"], 1, 2), "career", "resume", 0.6, 1.0)
        add(_pick(rng, A["academic"], 1, 1), "academic", "resume", 0.7, 1.0)
        add(_pick(rng, PERSONAL, 2, 4), "personal", "facebook", 0.4, 0.9)
        if sec and sec != prim:
            S = ARCHETYPES[sec]
            add(_pick(rng, S["technical"], 1, 2), "technical", "github", 0.4, 0.8)
            add(_pick(rng, S["career"], 1, 1), "career", "manual", 0.4, 0.8)
        career = [r["name"] for r in raw if r["facet"] == "career"]
        tech = [r["name"] for r in raw if r["facet"] == "technical"]
        if role == "student":
            seeking = f"internship in {career[0]}; collaborators on {tech[0]} projects"
            offering = f"projects in {', '.join(tech[:3])}"
        else:
            seeking = f"students skilled in {', '.join(tech[:2])} for {career[0]} roles"
            offering = f"hiring for {career[0]} internships and new grad roles"
        people.append({
            "id": f"u{i:03d}", "name": f"{FIRST[i % len(FIRST)]} {chr(65 + i % 26)}.",
            "role": role, "archetype": prim, "secondary": sec,
            "raw_interests": raw, "seeking": seeking, "offering": offering,
            "summary": {"technical": f"Works on {', '.join(tech[:3])}.", "career": f"Interested in {career[0]}.",
                        "personal": "", "academic": ""},
        })
    return people


LLM_GEN_SYSTEM = """Generate realistic but FICTIONAL Georgia Tech attendee profiles for testing a
networking app. Output ONLY a JSON object {"people": [...]} where each person has:
id, name, role ("student" or "recruiter"), seeking, offering,
summary {technical, career, personal, academic} (1 sentence each),
raw_interests: [{name, facet (technical|career|personal|academic), source (github|resume|facebook|manual),
strength 0-1, months_ago, depth 0.5-1.5, evidence}] with 8-14 items.
Make people diverse in majors and goals; include some unusual cross-disciplinary combos."""


def llm_population(n=40, batch=10):
    from .llm import _call, _json
    from .config import LLM_SMART
    out = []
    for b in range(0, n, batch):
        data = _json(_call(LLM_SMART, LLM_GEN_SYSTEM, f"Generate {batch} people. ids start at llm{b:03d}.",
                           max_tokens=8000))
        out.extend(data["people"])
    return out


# ------------------------------------------------------------------ hidden ground truth
def _latent_affinity(a, b, df, N):
    """What ACTUALLY makes two people click in simulation-land. Deliberately NOT equal to V1 weights,
    so the learned ranker has something real to discover."""
    na = {r["name"] for r in a["raw_interests"]}
    nb = {r["name"] for r in b["raw_interests"]}
    shared = na & nb
    rare = sum(math.log(N / df[x]) for x in shared)
    pa = {r["name"] for r in a["raw_interests"] if r["facet"] == "personal"}
    pb = {r["name"] for r in b["raw_interests"] if r["facet"] == "personal"}
    ca = {r["name"] for r in a["raw_interests"] if r["facet"] == "career"}
    cb = {r["name"] for r in b["raw_interests"] if r["facet"] == "career"}
    comp = float(bool(ca & cb) and {a["role"], b["role"]} == {"student", "recruiter"})
    cross = float(a["archetype"] != b["archetype"] and bool(shared - pa - pb))
    return -5.0 + 0.35 * rare + 0.9 * len(pa & pb) + 2.2 * comp + 0.8 * cross


def simulate_meetings(people, rank_fn, meets_per_person=10, seed=11):
    """Each person meets mostly people the app suggested (top of rank_fn) plus a few randoms.

    Returns interaction rows: {viewer, other, rank, y (mutual connect), duration_min, rel}.
    """
    rng = np.random.default_rng(seed)
    N = len(people)
    df = {}
    for p in people:
        for r in {r["name"] for r in p["raw_interests"]}:
            df[r] = df.get(r, 0) + 1
    by_id = {p["id"]: p for p in people}
    rows, seen = [], set()
    for p in people:
        ranked = rank_fn(p)
        top = [r["id"] for r in ranked[:15]]
        rand = [r["id"] for r in rng.choice(ranked, size=min(5, len(ranked)), replace=False)]
        pool = list(dict.fromkeys(top + rand))
        met = list(rng.choice(pool, size=min(meets_per_person, len(pool)), replace=False))
        rank_of = {r["id"]: r["rank"] for r in ranked}
        for oid in met:
            key = tuple(sorted((p["id"], oid)))
            if key in seen:
                continue
            seen.add(key)
            logit = _latent_affinity(p, by_id[oid], df, N) + rng.normal(0, 0.7)
            prob = 1 / (1 + math.exp(-logit))
            y = int(rng.random() < prob)
            duration = float(np.clip(rng.lognormal(math.log(4 + 8 * prob), 0.5), 0.5, 45))
            rel = 2 if y else (1 if duration > 8 else 0)
            rows.append({"viewer": p["id"], "other": oid, "rank": rank_of.get(oid, 99),
                         "y": y, "duration_min": duration, "rel": rel, "p_true": prob})
    return rows


# ------------------------------------------------------------------ BLE sessions
CLASSES = {  # label, duration range (s), rssi mean, rssi std, stationary prob, is_conversation
    "conversation": ((120, 1200), -58, 4.0, 0.85, 1),
    "in_line":      ((90, 600), -62, 5.0, 0.55, 0),
    "walk_past":    ((10, 90), -70, 7.0, 0.15, 0),
    "across_room":  ((300, 1800), -78, 5.0, 0.8, 0),
    "same_table_not_talking": ((300, 1500), -60, 4.0, 0.9, 0),  # the hard negative
}


def simulate_ble_sessions(n=1500, seed=3):
    rng = np.random.default_rng(seed)
    sessions = []
    names = list(CLASSES)
    probs = [0.35, 0.2, 0.2, 0.15, 0.10]
    for k in range(n):
        c = names[rng.choice(len(names), p=probs)]
        (dlo, dhi), mu, sd, stat_p, label = CLASSES[c]
        dur = int(rng.integers(dlo, dhi))
        t = np.arange(dur)
        device_offset = rng.normal(0, 4)          # phone models differ by several dB
        rssi = mu + device_offset + sd * rng.standard_normal(dur)
        if c == "walk_past":   # V shape: approach then leave
            rssi = rssi + 12 * (np.abs(t - dur / 2) / (dur / 2)) - 6
        if c == "conversation":  # people shift, face each other, occasional body block
            rssi = rssi - 8 * (rng.random(dur) < 0.05)
        keep = rng.random(dur) > 0.25              # 25% of scans dropped, like real BLE
        # fraction of time each phone was still (accelerometer); drawn per session so it is noisy
        stat_a = float(np.clip(rng.normal(stat_p, 0.15), 0, 1))
        stat_b = float(np.clip(rng.normal(stat_p, 0.15), 0, 1))
        sessions.append({"id": k, "cls": c, "label": label,
                         "t": t[keep].tolist(), "rssi": rssi[keep].round(1).tolist(),
                         "stationary_a": stat_a, "stationary_b": stat_b,
                         "same_zone": int(c in ("conversation", "in_line", "same_table_not_talking")
                                          or rng.random() < 0.3)})
    return sessions


def save(obj, path):
    def default(o):
        if isinstance(o, np.ndarray):
            return o.tolist()
        if isinstance(o, (np.floating, np.integer)):
            return o.item()
        raise TypeError(type(o))
    with open(path, "w") as f:
        json.dump(obj, f, default=default)
