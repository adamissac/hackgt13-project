"""Synthetic HackGT 13 attendees modeled on real MLH winning projects (AR3).

Each winning project from `hackathon_winners.WINNERS` becomes a "team" of 2-3 fictional students whose
interests come from what that team actually built (tech stack + topics + career direction), plus a few
cross-disciplinary people and sponsor-style recruiters. Names are generated and fictional; nothing
identifies a real person. Output = raw interests in the same shape the extraction pipeline stores
(name, facet, strength, evidence), so they go through app.profile_store like real users.

    from ml.hackathon_population import make_population
    people = make_population(n=80, seed=13)
"""
import random

from .hackathon_winners import EVENT, WINNERS

FIRST = ["Aarav", "Maya", "Jordan", "Priya", "Leo", "Sofia", "Ethan", "Zara", "Noah", "Ava", "Kai", "Isha",
         "Mateo", "Chloe", "Nia", "Owen", "Lina", "Ravi", "Emma", "Diego", "Hana", "Omar", "Grace", "Tariq",
         "Mei", "Lucas", "Amara", "Jonah", "Sana", "Theo", "Yara", "Caleb", "Ines", "Dev", "Rosa", "Kofi",
         "Elena", "Sam", "Aisha", "Felix", "Nora", "Ibrahim", "June", "Marcus", "Tara", "Andre", "Lea", "Rohan"]
MAJORS = ["computer science", "computer engineering", "electrical engineering", "mechanical engineering",
          "industrial design", "biomedical engineering", "mathematics", "business administration",
          "cognitive science", "materials science"]
HOBBIES = ["rock climbing", "film photography", "chess", "soccer", "basketball", "guitar", "cooking", "hiking",
           "running", "piano", "video games", "formula 1", "atlanta united", "salsa dancing", "reading sci-fi",
           "powerlifting", "poker", "anime", "volunteering", "jazz"]

# topics that describe a field/industry go in the career facet; the rest are technical
CAREER_TOPICS = {"healthcare", "fintech", "sports analytics", "sustainability", "edtech", "marketplaces",
                 "health policy", "financial literacy", "sales tech", "consumer apps", "quantitative finance",
                 "trading", "mobility", "onboarding", "photography", "productivity"}
PERSONAL_TOPICS = {"photography"}

# sponsor-style recruiters: the kinds of teams that judged HackGT 12 tracks (no company names)
RECRUITERS = [
    ("fintech", ["fintech", "fraud detection", "financial literacy"], ["python", "typescript", "aws"]),
    ("sports analytics", ["sports analytics", "real-time systems", "computer vision"], ["python", "react native"]),
    ("health tech", ["healthcare", "ai agents", "rag"], ["python", "postgresql", "react"]),
    ("data platforms", ["data engineering", "semantic search", "rag"], ["snowflake", "python", "sql"]),
    ("developer tools", ["developer tools", "ai agents", "cloud infrastructure"], ["typescript", "next.js"]),
    ("xr and hardware", ["virtual reality", "embedded systems", "hardware"], ["unity", "c++", "esp32"]),
]

# the team's own demo story (MASTER_SPEC 12.1): a visible reinforcement-learning / quant crowd
RL_CROWD = [
    (["reinforcement learning", "pytorch", "reward shaping", "multi-agent systems"], ["quantitative research", "ai research"]),
    (["reinforcement learning", "time series analysis", "backtesting"], ["quantitative research", "trading"]),
    (["reinforcement learning", "robot learning", "control systems"], ["robotics", "ai research"]),
    (["offline rl", "reinforcement learning", "transformers"], ["ai research", "phd programs"]),
    (["game theory", "multi-agent systems", "reinforcement learning"], ["quantitative research"]),
]


def _facet(topic):
    if topic in PERSONAL_TOPICS:
        return "personal"
    return "career" if topic in CAREER_TOPICS else "technical"


def _name(rng, used):
    while True:
        n = f"{rng.choice(FIRST)} {chr(65 + rng.randrange(26))}."
        if n not in used:
            used.add(n)
            return n


