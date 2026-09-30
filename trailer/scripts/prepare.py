#!/usr/bin/env python3
"""Prepare trailer assets: measure captured screens, copy fonts, synthesize SFX and score, write cue sheet and reference mixes.

Run from the trailer folder: python3 scripts/prepare.py
"""
import json, os, shutil, wave
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = lambda *a: os.path.join(ROOT, *a)
SC = P('public', 'screens')
SR = 48000
FPS = 30

# ---------------------------------------------------------------- screens
M = json.load(open(os.path.join(SC, 'manifest.json')))
def img(n): return np.asarray(Image.open(os.path.join(SC, n + '.png')).convert('RGB')).astype(np.int16)

for n, d in M.items():  # header height for screens whose header is white
    if d.get('top') == '#FFFFFF':
        col = img(n)[:, 6]
        idx = np.where(np.all(np.abs(col - np.array([248, 247, 245])) <= 2, axis=1))[0]
        d['headerH'] = round(float(idx[0]) / 3, 1) if len(idx) else 0.0

a = img('profile_review'); H3 = a.shape[0]
boxes = M['profile_review']['boxes']
tech = boxes.get('technical') or [41, 1615, 308, 15]
heads = [b[1] for k, b in boxes.items() if k in ('technical', 'career') and b]
xs = slice(60 * 3, 240 * 3)
seps = []
for y in range(int((tech[1] + 16) * 3), H3 - 5):
    seg = a[y, xs]
    if 205 < seg.mean() < 246 and seg.std() < 6 and a[y - 4, xs].mean() > 248 and a[y + 4, xs].mean() > 248:
        seps.append(y)
lines = []
for y in seps:
    if lines and y - lines[-1][-1] <= 3: lines[-1].append(y)
    else: lines.append([y])
sep = [(l[0] + l[-1]) / 2 / 3 for l in lines]
bounds = [tech[1] + 22] + sep
rows = []
for y0, y1 in zip(bounds[:-1], bounds[1:]):
    inside = [hy for hy in heads if y0 < hy < y1]
    if inside: y1 = inside[0] - 8  # a group header sits between this row and the next
    if 40 < y1 - y0 < 170:
        cyp = int((y0 + y1) / 2 * 3)
        dark = a[cyp, 250 * 3:368 * 3].mean(axis=1) < 246
        runs, start = [], None
        for i, v in enumerate(dark):
            if v and start is None: start = i
            if not v and start is not None: runs.append((start, i)); start = None
        if start is not None: runs.append((start, len(dark)))
        cxs = [250 + (r0 + r1) / 2 / 3 for r0, r1 in runs if r1 - r0 > 30]
        rows.append({'y0': round(y0 + 1, 1), 'y1': round(y1 - 1, 1), 'cy': round((y0 + y1) / 2, 1),
                     'checkX': round(cxs[0], 1) if cxs else 274.0, 'crossX': round(cxs[-1], 1) if len(cxs) > 1 else 330.0})
M['profile_review']['rows'] = [r for r in rows if r['y1'] < 1536 + 698]
print('review seps', [round(s, 1) for s in sep][:12])
print('review rows', M['profile_review']['rows'])

a = img('match_maya'); x0, y0, w, h = M['match_maya']['boxes']['overlapCard']
sub = a[int(y0 * 3):int((y0 + h) * 3), int(x0 * 3):int((x0 + w) * 3)]
blue = (sub[..., 2] > 100) & (sub[..., 0] < 80) & (sub[..., 1] < 110) & (sub[..., 2] - sub[..., 0] > 60)
groups = []
for r in np.where(blue.sum(axis=1) > 15)[0]:
    if groups and r - groups[-1][-1] <= 2: groups[-1].append(r)
    else: groups.append([r])
bars = []
for g in groups:
    if len(g) < 6: continue
    mid = (g[0] + g[-1]) // 2
    cols = np.where(blue[mid])[0]
    tc = sub[mid, min(sub.shape[1] - 1, cols.max() + 9)]
    bars.append({'y0': round(y0 + g[0] / 3, 1), 'y1': round(y0 + g[-1] / 3, 1), 'x0': round(x0 + cols.min() / 3, 1), 'x1': round(x0 + cols.max() / 3, 1),
                 'track': '#%02X%02X%02X' % tuple(int(v) for v in tc)})
M['match_maya']['bars'] = bars
print('bars', bars)

a = img('home_on'); fx, fy, fw, fh = M['home_on']['boxes']['findRow']
sub = a[int(fy * 3):int((fy + fh) * 3), 296 * 3:int((fx + fw) * 3)]
ys, xs_ = np.where((sub.max(axis=2) - sub.min(axis=2)) > 40)
if len(xs_):
    M['home_on']['switchBox'] = [round(296 + xs_.min() / 3, 1), round(fy + ys.min() / 3, 1), round((xs_.max() - xs_.min()) / 3, 1), round((ys.max() - ys.min()) / 3, 1)]
