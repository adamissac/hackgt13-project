"""Beat-synced score for the Constellation trailer.

Section boundaries come from the "music" block in src/timeline.json (frames at 30 fps). Tempos are chosen so a beat
is a whole number of frames (120 BPM = 15 frames, 150 BPM = 12), and the scenes place cuts, captions and taps on that
grid, so the hits in the music land on the hits in the picture.
"""
import numpy as np

SR = 48000
FPS = 30
_rng = np.random.default_rng(23)

def midi(m): return 440.0 * 2 ** ((m - 69) / 12)
def tt(d): return np.arange(int(round(d * SR))) / SR
def noise(n): return _rng.standard_normal(n)
def _filt(x, fc, high=False, order=2):
    X = np.fft.rfft(x, axis=-1); f = np.maximum(np.fft.rfftfreq(x.shape[-1], 1 / SR), 1e-3)
    r = (fc / f) if high else (f / fc)
    return np.fft.irfft(X / np.sqrt(1 + r ** (2 * order)), x.shape[-1], axis=-1)
def lp(x, fc, order=2): return _filt(x, fc, False, order)
def hp(x, fc, order=2): return _filt(x, fc, True, order)
def saw(freq, n, ph=0.0): return 2.0 * ((ph + (freq / SR) * np.arange(n)) % 1.0) - 1.0
def put(buf, sig, t, g=1.0):
    i = int(round(t * SR)); n = buf.shape[-1]; L = sig.shape[-1]
    i0, s0 = max(0, i), max(0, -i); j = min(n, i + L)
    if j <= i0: return
    if buf.ndim == 2 and sig.ndim == 1: buf[:, i0:j] += g * sig[s0:s0 + (j - i0)]
    else: buf[..., i0:j] += g * sig[..., s0:s0 + (j - i0)]

# ---------------------------------------------------------------- instruments
def kick():
    t = tt(0.42); f = 44 + 120 * np.exp(-t / 0.032)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.3)
    click = hp(noise(len(t)), 2500) * np.exp(-t / 0.003) * 0.35
    return np.tanh(1.6 * (body + click)) * 0.95
def clap():
    t = tt(0.45); b = hp(lp(noise(len(t)), 3800), 900); env = np.zeros(len(t))
    for off in (0.0, 0.011, 0.021): env += np.where(t >= off, np.exp(-(t - off) / 0.009), 0)
    env += np.where(t >= 0.021, 0.35 * np.exp(-(t - 0.021) / 0.13), 0)
    return b * env * 0.45
def snare():
    t = tt(0.3); return 0.5 * hp(noise(len(t)), 1200) * np.exp(-t / 0.09) + 0.45 * np.sin(2 * np.pi * 185 * t) * np.exp(-t / 0.05)
def hat(open_=False):
    t = tt(0.28 if open_ else 0.05)
    return hp(noise(len(t)), 6000 if open_ else 7500) * np.exp(-t / (0.09 if open_ else 0.012)) * (0.3 if open_ else 0.28)
def shaker():
    t = tt(0.07); return hp(lp(noise(len(t)), 11000), 4500) * np.sin(np.pi * np.clip(t / 0.07, 0, 1)) ** 2 * 0.2
def crash():
    t = tt(2.6); x = hp(noise(len(t)), 3500) * np.exp(-t / 0.8)
    for fr in (3150, 4270, 5600, 7100): x += 0.08 * np.sin(2 * np.pi * fr * t) * np.exp(-t / 1.1)
    return x * 0.4
def rev_crash(d):
    x = crash()[: int(d * SR)][::-1]; return x * np.linspace(0.15, 1, len(x)) ** 2
def impact():
    t = tt(3.0); f = 34 + 70 * np.exp(-t / 0.18)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.9)
    boom = lp(noise(len(t)), 600) * np.exp(-t / 0.25) * 0.6
    crack = hp(noise(len(t)), 2000) * np.exp(-t / 0.02) * 0.5
    return np.tanh(1.3 * (sub + boom + crack)) * 0.9
