"""Skill taxonomy for the profile builder (docs/ONBOARDING.md). Pure: no DB, no network.

- normalize_skill("JS") -> "javascript": cheap alias pass BEFORE embedding canonicalization
  (profile_store.canonicalize merges near-duplicates by cosine + an LLM tie-break).
- frameworks_from_manifest(path, text): frameworks/libraries named in package.json, requirements.txt,
  pyproject.toml, Cargo.toml, go.mod, Gemfile, pom.xml, build.gradle.
- domains_for(skills): coarse domains ("ml", "backend", ...) from normalized skill names.
"""
import json
import re

ALIASES = {
    "js": "javascript", "ecmascript": "javascript", "es6": "javascript", "node": "node.js", "nodejs": "node.js",
    "ts": "typescript", "py": "python", "python3": "python", "golang": "go", "c#": "csharp", "c sharp": "csharp",
    "cpp": "c++", "c plus plus": "c++", "k8s": "kubernetes", "postgres": "postgresql", "psql": "postgresql",
    "mongo": "mongodb", "react.js": "react", "reactjs": "react", "react native": "react native",
    "next": "next.js", "nextjs": "next.js", "vue.js": "vue", "vuejs": "vue", "tf": "tensorflow",
    "sklearn": "scikit-learn", "scikit learn": "scikit-learn", "torch": "pytorch", "ml": "machine learning",
    "ai": "artificial intelligence", "llm": "large language models", "llms": "large language models",
    "rag": "retrieval-augmented generation", "nlp": "natural language processing", "cv": "computer vision",
    "aws": "amazon web services", "gcp": "google cloud", "tailwind": "tailwind css", "tailwindcss": "tailwind css",
    "html5": "html", "css3": "css", "rest": "rest apis", "restful": "rest apis", "gql": "graphql",
    "rust-lang": "rust", "objective c": "objective-c", "shell": "bash", "sh": "bash",
}

# dependency name (lowercase) -> canonical framework/library
DEPENDENCIES = {
    # JS / TS
    "react": "react", "react-native": "react native", "expo": "expo", "next": "next.js", "vue": "vue",
    "nuxt": "nuxt", "svelte": "svelte", "@angular/core": "angular", "express": "express", "fastify": "fastify",
    "@nestjs/core": "nestjs", "tailwindcss": "tailwind css", "three": "three.js", "d3": "d3",
    "graphql": "graphql", "@apollo/client": "graphql", "prisma": "prisma", "@supabase/supabase-js": "supabase",
    "firebase": "firebase", "socket.io": "websockets", "electron": "electron", "jest": "jest",
    "typescript": "typescript", "openai": "llm apis", "@anthropic-ai/sdk": "llm apis", "langchain": "langchain",
    # Python
    "django": "django", "flask": "flask", "fastapi": "fastapi", "torch": "pytorch", "pytorch": "pytorch",
    "tensorflow": "tensorflow", "keras": "keras", "scikit-learn": "scikit-learn", "sklearn": "scikit-learn",
    "pandas": "pandas", "numpy": "numpy", "transformers": "hugging face transformers",
    "sentence-transformers": "embeddings", "langchain-core": "langchain", "llama-index": "llamaindex",
    "anthropic": "llm apis", "opencv-python": "opencv", "matplotlib": "data visualization",
    "plotly": "data visualization", "streamlit": "streamlit", "sqlalchemy": "sqlalchemy", "pydantic": "pydantic",
    "celery": "celery", "pytest": "pytest", "jax": "jax", "lightgbm": "lightgbm", "xgboost": "xgboost",
    "gymnasium": "reinforcement learning", "gym": "reinforcement learning", "stable-baselines3": "reinforcement learning",
    "faiss-cpu": "vector search", "pgvector": "vector search", "chromadb": "vector search", "pinecone-client": "vector search",
    # Rust / Go / others
    "tokio": "tokio", "actix-web": "actix", "axum": "axum", "serde": "serde", "bevy": "bevy",
    "github.com/gin-gonic/gin": "gin", "github.com/gorilla/mux": "gorilla", "google.golang.org/grpc": "grpc",
    "rails": "ruby on rails", "spring-boot-starter-web": "spring boot",
}

MANIFESTS = ("package.json", "requirements.txt", "pyproject.toml", "Cargo.toml", "go.mod", "Gemfile", "pom.xml", "build.gradle")

