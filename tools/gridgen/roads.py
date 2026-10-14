"""Pavement roads across valley templates (docs/making-original-grids.md, World epic).

Roads live in data/roads.json: {name, purpose, width (1-3), fadeTiles, points: [[R, C], ...]}, the
points in WORLD tiles (R = frontier row * 64 + tile row, C likewise), passed through a smooth
spline. A road paves 'PA' and clears what stands on it (trees, rocks, flowers, loose items); a
creature on it moves to the nearest free tile of the same grid. It refuses water, lava,
mountains, buildings and anything multi-tile: plan() lists those as problems and apply() will
not run while there are any. fadeTiles thins the last stretch to a single, broken track.

  python3 tools/gridgen/roads.py                 # plan every road, list problems
  python3 tools/gridgen/roads.py --preview NAME  # ASCII view of a road over the terrain
  python3 tools/gridgen/roads.py --apply [NAME]  # paint (all roads, or one) into the layouts

Painting is idempotent (paving pavement is a no-op), so re-applying a road is safe.
"""
import json, math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
GS = os.path.join(HERE, '..', '..', 'game-server')
B = os.path.join(GS, 'layouts', 'gridLayouts', 'valleyFixedCoord')
RES = json.load(open(os.path.join(GS, 'tuning', 'resources.json')))
BYKEY = {r['layoutkey']: r for r in RES if r.get('layoutkey')}
BLOCK_TILES = {'WA', 'LV'}
TILE_LETTER = {r['layoutkey']: r['type'] for r in RES if r.get('category') == 'tile'}
CLEARABLE = {'source', 'doober'}