print('switch', M['home_on'].get('switchBox'), 'tabs', M['verify_code']['boxes'].get('tabs'), 'headers', {n: d.get('headerH') for n, d in M.items() if 'headerH' in d})
json.dump(M, open(os.path.join(SC, 'manifest.json'), 'w'), indent=1)

# ---------------------------------------------------------------- fonts
os.makedirs(P('public', 'fonts'), exist_ok=True)
inter = P('node_modules', '@fontsource-variable', 'inter', 'files')
for fn in ('inter-latin-wght-normal.woff2', 'inter-latin-ext-wght-normal.woff2'):
    shutil.copy(os.path.join(inter, fn), P('public', 'fonts', fn))
mono = os.path.join(ROOT, '..', 'hackgt13-project', 'mobile', 'assets', 'fonts', 'SpaceMono-Regular.ttf')
if os.path.exists(mono): shutil.copy(mono, P('public', 'fonts', 'SpaceMono-Regular.ttf'))

# ---------------------------------------------------------------- synthesis helpers
rng = np.random.default_rng(7)
def t_(d): return np.arange(int(d * SR)) / SR
def ed(d, tau): return np.exp(-t_(d) / tau)
def sine(fr, d, ph=0.0): return np.sin(2 * np.pi * fr * t_(d) + ph)
def noise(d): return rng.standard_normal(int(d * SR))
def lp(x, fc):
    X = np.fft.rfft(x); fr = np.fft.rfftfreq(len(x), 1 / SR); X /= np.sqrt(1 + (fr / fc) ** 4); return np.fft.irfft(X, len(x))
def hp(x, fc):
    X = np.fft.rfft(x); fr = np.fft.rfftfreq(len(x), 1 / SR); X /= np.sqrt(1 + (fc / np.maximum(fr, 1.0)) ** 4); return np.fft.irfft(X, len(x))
def bp(x, lo, hi): return hp(lp(x, hi), lo)
def fade(x, a=0.004, r=0.02):
    e = np.ones(len(x)); ai, ri = int(a * SR), int(r * SR)
    if ai: e[:ai] = np.linspace(0, 1, ai)
    if ri: e[-ri:] *= np.linspace(1, 0, ri)
    return x * e
def norm(x, peak=0.9): return x / (np.max(np.abs(x)) + 1e-9) * peak
def sweep(f0, f1, d): fr = np.linspace(f0, f1, int(d * SR)); return np.sin(2 * np.pi * np.cumsum(fr) / SR)
def bell(f0, d, tau):
    return sum(amp * sine(f0 * m, d) * ed(d, tau / (1 + 0.6 * i)) for i, (m, amp) in enumerate([(1, 1), (2.0, 0.35), (2.76, 0.18), (5.4, 0.06)]))
def place(dst, src, i):
    j = min(len(dst), i + len(src))
    if j > i: dst[i:j] += src[:j - i]

def sfx_tap():
    d = 0.09; return fade(0.6 * sine(1500, d) * ed(d, 0.012) + 0.25 * bp(noise(d), 1500, 6000) * ed(d, 0.004), 0.001, 0.02)
def sfx_tick():
    d = 0.05; return fade(sine(2400, d) * ed(d, 0.006), 0.0005, 0.01)
def sfx_toggle():
    d = 0.22; x = 0.5 * sine(170, d) * ed(d, 0.03)
    place(x, sine(1900, 0.03) * ed(0.03, 0.005) + 0.3 * bp(noise(0.03), 2000, 8000) * ed(0.03, 0.002), 0)
    place(x, 0.8 * sine(1250, 0.03) * ed(0.03, 0.006), int(0.045 * SR)); return fade(x, 0.0005, 0.03)
def sfx_ping():
    x = bell(1568, 1.3, 0.38); y = x.copy(); k = int(0.19 * SR); y[k:] += 0.3 * x[:-k]; return fade(y, 0.002, 0.2)
def sfx_ping_soft(): return fade(0.6 * bell(1174.7, 0.8, 0.22), 0.002, 0.1)
def sfx_pop():
    d = 0.12; return fade(sweep(900, 430, d) * ed(d, 0.035), 0.001, 0.02)
def sfx_chime():
    x = np.zeros(int(1.8 * SR)); place(x, bell(1318.5, 1.6, 0.5), 0); place(x, 0.8 * bell(1975.5, 1.6, 0.55), int(0.09 * SR)); return fade(x, 0.002, 0.3)