DOMAIN_RULES = {
    "ml": {"machine learning", "pytorch", "tensorflow", "keras", "scikit-learn", "jax", "deep learning",
           "reinforcement learning", "computer vision", "natural language processing", "hugging face transformers",
           "lightgbm", "xgboost", "embeddings", "large language models", "retrieval-augmented generation",
           "llm apis", "langchain", "llamaindex", "vector search", "artificial intelligence", "opencv"},
    "backend": {"fastapi", "django", "flask", "express", "fastify", "nestjs", "node.js", "go", "gin", "grpc",
                "postgresql", "sqlalchemy", "rest apis", "graphql", "actix", "axum", "spring boot", "ruby on rails",
                "celery", "supabase", "prisma", "redis"},
    "frontend": {"react", "vue", "svelte", "angular", "next.js", "nuxt", "tailwind css", "html", "css", "d3", "three.js"},
    "mobile": {"react native", "expo", "swift", "kotlin", "flutter", "objective-c"},
    "data": {"pandas", "numpy", "sql", "data visualization", "streamlit", "statistics", "data analysis"},
    "systems": {"rust", "c", "c++", "tokio", "operating systems", "embedded systems"},
    "devops": {"docker", "kubernetes", "amazon web services", "google cloud", "terraform", "ci/cd"},
}


def normalize_skill(name: str) -> str:
    key = " ".join(str(name).strip().lower().split())
    key = key.strip(" .,;:")
    return ALIASES.get(key, key)


def _dep_names_requirements(text: str) -> list[str]:
    out = []
    for line in text.splitlines():
        line = line.split("#", 1)[0].strip()
        if not line or line.startswith(("-", "git+", "http")):
            continue
        m = re.match(r"([A-Za-z0-9_.\-\[\]]+)", line)
        if m:
            out.append(re.sub(r"\[.*\]", "", m.group(1)))
    return out


def _dep_names_pyproject(text: str) -> list[str]:
    out = []
    # PEP 621 dependencies = ["x>=1", ...] and poetry [tool.poetry.dependencies] name = ...
    for block in re.findall(r"dependencies\s*=\s*\[(.*?)\]", text, flags=re.S):
        out += re.findall(r"[\"']([A-Za-z0-9_.\-]+)", block)
    poetry = re.search(r"\[tool\.poetry\.dependencies\](.*?)(\n\[|\Z)", text, flags=re.S)
    if poetry:
        out += re.findall(r"^\s*([A-Za-z0-9_.\-]+)\s*=", poetry.group(1), flags=re.M)
    return out


def _dep_names_cargo(text: str) -> list[str]:
    out = []
    for block in re.findall(r"\[(?:dev-)?dependencies\](.*?)(?=\n\[|\Z)", text, flags=re.S):
        out += re.findall(r"^\s*([A-Za-z0-9_\-]+)\s*=", block, flags=re.M)
    return out


def _dep_names_gomod(text: str) -> list[str]:
    return re.findall(r"^\s*(?:require\s+)?([a-z0-9.\-]+\.[a-z]+/[^\s]+)\s+v[0-9]", text, flags=re.M)


def dependency_names(path: str, text: str) -> list[str]:
    base = path.rsplit("/", 1)[-1]
    try:
        if base == "package.json":
            data = json.loads(text)
            return [*(data.get("dependencies") or {}), *(data.get("devDependencies") or {})]
        if base == "requirements.txt":
            return _dep_names_requirements(text)
        if base == "pyproject.toml":
            return _dep_names_pyproject(text)
        if base == "Cargo.toml":
            return _dep_names_cargo(text)
        if base == "go.mod":
            return _dep_names_gomod(text)
        if base == "Gemfile":
            return re.findall(r"^\s*gem\s+[\"']([^\"']+)", text, flags=re.M)
        if base in ("pom.xml", "build.gradle"):
            return re.findall(r"(spring-boot-starter-web)", text)
    except (ValueError, AttributeError):
        return []
    return []


def frameworks_from_manifest(path: str, text: str) -> list[str]:
    """Known frameworks/libraries named in one manifest, normalized, de-duplicated, in first-seen order."""
    seen, out = set(), []
    for dep in dependency_names(path, text):
        fw = DEPENDENCIES.get(dep.strip().lower())
        if fw and fw not in seen:
            seen.add(fw)
            out.append(fw)
    return out


def domains_for(skill_names) -> list[str]:
    """Domains with at least one matching skill, strongest (most matches) first."""
    names = {normalize_skill(s) for s in skill_names}
    scored = [(len(names & rule), d) for d, rule in DOMAIN_RULES.items()]
    return [d for n, d in sorted(scored, key=lambda t: (-t[0], t[1])) if n > 0]
