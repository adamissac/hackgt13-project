import os, threading, http.server, sys, time
from functools import partial
sys.path.insert(0, os.path.dirname(__file__))
import serve_expo
if os.path.isdir("/opt/pw-browsers"): os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/opt/pw-browsers")
from playwright.sync_api import sync_playwright

ROOT = os.environ.get("EXPO_WEB_EXPORT", "/tmp/webexport")
PORT = 8081
BASE = f"http://127.0.0.1:{PORT}"
FONT_CSS = """
@font-face { font-family: '-apple-system'; src: url('/__fonts/inter-latin-wght-normal.woff2') format('woff2'); font-weight: 100 900; }
@font-face { font-family: 'BlinkMacSystemFont'; src: url('/__fonts/inter-latin-wght-normal.woff2') format('woff2'); font-weight: 100 900; }
@font-face { font-family: 'Segoe UI'; src: url('/__fonts/inter-latin-wght-normal.woff2') format('woff2'); font-weight: 100 900; }
@font-face { font-family: 'Roboto'; src: url('/__fonts/inter-latin-wght-normal.woff2') format('woff2'); font-weight: 100 900; }
@font-face { font-family: 'Helvetica'; src: url('/__fonts/inter-latin-wght-normal.woff2') format('woff2'); font-weight: 100 900; }
@font-face { font-family: 'Arial'; src: url('/__fonts/inter-latin-wght-normal.woff2') format('woff2'); font-weight: 100 900; }
html, body { -webkit-font-smoothing: antialiased; }
::-webkit-scrollbar { display: none; }
"""

def start_server():
    # the injected CSS loads Inter from /__fonts inside the export
    import shutil
    fonts = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "public", "fonts")
    os.makedirs(os.path.join(ROOT, "__fonts"), exist_ok=True)
    for fn in ("inter-latin-wght-normal.woff2", "inter-latin-ext-wght-normal.woff2"):
        shutil.copy(os.path.join(fonts, fn), os.path.join(ROOT, "__fonts", fn))
    serve_expo.ROOT = ROOT
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), partial(serve_expo.Handler, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv

def new_page(p, dark=False, dsf=3):
    browser = p.chromium.launch(args=["--disable-gpu", "--font-render-hinting=none"])
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=dsf,
                              color_scheme="dark" if dark else "light", is_mobile=False, has_touch=False)
    ctx.add_init_script("""
      const add = () => { const s = document.createElement('style'); s.textContent = %r; document.head.appendChild(s); };
      if (document.head) add(); else document.addEventListener('DOMContentLoaded', add);
    """ % FONT_CSS)
    page = ctx.new_page()
    return browser, ctx, page

def texts(page, limit=80):
    return page.evaluate("() => Array.from(document.querySelectorAll('div[dir=auto], span, [role=button]')).map(e => e.innerText).filter(t => t && t.length < 90).slice(0, %d)" % limit)
