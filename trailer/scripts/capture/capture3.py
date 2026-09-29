import json, traceback
import capture as C
from shootlib import sync_playwright, start_server, BASE, FONT_CSS
C.MAN.update(json.load(open(f"{C.OUT}/manifest.json")))
shot, click = C.shot, C.click
VW, VH, OUT = C.VW, C.VH, C.OUT
def to_tabs(page):
    for _ in range(5):
        if page.get_by_text("Profile", exact=True).last.is_visible(): return True
        page.go_back(); page.wait_for_timeout(1400)
    return page.get_by_text("Profile", exact=True).last.is_visible()
def tab(page, name, wait=2600):
    page.get_by_text(name, exact=True).last.click(); page.wait_for_timeout(wait)
start_server()
with sync_playwright() as p:
    browser = p.chromium.launch(args=["--disable-gpu", "--font-render-hinting=none"])
    ctx = browser.new_context(viewport={"width": VW, "height": VH}, device_scale_factor=3)
    ctx.add_init_script("""const add=()=>{const s=document.createElement('style');s.textContent=%r;document.head.appendChild(s)}; if(document.head)add(); else document.addEventListener('DOMContentLoaded',add);""" % FONT_CSS)
    page = ctx.new_page()
    page.goto(BASE + "/sign-in", wait_until="networkidle", timeout=60000); page.wait_for_timeout(900)
    click(page, "Try the demo (no account needed)"); click(page, "Connect GitHub", wait=1500); click(page, "Continue", wait=2500)
    try:
        tab(page, "Feed"); shot(page, "feed", {"post": ("Working on lob-alpha", "card"), "hero": ("Stay in the", "text")}, tall=1150, wait=800)
        tab(page, "Constellation", 3000); shot(page, "graph", {"sky": ("YOUR CONSTELLATION", "card"), "hero": ("A little common ground.", "text")}, tall=1400, wait=1500)
        tab(page, "Profile")
        page.set_viewport_size({"width": VW, "height": 2300}); page.wait_for_timeout(1000)
        page.get_by_text("Review", exact=True).first.click(); page.wait_for_timeout(1500)
        page.set_viewport_size({"width": VW, "height": VH}); page.wait_for_timeout(300)
        shot(page, "profile_review", {"skills": ("Skills & interests", "text"), "technical": ("TECHNICAL", "text"), "career": ("CAREER", "text"), "sources": ("Sources", "text")}, tall=2300, wait=900)
        tab(page, "Home")
    except Exception: traceback.print_exc()
    try:
        page.get_by_label("Ask Constellation AI").first.click(); page.wait_for_timeout(1800)
        page.locator("textarea, input").last.fill("Who here works in quant finance?"); page.wait_for_timeout(300)
        page.get_by_text("Ask", exact=True).last.click(); page.wait_for_timeout(4000)
        shot(page, "assistant", {"q": ("Who here works in quant finance?", "text")}, wait=300)
        page.go_back(); page.wait_for_timeout(1500)
    except Exception: traceback.print_exc()
    try:
        to_tabs(page); tab(page, "Home")
        page.get_by_role("switch").first.click(); page.wait_for_timeout(2200)
        click(page, "Want to meet", wait=3000); click(page, "Find Maya", wait=2500)
        sim = page.get_by_text("Demo: we met and talked", exact=False)
        if sim.count(): sim.first.click(); page.wait_for_timeout(3500)
        for i in range(3): page.locator("[role=checkbox]").nth(i).click(); page.wait_for_timeout(300)
        click(page, "Yes, connect", wait=3500)
        print("tabs visible", to_tabs(page))
        tab(page, "Constellation", 2500)
        click(page, "My network", wait=3000)
        shot(page, "graph_network", {"sky": ("YOUR UNIVERSE", "card")}, tall=1400, wait=1500)
        tab(page, "Feed", 2500)
        shot(page, "feed2", {"post": ("Working on lob-alpha", "card")}, tall=1150, wait=800)
    except Exception: traceback.print_exc()
    json.dump(C.MAN, open(f"{OUT}/manifest.json", "w"), indent=1)
    browser.close()
print("DONE", sorted(C.MAN))