def _person(rng, used, role, technical, career, topics, evidence_of, academic=None, hobbies=None, team=None):
    raw = []

    def add(name, facet, lo, hi, evidence):
        if any(r["name"] == name for r in raw):
            return
        raw.append({"name": name, "facet": facet, "strength": round(rng.uniform(lo, hi), 2), "evidence": evidence})

    for t in technical:
        add(t, "technical", 0.55, 0.95, evidence_of(t))
    for t in topics:
        add(t, _facet(t), 0.6, 0.95, evidence_of(t))
    for c in career:
        add(c, "career", 0.6, 0.9, f"Interested in {c} roles")
    if academic:
        add(academic, "academic", 0.7, 0.9, f"Studies {academic}")
    for h in hobbies or rng.sample(HOBBIES, rng.randint(2, 3)):
        add(h, "personal", 0.4, 0.85, f"Into {h}")
    tech = [r["name"] for r in raw if r["facet"] == "technical"]
    car = [r["name"] for r in raw if r["facet"] == "career"]
    if role == "recruiter":
        seeking = f"students strong in {', '.join(tech[:2])} for {car[0] if car else 'engineering'} roles"
        offering = f"internships and new grad roles in {car[0] if car else 'engineering'}"
    else:
        seeking = f"teammates and internships in {car[0] if car else tech[0]}"
        offering = f"hackathon experience with {', '.join(tech[:3])}"
    return {"name": _name(rng, used), "role": role, "team": team, "raw_interests": raw,
            "seeking": seeking, "offering": offering,
            "summary": {"technical": f"Builds with {', '.join(tech[:3])}.",
                        "career": f"Looking at {car[0]}." if car else "", "personal": "", "academic": ""}}


def make_population(n=80, seed=13, open_to_meet_frac=0.5):
    rng = random.Random(seed)
    used: set[str] = set()
    people = []

    # 1. teams modeled on each winning project
    for w in WINNERS:
        size = rng.choice([2, 3, 3])
        for _ in range(size):
            tech = rng.sample(w["tech"], min(len(w["tech"]), rng.randint(3, 5)))
            ev = (lambda w: lambda t: f"Built a project like {w['name']} ({w['tagline']}, {EVENT} winner) using {t}")(w)
            p = _person(rng, used, "student", tech, w["career"], w["topics"], ev, academic=rng.choice(MAJORS), team=w["name"])
            # 25%: a cross-disciplinary second interest from another winner
            if rng.random() < 0.25:
                other = rng.choice(WINNERS)
                for t in other["topics"][:1]:
                    p["raw_interests"].append({"name": t, "facet": _facet(t), "strength": round(rng.uniform(0.4, 0.7), 2),
                                               "evidence": f"Also exploring {t}"})
            people.append(p)

    # 2. the reinforcement-learning / quant crowd for the demo story
    for tech, career in RL_CROWD:
        people.append(_person(rng, used, "student", tech, career, [], lambda t: f"Built an RL project using {t}",
                              academic=rng.choice(["computer science", "mathematics"]), team="rl-crowd"))

    # 3. sponsor-style recruiters
    for domain, topics, tech in RECRUITERS:
        for _ in range(2):
            people.append(_person(rng, used, "recruiter", tech, [domain], topics,
                                  lambda t, d=domain: f"Hires for {d} teams working on {t}", team=f"recruiter:{domain}"))

    # always keep the demo's RL crowd; trim the rest to n
    rl = [p for p in people if p["team"] == "rl-crowd"]
    rest = [p for p in people if p["team"] != "rl-crowd"]
    rng.shuffle(rest)
    people = rl + rest[: max(0, n - len(rl))]
    rng.shuffle(people)
    for i, p in enumerate(people):
        p["key"] = f"synth-{i:03d}"
        p["open_to_meet"] = rng.random() < open_to_meet_frac or p["team"] == "rl-crowd"
    return people


if __name__ == "__main__":
    from collections import Counter
    ppl = make_population()
    print(len(ppl), "people", dict(Counter(p["role"] for p in ppl)), "open to meet:", sum(p["open_to_meet"] for p in ppl))
    top = Counter(i["name"] for p in ppl for i in p["raw_interests"] if i["facet"] != "personal")
    print("most common interests:", top.most_common(12))
    print("example:", ppl[0]["name"], ppl[0]["team"], [i["name"] for i in ppl[0]["raw_interests"]][:8])
