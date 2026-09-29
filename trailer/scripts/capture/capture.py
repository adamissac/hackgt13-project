"""Capture Constellation demo-mode screens at 3x with element boxes (pt units) for the trailer."""
import json, os, sys, traceback
from shootlib import *
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "public", "screens")
os.makedirs(OUT, exist_ok=True)
MAN = {}
VW, VH = 390, 774
BOX_JS = r"""
([text, mode]) => {
  const all = Array.from(document.querySelectorAll('div,span,button,a'));
  const norm = s => (s || '').replace(/\s+/g, ' ').trim();
  let hits = all.filter(e => norm(e.innerText) === text);
  if (!hits.length) hits = all.filter(e => norm(e.innerText).startsWith(text));
  if (!hits.length) return null;
  // deepest match that is visible
  hits = hits.filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  if (!hits.length) return null;
  let el = hits[hits.length - 1];
  for (const h of hits) if (!h.querySelector('*') || Array.from(h.children).every(c => norm(c.innerText) !== norm(h.innerText))) { el = h; }
  const want = mode || 'text';
  let cur = el;
  const R = e => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; };
  if (want === 'text') return R(cur);
  if (want.startsWith('minw:')) { const n = +want.slice(5); while (cur && cur.getBoundingClientRect().width < n) cur = cur.parentElement; return cur ? R(cur) : null; }
  if (want === 'card' || want === 'button') {
    while (cur) {
      const cs = getComputedStyle(cur);
      const rad = parseFloat(cs.borderTopLeftRadius) || 0;
      const bg = cs.backgroundColor;
      const filled = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
      if (want === 'button' && (cur.getAttribute('role') === 'button' || cs.cursor === 'pointer') && cur.getBoundingClientRect().width > 40) return R(cur);
      if (want === 'card' && rad >= 12 && (filled || parseFloat(cs.borderTopWidth) > 0) && cur.getBoundingClientRect().width > 250) return R(cur);
      cur = cur.parentElement;
    }
    return R(el);
  }
  return R(el);
}
"""
def box(page, text, mode="text"):
    try:
        r = page.evaluate(BOX_JS, [text, mode])
        return [round(v, 1) for v in r] if r else None
    except Exception as e:
        print("box fail", text, e); return None

def shot(page, name, boxes=None, tall=None, wait=900):
    try:
        if tall: page.set_viewport_size({"width": VW, "height": tall}); page.wait_for_timeout(wait + 600)
        else: page.wait_for_timeout(wait)
        page.screenshot(path=f"{OUT}/{name}.png")
        b = {k: box(page, *v) if isinstance(v, tuple) else box(page, v) for k, v in (boxes or {}).items()}
        MAN[name] = {"file": f"screens/{name}.png", "w": VW, "h": tall or VH, "boxes": b}
        print("ok", name, {k: v for k, v in b.items()})
    except Exception:
        print("FAIL", name); traceback.print_exc()
    finally:
        if tall: page.set_viewport_size({"width": VW, "height": VH}); page.wait_for_timeout(500)
    json.dump(MAN, open(f"{OUT}/manifest.json", "w"), indent=1)

def click(page, text, exact=True, nth=0, wait=1200):
    try:
        loc = page.get_by_text(text, exact=exact)
        loc.nth(nth).click(); page.wait_for_timeout(wait); return True
    except Exception as e:
        print("click fail", text, str(e)[:120]); return False

