"""Whole-valley map: 1 px per tile, existing templates plus an optional folder of new ones.
   python3 tools/gridgen/valley_map.py out.png [newDir] [--rows r0 r1] [--cols c0 c1] [--mark-new]"""
import json, os, sys
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__))
FIXED = os.path.join(HERE, '..', '..', 'game-server', 'layouts', 'gridLayouts', 'valleyFixedCoord')
TC = {'GR': (130, 187, 77), 'WA': (70, 140, 210), 'SL': (151, 150, 139), 'DI': (201, 143, 89), 'SA': (224, 202, 36), 'LV': (196, 60, 40),
      'PA': (245, 191, 137), 'ZZ': (63, 116, 73), 'CY': (108, 59, 59), 'CB': (172, 170, 137), 'OW': (255, 255, 255)}
TREES = {'OT', 'PT', 'dt', 'LT'}
args = sys.argv[1:]
out = args[0]; newdir = args[1] if len(args) > 1 and not args[1].startswith('--') else None
def opt(name, default):
    return tuple(int(v) for v in args[args.index(name) + 1: args.index(name) + 3]) if name in args else default
r0, r1 = opt('--rows', (8, 55)); c0, c1 = opt('--cols', (8, 55)); mark = '--mark-new' in args
coord = lambda fr, fc: 1010000 + (fr // 8) * 1000 + (fc // 8) * 100 + (fr % 8) * 10 + (fc % 8)
img = Image.new('RGB', ((c1 - c0 + 1) * 64, (r1 - r0 + 1) * 64), (25, 25, 25)); px = img.load()
newcells = []
for fr in range(r0, r1 + 1):
    for fc in range(c0, c1 + 1):
        c = coord(fr, fc); p = os.path.join(FIXED, f'{c}.json'); isnew = False
        if newdir and os.path.exists(os.path.join(newdir, f'{c}.json')): p = os.path.join(newdir, f'{c}.json'); isnew = True   # a candidate folder wins over the live templates
        if not os.path.exists(p): continue
        d = json.load(open(p)); T, R = d['tiles'], d['resources']
        if isnew: newcells.append((fr, fc))
        for y in range(64):
            for x in range(64):
                col = TC.get(T[y][x], (255, 0, 255))
                if R[y][x] in TREES: col = tuple(int(v * 0.62) for v in col)
                px[(fc - c0) * 64 + x, (fr - r0) * 64 + y] = col
dr = ImageDraw.Draw(img)
for fr in range(r0, r1 + 2): dr.line([(0, (fr - r0) * 64), (img.width, (fr - r0) * 64)], fill=(0, 0, 0) if (fr % 8) else (255, 255, 0))
for fc in range(c0, c1 + 2): dr.line([((fc - c0) * 64, 0), ((fc - c0) * 64, img.height)], fill=(0, 0, 0) if (fc % 8) else (255, 255, 0))
if mark:
    for fr, fc in newcells: dr.rectangle([(fc - c0) * 64 + 2, (fr - r0) * 64 + 2, (fc - c0) * 64 + 6, (fr - r0) * 64 + 6], fill=(255, 255, 255))
img.save(out)
print(out, img.size)