def sfx_chime_soft(): return fade(0.7 * bell(880, 1.2, 0.4), 0.002, 0.2)
def sfx_whoosh(d=0.6, lo=250, hi=3500):
    env = np.sin(np.pi * np.clip(t_(d) / d, 0, 1)) ** 2; return fade(bp(noise(d), lo, hi) * env, 0.01, 0.05)
def sfx_rise(d=1.0):
    tt = t_(d); env = (tt / d) ** 2.2; fr = 180 * 2 ** (2 * tt / d)
    return fade(0.5 * np.sin(2 * np.pi * np.cumsum(fr) / SR) * env + 0.6 * bp(noise(d), 600, 7000) * env, 0.01, 0.01)
def sfx_impact(soft=False):
    d = 2.2; tt = t_(d); fr = 62 * np.exp(-tt / 0.5) + 36
    x = np.sin(2 * np.pi * np.cumsum(fr) / SR) * ed(d, 0.7) + 0.35 * sine(98, d) * ed(d, 0.25)
    if not soft: x = x + 0.5 * bp(noise(d), 200, 5000) * ed(d, 0.02)
    return fade(x * (0.6 if soft else 1.0), 0.001, 0.4)
def sfx_shimmer():
    d = 1.0; x = np.zeros(int(d * SR)); r = np.random.default_rng(3)
    for _ in range(14): place(x, sine(r.uniform(3000, 7000), 0.2) * ed(0.2, 0.05) * r.uniform(0.3, 0.7), int(r.uniform(0, 0.75) * SR))
    return fade(x, 0.003, 0.1)

LEVEL = {'tap': 0.45, 'tick': 0.22, 'toggle': 0.6, 'ping': 0.42, 'ping_soft': 0.28, 'pop': 0.38, 'chime': 0.5, 'chime_soft': 0.35,
         'whoosh': 0.32, 'swish': 0.22, 'rise': 0.42, 'rise_long': 0.46, 'impact': 0.85, 'impact_soft': 0.5, 'shimmer': 0.32}
SFX = {'tap': sfx_tap(), 'tick': sfx_tick(), 'toggle': sfx_toggle(), 'ping': sfx_ping(), 'ping_soft': sfx_ping_soft(), 'pop': sfx_pop(),
       'chime': sfx_chime(), 'chime_soft': sfx_chime_soft(), 'whoosh': sfx_whoosh(), 'swish': sfx_whoosh(0.32, 900, 9000),
       'rise': sfx_rise(1.0), 'rise_long': sfx_rise(1.9), 'impact': sfx_impact(), 'impact_soft': sfx_impact(True), 'shimmer': sfx_shimmer()}
SFX = {k: norm(v) for k, v in SFX.items()}

def write_wav(path, x):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    x = np.clip(x, -1, 1); ch = 1 if x.ndim == 1 else 2
    data = (x if ch == 1 else x.T).astype(np.float64)
    with wave.open(path, 'wb') as wf:
        wf.setnchannels(ch); wf.setsampwidth(2); wf.setframerate(SR); wf.writeframes((data * 32767).astype('<i2').tobytes())
for k, v in SFX.items(): write_wav(P('public', 'sfx', k + '.wav'), v)

# ---------------------------------------------------------------- score (beat-synced, see scripts/music.py)
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import music
TL = json.load(open(P('src', 'timeline.json')))
cues_out = {}
for cut, name in (('main', 'score-16x9'), ('vertical', 'score-9x16')):
    bed = music.build(TL['music'][cut], TL[cut]['duration'])
    write_wav(P('public', 'audio', name + '.wav'), bed)
    cues = []
    for sc in TL[cut]['scenes']:
        for lf, nm, g in TL['cues'][sc.get('cueKey', sc['id'])]:
            fr = int(round(sc['from'] + lf / sc['speed']))
            if fr < min(sc['from'] + sc['dur'], TL[cut]['duration']): cues.append([fr, nm, round(LEVEL[nm] * g * 0.8, 3)])
    cues.sort(); cues_out[cut] = cues
    mixbuf = bed * 0.9
    for fr, nm, g in cues:
        i = int(fr / FPS * SR); src = SFX[nm] * g; j = min(mixbuf.shape[1], i + len(src)); mixbuf[:, i:j] += src[:j - i]
    mixbuf = np.tanh(mixbuf * 1.15) / np.tanh(1.15)
    write_wav(P('out', f'mix-{name.split("-")[1]}.wav'), norm(mixbuf, 0.9))
    print(cut, 'score', bed.shape, 'cues', len(cues))
json.dump(cues_out, open(P('src', 'audio', 'cues.json'), 'w'))