def riser(d):
    t = tt(d); p = t / d; fr = 300 * 2 ** (3 * p)
    return 0.3 * np.sin(2 * np.pi * np.cumsum(fr) / SR) * p ** 2 + 0.45 * hp(noise(len(t)), 1500) * p ** 2.5
def roll(buf, t0, d, beat, S, g=0.5):
    t = 0.0
    while t < d - 1e-6:
        p = t / d; step = beat / (2 if p < 0.5 else 4 if p < 0.85 else 8)
        put(buf, S, t0 + t, g * (0.3 + 0.7 * p)); t += step
def bass_note(m, d, sub_only=False):
    n = int(d * SR); t = np.arange(n) / SR; f = midi(m); sub = np.sin(2 * np.pi * f * t)
    x = sub if sub_only else 0.5 * saw(f, n) + 0.65 * sub
    env = np.minimum(1, t / 0.004) * (0.35 + 0.65 * np.exp(-t / (1.2 if sub_only else 0.18)))
    return x * env * np.clip((d - t) / 0.015, 0, 1)
def pad_chord(notes, d, att=0.03, rel=0.3):
    n = int((d + rel) * SR); t = np.arange(n) / SR; L = np.zeros(n); R = np.zeros(n)
    for m in notes:
        f = midi(m)
        for k, det in enumerate((-0.011, -0.005, 0.0, 0.005, 0.011)):
            s = saw(f * (1 + det), n, (k * 0.37 + m * 0.11) % 1)
            if k in (0, 2, 3): L += s
            if k in (1, 2, 4): R += s
    env = np.minimum(1, t / att) * np.where(t < d, 1, np.exp(-(t - d) / max(rel / 3, 1e-3)))
    return np.stack([L, R]) * env / (len(notes) * 3)
def pluck(m, d=0.32):
    n = int(d * SR); t = np.arange(n) / SR; f = midi(m)
    return (saw(f, n) * np.exp(-t / 0.06) * 0.55 + np.sin(2 * np.pi * f * t) * np.exp(-t / 0.15) * 0.5) * np.minimum(1, t / 0.002)
def bell(m, d=1.4):
    n = int(d * SR); t = np.arange(n) / SR; f = midi(m)
    x = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / (0.9 / (1 + i))) for i, (r, a) in enumerate([(1, 1), (2, 0.4), (3.01, 0.18), (4.2, 0.08)]))
    return x * np.minimum(1, t / 0.003) * 0.5
def reverb(x, dur=2.4, decay=0.6):
    n = int(dur * SR); out = np.zeros_like(x); L = x.shape[-1] + n; NN = 1 << (L - 1).bit_length()
    for c in range(2):
        r = np.random.default_rng(100 + c); ir = lp(r.standard_normal(n) * np.exp(-np.arange(n) / SR / decay), 7000); ir /= np.sqrt(np.sum(ir ** 2))
        out[c] = np.fft.irfft(np.fft.rfft(x[c], NN) * np.fft.rfft(ir, NN), NN)[: x.shape[-1]]
    return out

# D major, one chord per bar: Dmaj9, Bm7, Gmaj7, A6sus
PROG = [dict(root=38, pad=[50, 54, 57, 61, 64], arp=[74, 78, 81, 85]), dict(root=35, pad=[47, 54, 57, 62, 66], arp=[71, 74, 78, 81]),
        dict(root=31, pad=[43, 50, 54, 57, 62], arp=[67, 71, 74, 78]), dict(root=33, pad=[45, 52, 57, 61, 64], arp=[69, 73, 76, 81])]
MOTIF = [(0, 78, 1), (1, 81, 1), (2, 83, 1.5), (3.5, 81, 0.5), (4, 78, 1), (5, 76, 1), (6, 74, 2),
         (8, 78, 1), (9, 81, 1), (10, 85, 1.5), (11.5, 83, 0.5), (12, 81, 2), (14, 78, 2)]