def run_flow1():
  start_server()
  with sync_playwright() as p:
      browser = p.chromium.launch(args=["--disable-gpu", "--font-render-hinting=none"])
      ctx = browser.new_context(viewport={"width": VW, "height": VH}, device_scale_factor=3)
      ctx.add_init_script("""const add=()=>{const s=document.createElement('style');s.textContent=%r;document.head.appendChild(s)}; if(document.head)add(); else document.addEventListener('DOMContentLoaded',add);""" % FONT_CSS)
      page = ctx.new_page()
      page.goto(BASE + "/sign-in", wait_until="networkidle", timeout=60000)
      shot(page, "signin", {"linkedin": ("Continue with LinkedIn", "button"), "title": ("Less networking.", "text")}, wait=1200)
      click(page, "Try the demo (no account needed)")
      shot(page, "onboarding", {"github": ("Connect GitHub", "button"), "githubCard": ("Connect your GitHub", "card")})
      click(page, "Connect GitHub", wait=1500)
      shot(page, "onboarding_done", {"ready": ("✓ Your profile is ready", "card"), "githubCard": ("GitHub connected", "card"), "continue": ("Continue", "button")})
      click(page, "Continue", wait=2500)
      shot(page, "home_off", {"meetCard": ("Meet people here", "card"), "findRow": ("Let people find you", "minw:300"), "matchesTitle": ("Your best matches", "text"),
          "maya": ("Maya Patel", "minw:300"), "daniel": ("Daniel Kim", "minw:300"), "sara": ("Sara Chen", "minw:300"), "matchesCard": ("Maya Patel", "card"),
          "qr": ("Connect with QR or phone-tap", "button"), "gps": ("Connect with GPS verification", "button"), "justMet": ("Just met someone?", "card")}, tall=1060)
      click(page, "Maya Patel", wait=2500)
      shot(page, "match_maya", {"header": ("Maya Patel", "text"), "why": ("Why you should talk", "card"), "icebreaker": ("ICEBREAKER", "minw:300"),
          "common": ("What you have in common", "text"), "commonCard": ("retrieval-augmented generation", "card"), "overlapTitle": ("Overlap by area", "text"),
          "overlapCard": ("Technical", "card"), "stepper": ("Want to meet", "minw:320")}, tall=2000, wait=1500)
      page.go_back(); page.wait_for_timeout(2000)
      try:
          page.get_by_role("switch").first.click(); page.wait_for_timeout(2500)
      except Exception as e: print("switch fail", e)
      shot(page, "home_on", {"meetCard": ("Meet people here", "card"), "findRow": ("Let people find you", "minw:300"), "sugCard": ("Suggested", "card"),
          "want": ("Want to meet", "button"), "notnow": ("Not now", "button")}, tall=1300)
      try:
          page.set_viewport_size({"width": VW, "height": 1300}); page.wait_for_timeout(800)
          page.get_by_text("Want to meet", exact=True).first.click(); page.wait_for_timeout(250)
          page.screenshot(path=f"{OUT}/home_waiting.png")
          MAN["home_waiting"] = {"file": "screens/home_waiting.png", "w": VW, "h": 1300, "boxes": {"sugCard": box(page, "Nice. If it’s mutual", "card")}}
          page.wait_for_timeout(2600)
          page.screenshot(path=f"{OUT}/home_mutual.png")
          MAN["home_mutual"] = {"file": "screens/home_mutual.png", "w": VW, "h": 1300, "boxes": {"mutualCard": box(page, "You both want to meet", "card"), "message": box(page, "Message", "button")}}
          print("ok waiting/mutual", MAN["home_mutual"]["boxes"])
          page.set_viewport_size({"width": VW, "height": VH}); page.wait_for_timeout(600)
      except Exception: traceback.print_exc()
      json.dump(MAN, open(f"{OUT}/manifest.json", "w"), indent=1)
      if click(page, "Message", wait=4200):
          shot(page, "chat_maya", {"lastMsg": ("Perfect, I’m wearing", "text")}, wait=600)
          page.go_back(); page.wait_for_timeout(1500)
      if click(page, "Connect with QR or phone-tap", wait=2000):
          shot(page, "verify", {"qr": ("Show my code", "card")})
          page.go_back(); page.wait_for_timeout(1500)
      click(page, "Maya Patel", wait=2200)
      if click(page, "Simulate meeting (demo attendee)", wait=3500):
          print("after simulate", page.url)
          shot(page, "checklist", {"title": ("What did you talk about?", "text"), "yes": ("Yes, connect", "button"), "verified": ("Verified in person", "text")}, tall=1000)
          page.set_viewport_size({"width": VW, "height": 1000}); page.wait_for_timeout(600)
          rows = page.evaluate("() => Array.from(document.querySelectorAll('[role=checkbox]')).map(e => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })")
          print("checkbox rows", rows)
          MAN["checklist"]["boxes"]["rows"] = rows
          for i in range(min(3, len(rows))):
              page.locator("[role=checkbox]").nth(i).click(); page.wait_for_timeout(300)
          page.screenshot(path=f"{OUT}/checklist_checked.png")
          MAN["checklist_checked"] = {"file": "screens/checklist_checked.png", "w": VW, "h": 1000, "boxes": {}}
          page.set_viewport_size({"width": VW, "height": VH}); page.wait_for_timeout(500)
          if click(page, "Yes, connect", wait=3000):
              shot(page, "connected", {"draft": ("Draft a follow-up", "button"), "card": ("A private chat is open", "card")})
              if click(page, "Draft a follow-up", wait=3500):
                  shot(page, "followup", {"note": ("Draft a follow-up", "card")}, tall=1100)
      json.dump(MAN, open(f"{OUT}/manifest.json", "w"), indent=1)
      browser.close()
  print("DONE", list(MAN))
  

if __name__ == '__main__':
    run_flow1()
