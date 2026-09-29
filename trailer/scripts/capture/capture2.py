import json, os, traceback
import capture as C
from shootlib import sync_playwright, start_server, BASE, FONT_CSS
C.MAN.update(json.load(open(f"{C.OUT}/manifest.json")))
shot, click, box = C.shot, C.click, C.box
VW, VH, OUT = C.VW, C.VH, C.OUT
start_server()
with sync_playwright() as p:
    browser = p.chromium.launch(args=["--disable-gpu", "--font-render-hinting=none"])
    ctx = browser.new_context(viewport={"width": VW, "height": VH}, device_scale_factor=3)
    ctx.add_init_script("""const add=()=>{const s=document.createElement('style');s.textContent=%r;document.head.appendChild(s)}; if(document.head)add(); else document.addEventListener('DOMContentLoaded',add);""" % FONT_CSS)
    page = ctx.new_page()
    page.goto(BASE + "/sign-in", wait_until="networkidle", timeout=60000); page.wait_for_timeout(900)
    click(page, "Try the demo (no account needed)"); click(page, "Connect GitHub", wait=1500); click(page, "Continue", wait=2500)
    # verify screen with the QR code tab
    if click(page, "Connect with QR or phone-tap", wait=2000):
        click(page, "Show code", wait=1800)
        shot(page, "verify_code", {"tabs": ("Tap phones", "minw:340")}, wait=400)
        page.go_back(); page.wait_for_timeout(1500)
    page.get_by_role("switch").first.click(); page.wait_for_timeout(2200)
    click(page, "Want to meet", wait=3000)
    ok = click(page, "Find Maya", wait=2500)
    print("meetup url", page.url)
    sim = page.get_by_text("Demo: we met and talked", exact=False)
    if sim.count(): sim.first.click(); page.wait_for_timeout(3500)
    else:
        page.go_back(); page.wait_for_timeout(1500); click(page, "Maya Patel", nth=0, wait=2500)
        page.get_by_text("Simulate meeting", exact=False).first.click(); page.wait_for_timeout(3500)
    print("checklist url", page.url)
    shot(page, "checklist", {"title": ("What did you talk about?", "text"), "yes": ("Yes, connect", "text"), "verified": ("Verified in person", "text")}, tall=1000)
    try:
        page.set_viewport_size({"width": VW, "height": 1000}); page.wait_for_timeout(700)
        rows = page.evaluate("() => Array.from(document.querySelectorAll('[role=checkbox]')).map(e => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })")
        print("rows", rows); C.MAN["checklist"]["boxes"]["rows"] = rows
        for i in range(min(3, len(rows))): page.locator("[role=checkbox]").nth(i).click(); page.wait_for_timeout(350)
        page.wait_for_timeout(400); page.screenshot(path=f"{OUT}/checklist_checked.png")
        C.MAN["checklist_checked"] = {"file": "screens/checklist_checked.png", "w": VW, "h": 1000, "boxes": {}}
        page.set_viewport_size({"width": VW, "height": VH}); page.wait_for_timeout(500)
    except Exception: traceback.print_exc()
    if click(page, "Yes, connect", wait=3500):
        shot(page, "connected", {"draft": ("Draft a follow-up", "text"), "chatBtn": ("Chat with Maya", "text")}, wait=300)
        if click(page, "Draft a follow-up", wait=3500):
            shot(page, "followup", {"draft": ("Draft a follow-up", "text")}, tall=1000)
    json.dump(C.MAN, open(f"{OUT}/manifest.json", "w"), indent=1)
    # tabs
    for tab, name, tall in [("Feed", "feed", 1150), ("Constellation", "graph", 1400)]:
        try:
            page.get_by_text(tab, exact=True).last.click(); page.wait_for_timeout(2600)
            shot(page, name, {"sky": ("YOUR CONSTELLATION", "card"), "hero": ("A little common ground.", "text"), "post": ("Working on lob-alpha", "card")}, tall=tall, wait=1200)
        except Exception: traceback.print_exc()
    try:
        page.get_by_text("Profile", exact=True).last.click(); page.wait_for_timeout(2200)
        page.set_viewport_size({"width": VW, "height": 2300}); page.wait_for_timeout(900)
        page.get_by_text("Review", exact=True).first.click(); page.wait_for_timeout(1500)
        page.set_viewport_size({"width": VW, "height": VH}); page.wait_for_timeout(300)
        shot(page, "profile_review", {"skills": ("Skills & interests", "text"), "rag": ("retrieval-augmented generation", "card"), "technical": ("TECHNICAL", "text"), "sources": ("Sources", "text")}, tall=2300, wait=900)
        links = page.evaluate("() => Array.from(document.querySelectorAll('a')).map(a => a.getAttribute('href'))")
        print("profile links", links)
    except Exception: traceback.print_exc()
    try:
        page.get_by_label("Ask Constellation AI").first.click(); page.wait_for_timeout(1800)
        box_ = page.locator("textarea, input[type=text], input:not([type])").last
        box_.fill("Who here works in quant finance?"); page.keyboard.press("Enter"); page.wait_for_timeout(3500)
        shot(page, "assistant", {"q": ("Who here works in quant finance?", "text")}, wait=300)
    except Exception: traceback.print_exc()
    json.dump(C.MAN, open(f"{OUT}/manifest.json", "w"), indent=1)
    browser.close()
print("DONE", sorted(C.MAN))
