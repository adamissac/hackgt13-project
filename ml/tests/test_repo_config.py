"""CI guard for the team's Claude Code setup (AGENTS.md "Skills and plugins"): one committed source of truth for
plugins, the same for every owner, checked at every session start, and documented. No network, no DB."""
import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SETTINGS = json.loads((REPO / ".claude/settings.json").read_text())


def enabled():
    return [k for k, v in SETTINGS.get("enabledPlugins", {}).items() if v]


def test_plugins_declared_once_with_their_marketplaces():
    plugins = enabled()
    assert plugins, "team plugins must be declared in .claude/settings.json enabledPlugins"
    markets = SETTINGS.get("extraKnownMarketplaces", {})
    for pid in plugins:
        name, _, market = pid.partition("@")
        assert name and market, f"{pid}: use plugin@marketplace"
        assert market in markets, f"{pid}: marketplace '{market}' must be declared in extraKnownMarketplaces"
        assert markets[market].get("source", {}).get("source") in ("github", "git", "url"), f"{market}: bad source"


def test_setup_script_reads_the_committed_list_for_everyone():
    script = (REPO / "scripts/claude-setup.sh").read_text()
    assert "enabledPlugins" in script and "extraKnownMarketplaces" in script
    assert not re.search(r"^\s*(adam|alan|arjun|akshar)\)\s*EXTRA=", script, flags=re.M), \
        "no per-owner plugin lists: every owner gets every team plugin"


def test_every_session_checks_for_missing_plugins_and_lists_skills():
    hook = (REPO / ".claude/hooks/session_context.py").read_text()
    assert "def team_plugins" in hook and "installed_plugins.json" in hook and "plugin_lines(root)" in hook
    assert any(h.get("command", "").endswith('session_context.py"')
               for group in SETTINGS["hooks"]["SessionStart"] for h in group["hooks"])


def test_skill_use_is_permitted_and_documented():
    assert "Skill" in SETTINGS["permissions"]["allow"]
    agents = (REPO / "AGENTS.md").read_text()
    assert "## Skills and plugins" in agents
    for pid in enabled():
        assert pid.split("@")[0] in agents, f"AGENTS.md must name team plugin {pid}"


def test_every_project_skill_has_name_and_description():
    skills = sorted((REPO / ".claude/skills").glob("*/SKILL.md"))
    assert skills
    for path in skills:
        head = path.read_text().split("---")
        assert len(head) >= 3, f"{path}: missing frontmatter"
        meta = head[1]
        assert re.search(r"^name:\s*\S", meta, flags=re.M), f"{path}: frontmatter needs name"
        assert re.search(r"^description:\s*\S", meta, flags=re.M), f"{path}: frontmatter needs description"