def build(cfg, dur_frames):
    beat = 60.0 / cfg['bpm']; bar = 4 * beat; s = lambda fr: fr / FPS; eps = 1e-6
    drop, final, end = s(cfg['drop']), s(cfg['final']), s(dur_frames)
    bd0, bd1 = s(cfg['breakdown'][0]), s(cfg['breakdown'][1])
    peak = (s(cfg['peak'][0]), s(cfg['peak'][1])) if cfg.get('peak') else None
    tech = (s(cfg['tech'][0]), s(cfg['tech'][1])) if cfg.get('tech') else None
    fills = [s(x) for x in cfg.get('fills', [])]
    N = int((end + 3.0) * SR)
    drums = np.zeros(N); bass = np.zeros(N); pads = np.zeros((2, N)); arp = np.zeros((2, N)); lead = np.zeros((2, N)); fx = np.zeros((2, N)); send = np.zeros((2, N))
    K, CLP, HC, HO, SH, SN, CR, IM = kick(), clap(), hat(), hat(True), shaker(), snare(), crash(), impact()
    groove = lambda t: (drop <= t < bd0) or (tech is not None and tech[0] <= t < tech[1])
    build_bar = lambda t: bd1 - bar <= t < bd1
    is_peak = lambda t: peak is not None and peak[0] <= t < peak[1]
    stops = [x - beat for x in fills + [bd0, final] + ([tech[0]] if tech else [])]
    # intro: drone, ticking eighths, heartbeat kick, swelling pad, roll + riser into the drop
    t0 = tt(drop)
    drone = (np.sin(2 * np.pi * midi(38) * t0) + 0.55 * np.sin(2 * np.pi * midi(45) * t0) + 0.3 * np.sin(2 * np.pi * midi(50) * 1.003 * t0)) * (0.4 + 0.6 * (t0 / drop) ** 1.3)
    put(fx, drone * 0.16, 0); put(fx, lp(noise(len(t0)), 1200) * (t0 / drop) ** 2 * 0.05, 0)
    put(pads, lp(pad_chord(PROG[0]['pad'], drop - 0.05, att=drop * 0.6, rel=0.05), 700), 0, 0.8)
    b = 0
    while b * beat < drop - eps:
        t = b * beat
        if t >= bar * 0.5: put(drums, HC, t, 0.5 if b % 2 == 0 else 0.3); put(drums, HC, t + beat / 2, 0.22)
        if t >= bar and b % 2 == 0 and t < drop - bar: put(drums, K, t, 0.35)
        b += 1
    roll(drums, drop - bar, bar, beat, SN, 0.55); put(fx, riser(bar), drop - bar, 0.5); put(fx, rev_crash(2 * beat), drop - 2 * beat, 0.5)
    # drums
    kicks = []
    for b in range(int(np.ceil(end / beat))):
        t = b * beat; pos = b % 4
        if t < drop - eps or not (groove(t) or build_bar(t)): continue
        stop = any(abs(t - st) < eps for st in stops)
        if stop: continue
        put(drums, K, t, 0.95); kicks.append(t)
        if groove(t):
            if pos in (1, 3): put(drums, CLP, t, 0.75); put(send, CLP, t, 0.25)
            for k16, gg in enumerate((0.42, 0.18, 0.62, 0.2)): put(drums, HC, t + k16 * beat / 4, gg)
            put(drums, HO, t + beat / 2, 0.5 if is_peak(t) else 0.3)
            if is_peak(t):
                for k16 in range(4): put(drums, SH, t + k16 * beat / 4, 0.6)
    for fl in fills:  # snare fill into each scene change, crash on the downbeat
        for k16 in range(4): put(drums, SN, fl - beat + k16 * beat / 4, 0.3 + 0.12 * k16)
        put(drums, CR, fl, 0.55); put(send, CR, fl, 0.15); put(fx, rev_crash(beat), fl - beat, 0.35)
    put(fx, IM, drop, 0.9); put(drums, CR, drop, 0.8)
    put(drums, CR, bd0, 0.5); put(fx, IM, bd0, 0.35)
    if peak: roll(drums, peak[1] - bar, bar, beat, SN, 0.5); put(fx, riser(bar), peak[1] - bar, 0.45)
    roll(drums, bd1 - bar, bar, beat, SN, 0.5); put(fx, riser(bar), bd1 - bar, 0.5)
    if tech:
        put(fx, IM, tech[0], 0.6); put(drums, CR, tech[0], 0.6)
        roll(drums, final - bar / 2, bar / 2, beat, SN, 0.5); put(fx, riser(bar / 2), final - bar / 2, 0.45)
    put(fx, IM, final, 1.0); put(drums, CR, final, 0.9)
    # harmony
    for k in range(int(np.ceil(end / bar))):
        t = k * bar
        if t < drop - eps or t >= final - eps: continue
        ch = PROG[k % 4]; in_bd = bd0 <= t < bd1 and not build_bar(t); d = min(bar, final - t)
        put(pads, pad_chord(ch['pad'], d, att=0.4 if in_bd else 0.02, rel=0.25), t, 1.25 if in_bd else 1.0)
        if in_bd:
            put(bass, bass_note(ch['root'], d, sub_only=True), t, 0.8)
        else:
            for e in range(8):
                te = t + e * beat / 2
                if te < final - eps: put(bass, bass_note(ch['root'] + (12 if e % 2 else 0), beat / 2 * 0.92), te, 0.9)
        if (groove(t) and t >= drop + bar - eps) or build_bar(t):
            fast = is_peak(t) or (tech is not None and tech[0] <= t < tech[1])
            step = beat / 4 if fast else beat / 2; notes = ch['arp']; seq = notes + notes[::-1][1:-1]
            for e in range(int(round(bar / step))):
                pl = pluck(seq[e % len(seq)] + (12 if is_peak(t) and e % 8 >= 4 else 0))
                put(arp, np.stack([pl, pl * 0.6]) if e % 2 == 0 else np.stack([pl * 0.6, pl]), t + e * step, 0.9 if fast else 0.6)
        if in_bd:
            for e in range(8):
                if _rng.random() < 0.55:
                    bl = bell([86, 90, 93, 95, 88, 98][_rng.integers(6)], 1.6); pan = _rng.uniform(0.3, 1.0)
                    put(lead, np.stack([bl * pan, bl * (1.3 - pan)]), t + e * beat / 2, 0.22)
    mt = drop + 4 * bar
    while mt + 4 * bar <= bd0 + eps:  # hook every 8 bars
        for off, m, du in MOTIF: put(lead, bell(m, max(0.6, du * beat + 0.6)), mt + off * beat, 0.3)
        mt += 8 * bar
    tail = end - final + 1.5
    put(pads, pad_chord(PROG[0]['pad'] + [69, 73, 78], tail - 1.0, att=0.01, rel=1.0), final, 1.2)
    put(bass, bass_note(PROG[0]['root'], tail - 0.5, sub_only=True), final, 1.0)
    for m in (86, 90, 93): put(lead, bell(m, 3.0), final, 0.35)
    # sidechain, filters, space, master
    duck = np.ones(N)
    if kicks:
        imp = np.zeros(N); idx = (np.array(kicks) * SR).astype(int); imp[idx[idx < N]] = 1.0
        ker = np.exp(-np.arange(int(0.35 * SR)) / SR / 0.11); M = N + len(ker)
        duck = 1.0 - 0.6 * np.clip(np.fft.irfft(np.fft.rfft(imp, M) * np.fft.rfft(ker, M), M)[:N], 0, 1)
    pads = lp(pads, 2600) * duck * 0.33
    bass = lp(bass, 900) * np.clip(duck + 0.2, 0, 1)
    arp = lp(arp, 5200) * np.clip(duck + 0.3, 0, 1)
    dl = int(0.75 * beat * SR); echo = np.zeros_like(arp); echo[0, dl:] = arp[1, :-dl] * 0.35; echo[1, dl:] = arp[0, :-dl] * 0.35; arp = arp + echo
    send += pads * 0.5 + arp * 0.5 + lead * 0.8
    mix = drums * 0.85 + bass * 0.55 + pads + arp * 0.3 + lead * 0.5 + fx + reverb(send) * 0.35
    mix = mix[:, : int(end * SR)]
    fo = int(1.0 * SR); mix[:, -fo:] *= np.linspace(1, 0, fo)
    mix = mix / (np.max(np.abs(mix)) + 1e-9) * 1.1
    return np.tanh(mix) / np.tanh(1.1) * 0.92