def coord_of(GR, GC): return 1010000 + (GR // 8) * 1000 + (GC // 8) * 100 + (GR % 8) * 10 + (GC % 8)
CACHE = {}
def load(coord):
    if coord not in CACHE:
        p = os.path.join(B, f'{coord}.json')
        CACHE[coord] = (json.load(open(p)), open(p).read()) if os.path.exists(p) else None
    return CACHE[coord][0] if CACHE[coord] else None
def cell(R, C):
    g = load(coord_of(R // 64, C // 64))
    return (g['tiles'][R % 64][C % 64], g['resources'][R % 64][C % 64]) if g else (None, None)
def rtype(k): return BYKEY.get(k, {}) if k and k != '**' else {}

def footprint_blocked():
    """World tiles covered by a multi-tile resource (mountains, buildings): anchor bottom-left, up and right."""
    out = set()
    for coord, entry in CACHE.items():
        if not entry: continue
        g = entry[0]; s = str(coord); GR = int(s[3]) * 8 + int(s[5]); GC = int(s[4]) * 8 + int(s[6])
        for y, row in enumerate(g['resources']):
            for x, k in enumerate(row):
                size = rtype(k).get('size') or 1
                if size > 1 or k == 'xx':
                    for dy in range(size):
                        for dx in range(size):
                            out.add((GR * 64 + y - dy, GC * 64 + x + dx))
    return out

def is_hard(k):
    r = rtype(k)
    if not r: return False
    return r.get('category') not in CLEARABLE and r.get('category') != 'npc'

def catmull(pts, step=0.2):
    out = []; P = [pts[0]] + pts + [pts[-1]]
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i-1], P[i], P[i+1], P[i+2]
        n = max(1, int(math.dist(p1, p2) / step))
        for k in range(n):
            t = k / n; t2 = t*t; t3 = t2*t
            out.append(tuple(0.5*((2*p1[j]) + (-p0[j]+p2[j])*t + (2*p0[j]-5*p1[j]+4*p2[j]-p3[j])*t2 + (-p0[j]+3*p1[j]-3*p2[j]+p3[j])*t3) for j in (0, 1)))
    out.append(tuple(pts[-1]))
    return out

def hash01(a, b):
    h = (a * 374761393 + b * 668265263) & 0xffffffff; h = ((h ^ (h >> 13)) * 1274126177) & 0xffffffff
    return ((h ^ (h >> 16)) & 0xffffffff) / 4294967296

def road_cells(road):
    width = road.get('width', 2); fade = road.get('fadeTiles', 0)
    samp = catmull([tuple(p) for p in road['points']])
    cum = [0.0]
    for i in range(1, len(samp)): cum.append(cum[-1] + math.dist(samp[i-1], samp[i]))
    L = cum[-1]; cells = []; seen = set()
    for i, (r, c) in enumerate(samp):
        a = samp[max(0, i-1)]; b = samp[min(len(samp)-1, i+1)]
        dr, dc = b[0]-a[0], b[1]-a[1]
        base = (round(r), round(c))
        left = L - cum[i]
        if fade and left < fade:                       # the fading end: one tile wide, ever more broken
            if hash01(*base) > (left / fade) ** 0.8 * 0.95: continue
            group = [base]
        else:
            off = (0, 1) if abs(dr) >= abs(dc) else (1, 0)
            group = [base, (base[0]+off[0], base[1]+off[1])][:max(1, min(2, width))]
            if width >= 3: group.append((base[0]-off[0], base[1]-off[1]))
        for cc in group:
            if cc not in seen: seen.add(cc); cells.append(cc)
    return cells

def plan(road):
    cells = road_cells(road)
    for (R, C) in cells: load(coord_of(R // 64, C // 64))
    hard = footprint_blocked(); problems = []
    for (R, C) in cells:
        t, k = cell(R, C)
        if t is None: problems.append((R, C, 'no layout'))
        elif t in BLOCK_TILES: problems.append((R, C, t))
        elif is_hard(k) or ((R, C) in hard and rtype(k).get('category') != 'npc'): problems.append((R, C, rtype(k).get('type') or 'footprint'))
    return cells, problems

def preview(cells, pad=4):
    S = set(cells); rs = [r for r, _ in cells]; cs = [c for _, c in cells]
    hard = footprint_blocked()
    T = {'GR': '.', 'WA': '~', 'SL': ':', 'DI': ',', 'SA': '_', 'LV': '^', 'PA': '=', 'ZZ': '"', 'CY': '%', 'CB': '#'}
    for R in range(min(rs)-pad, max(rs)+pad+1):
        line = ''
        for C in range(min(cs)-pad, max(cs)+pad+1):
            t, k = cell(R, C)
            if (R, C) in S: ch = '#' if (t in BLOCK_TILES or is_hard(k) or (R, C) in hard) else '='
            elif t is None: ch = ' '
            elif (R, C) in hard or 'Mount' in rtype(k).get('type', ''): ch = 'M'
            else: ch = T.get(t, '?')
            if C % 64 == 0 and ch in '.,:"_%': ch = '|'
            line += ch
        print(f'{R:5d} {line}')

def apply(cells):
    S = set(cells); touched = set()
    for (R, C) in cells:
        coord = coord_of(R // 64, C // 64); g = load(coord); r, c = R % 64, C % 64
        k = g['resources'][r][c]
        if rtype(k).get('category') == 'npc':
            best = None
            for d in range(1, 10):
                for rr in range(max(0, r-d), min(63, r+d)+1):
                    for c2 in range(max(0, c-d), min(63, c+d)+1):
                        WR, WC = R - r + rr, C - c + c2
                        letter = TILE_LETTER.get(g['tiles'][rr][c2])
                        if (WR, WC) not in S and g['resources'][rr][c2] == '**' and g['tiles'][rr][c2] not in BLOCK_TILES | {'PA'} and rtype(k).get(f'validon{letter}', True):
                            best = (rr, c2); break
                    if best: break
                if best: break
            if best: g['resources'][best[0]][best[1]] = k
        elif k and k != '**':
            t = rtype(k).get('type')
            for key in ('resourceDistribution',):
                dist = g.get(key)
                if isinstance(dist, dict) and isinstance(dist.get(t), (int, float)): dist[t] = max(0, dist[t] - 1)
        g['tiles'][r][c] = 'PA'; g['resources'][r][c] = '**'; touched.add(coord)
    for coord in touched:
        d, raw = CACHE[coord]
        compact = raw == json.dumps(json.loads(raw), separators=(',', ':'))
        out = json.dumps(d, separators=(',', ':')) if compact else json.dumps(d, indent=2) + ('\n' if raw.endswith('\n') else '')
        open(os.path.join(B, f'{coord}.json'), 'w').write(out)
        CACHE[coord] = (d, out)
    return sorted(touched)

if __name__ == '__main__':
    roads = json.load(open(os.path.join(HERE, 'data', 'roads.json')))['roads']
    args = sys.argv[1:]
    if '--preview' in args:
        name = args[args.index('--preview') + 1]; r = next(x for x in roads if x['name'] == name)
        cells, problems = plan(r); preview(cells); print(len(cells), 'tiles,', len(problems), 'problems', problems[:10]); sys.exit()
    only = args[args.index('--apply') + 1] if '--apply' in args and len(args) > args.index('--apply') + 1 else None
    todo = [r for r in roads if not only or r['name'] == only]
    bad = False; planned = []
    for r in todo:
        cells, problems = plan(r); planned.append((r, cells))
        print(f"{r['name']}: {len(cells)} tiles, {len(problems)} problems", problems[:8] if problems else '')
        bad = bad or bool(problems)
    if '--apply' in args:
        if bad: sys.exit('not applied: fix the problems first')
        for r, cells in planned: print(r['name'], '->', apply(cells))
