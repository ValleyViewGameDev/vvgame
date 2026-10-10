"""Render grids with mountain footprints filled (size from resources.json, anchor bottom-left).
   python3 tools/gridgen/mtn_render.py out.png r0 r1 c0 c1 [candidateDir] [scale]"""
import json, os, sys
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__))
GS = os.path.join(HERE, '..', '..', 'game-server')
FIXED = os.path.join(GS, 'layouts', 'gridLayouts', 'valleyFixedCoord')
res = json.load(open(os.path.join(GS, 'tuning', 'resources.json')))
bykey = {r['layoutkey']: r for r in res if r.get('layoutkey')}
TC = {'GR': (130, 187, 77), 'WA': (70, 140, 210), 'SL': (151, 150, 139), 'DI': (201, 143, 89), 'SA': (224, 202, 36), 'LV': (196, 60, 40),
      'PA': (245, 191, 137), 'ZZ': (63, 116, 73), 'CY': (108, 59, 59), 'CB': (172, 170, 137), 'OW': (255, 255, 255)}
out, r0, r1, c0, c1 = sys.argv[1], *map(int, sys.argv[2:6])
cand = sys.argv[6] if len(sys.argv) > 6 and sys.argv[6] != '-' else None
sc = int(sys.argv[7]) if len(sys.argv) > 7 else 2
coord = lambda fr, fc: 1010000 + (fr // 8) * 1000 + (fc // 8) * 100 + (fr % 8) * 10 + (fc % 8)
W, H = (c1 - c0 + 1) * 64, (r1 - r0 + 1) * 64
img = Image.new('RGB', (W * sc, H * sc), (25, 25, 25)); d = ImageDraw.Draw(img)
for fr in range(r0, r1 + 1):
    for fc in range(c0, c1 + 1):
        c = coord(fr, fc); p = os.path.join(FIXED, f'{c}.json')
        if cand and os.path.exists(os.path.join(cand, f'{c}.json')): p = os.path.join(cand, f'{c}.json')
        if not os.path.exists(p): continue
        L = json.load(open(p)); ox, oy = (fc - c0) * 64, (fr - r0) * 64
        for y in range(64):
            for x in range(64):
                col = TC.get(L['tiles'][y][x], (255, 0, 255)); k = L['resources'][y][x]
                if k in ('OT', 'PT', 'dt'): col = tuple(int(v * 0.65) for v in col)
                d.rectangle([(ox + x) * sc, (oy + y) * sc, (ox + x) * sc + sc - 1, (oy + y) * sc + sc - 1], fill=col)
        for y in range(64):
            for x in range(64):
                k = L['resources'][y][x]
                if k in ('m1', 'm2'):
                    s = bykey[k]['size']; colr = (70, 45, 30) if k == 'm2' else (110, 80, 55)
                    d.rectangle([(ox + x) * sc, (oy + y - s + 1) * sc, (ox + x + s) * sc - 1, (oy + y + 1) * sc - 1], fill=colr, outline=(30, 20, 10))
for fr in range(r0, r1 + 2): d.line([(0, (fr - r0) * 64 * sc), (W * sc, (fr - r0) * 64 * sc)], fill=(255, 255, 0))
for fc in range(c0, c1 + 2): d.line([((fc - c0) * 64 * sc, 0), ((fc - c0) * 64 * sc, H * sc)], fill=(255, 255, 0))
img.save(out); print(out, img.size)
