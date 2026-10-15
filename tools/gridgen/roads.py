"""Roads and trails across valley templates (docs/making-original-grids.md, World epic).

Roads live in data/roads.json: {name, purpose, style, points: [[R, C], ...], ...}, the points in
WORLD tiles (R = frontier row * 64 + tile row, C likewise). The points are only a GUIDE:

  style "trail" (default): a one-tile, four-connected dirt-path road like the hand-made ones
    (1011270, 1012102): mostly straight runs with small side-steps, wandering a little off the
    guide, and bending round natural formations. Every obstacleEvery [min, max] tiles a moss or
    slate deposit (now and then a small pond, pondChance) is laid ON the guide and the path is
    found round it (A* over a cost field: near the guide, smooth noise, existing pavement cheap).
    startOnRoad / endOnRoad: start or end on the nearest pavement tile (a T, a Y, a corner).
    fadeTiles: the last stretch breaks up and fades out. protect: [[R, C, radius], ...] keeps
    deposits away (passes, junctions); deposits also stay clear of water, mountains, buildings
    and both ends of the road.
  style "smooth": the older spline painter (width 1-3), kept for straight formal roads.

A road paves 'PA' and clears loose resources on it (trees, rocks, flowers); creatures move to the
nearest free tile they are valid on. Water, lava, mountains and buildings are never paved.
Roads are processed in order, each painted before the next is routed, so a later road can join
an earlier one.

  python3 tools/gridgen/roads.py                  # route every road, list problems (writes nothing)
  python3 tools/gridgen/roads.py --preview NAME   # ASCII view of one road over the terrain
  python3 tools/gridgen/roads.py --apply          # route and paint every road, write the layouts
"""
import json, math, os, sys, heapq, random, zlib

HERE = os.path.dirname(os.path.abspath(__file__))
GS = os.path.join(HERE, '..', '..', 'game-server')
B = os.path.join(GS, 'layouts', 'gridLayouts', 'valleyFixedCoord')
RES = json.load(open(os.path.join(GS, 'tuning', 'resources.json')))
BYKEY = {r['layoutkey']: r for r in RES if r.get('layoutkey')}
KEYOF = {r['type']: r['layoutkey'] for r in RES if r.get('layoutkey')}
TILE_LETTER = {r['layoutkey']: r['type'] for r in RES if r.get('category') == 'tile'}
BLOCK_TILES = {'WA', 'LV'}
CLEARABLE = {'source', 'doober'}
# the template generator's clump settings (tools/editor/client/layouts/GridModel.js DEFAULT_CLUMP)
CLUMP = {'clumpSize': 20, 'clumpVariation': 5, 'minClumpSize': 5, 'clumpTightness': 2.5}
NEIGHBOURS = [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)]

def coord_of(GR, GC): return 1010000 + (GR // 8) * 1000 + (GC // 8) * 100 + (GR % 8) * 10 + (GC % 8)
def origin(coord): s = str(coord); return (int(s[3]) * 8 + int(s[5])) * 64, (int(s[4]) * 8 + int(s[6])) * 64
CACHE = {}; TOUCHED = set(); BLOCKED = set()
def load(coord):
    if coord not in CACHE:
        p = os.path.join(B, f'{coord}.json')
        if os.path.exists(p):
            raw = open(p).read(); d = json.loads(raw); CACHE[coord] = (d, raw); index_blocked(coord)
        else: CACHE[coord] = None
    return CACHE[coord][0] if CACHE[coord] else None
def rtype(k): return BYKEY.get(k, {}) if k and k != '**' else {}
def index_blocked(coord):
    """World tiles under a multi-tile footprint (mountains, buildings): anchor bottom-left, up and right."""
    g = CACHE[coord][0]; R0, C0 = origin(coord)
    for y, row in enumerate(g['resources']):
        for x, k in enumerate(row):
            size = rtype(k).get('size') or 1
            if size > 1 or k == 'xx':
                for dy in range(size):
                    for dx in range(size): BLOCKED.add((R0 + y - dy, C0 + x + dx))
def cell(R, C):
    g = load(coord_of(R // 64, C // 64))
    return (g['tiles'][R % 64][C % 64], g['resources'][R % 64][C % 64]) if g else (None, None)
def setcell(R, C, tile=None, res=None):
    coord = coord_of(R // 64, C // 64); g = load(coord)
    if tile is not None: g['tiles'][R % 64][C % 64] = tile
    if res is not None: g['resources'][R % 64][C % 64] = res
    TOUCHED.add(coord)
def valid_on(k, tile): return rtype(k).get(f'validon{TILE_LETTER.get(tile)}', True)
def hard(R, C):
    """Never paved or covered: water, lava, footprints, buildings and other fixed things."""
    t, k = cell(R, C)
    if t is None or t in BLOCK_TILES or (R, C) in BLOCKED: return True
    r = rtype(k); return bool(r) and r.get('category') not in CLEARABLE and r.get('category') != 'npc'

def bump(coord, t, n):
    d = load(coord); dist = d.get('resourceDistribution')
    if isinstance(dist, dict) and t: dist[t] = max(0, (dist.get(t) or 0) + n)
def clear_for(R, C, tile, forbid):
    """Make (R, C) free for `tile`: loose resources go, a creature moves to a valid free tile."""
    t, k = cell(R, C); coord = coord_of(R // 64, C // 64)
    if not k or k == '**': return
    r = rtype(k)
    if r.get('category') == 'npc':
        for d in range(1, 12):
            for RR in range(R - d, R + d + 1):
                for CC in range(C - d, C + d + 1):
                    if coord_of(RR // 64, CC // 64) != coord or (RR, CC) in forbid: continue
                    tt, kk = cell(RR, CC)
                    if kk == '**' and tt not in BLOCK_TILES | {'PA'} and (RR, CC) not in BLOCKED and valid_on(k, tt):
                        setcell(RR, CC, res=k); setcell(R, C, res='**'); return
        setcell(R, C, res='**')            # nowhere valid nearby (never seen): it is dropped
    else:
        bump(coord, r.get('type'), -1); setcell(R, C, res='**')

# ----------------------------------------------------------------------------- shared geometry
def catmull(pts, step=0.5):
    out = []; P = [pts[0]] + pts + [pts[-1]]
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i-1], P[i], P[i+1], P[i+2]
        n = max(1, int(math.dist(p1, p2) / step))
        for k in range(n):
            t = k / n; t2 = t*t; t3 = t2*t
            out.append(tuple(0.5*((2*p1[j]) + (-p0[j]+p2[j])*t + (2*p0[j]-5*p1[j]+4*p2[j]-p3[j])*t2 + (-p0[j]+3*p1[j]-3*p2[j]+p3[j])*t3) for j in (0, 1)))
    out.append(tuple(pts[-1])); return out
def hash01(a, b, s=0):
    h = (a * 374761393 + b * 668265263 + s * 1442695041) & 0xffffffff; h = ((h ^ (h >> 13)) * 1274126177) & 0xffffffff
    return ((h ^ (h >> 16)) & 0xffffffff) / 4294967296
def vnoise(R, C, cellsize, s):
    fy, fx = R / cellsize, C / cellsize; iy, ix = math.floor(fy), math.floor(fx); ty, tx = fy - iy, fx - ix
    sy, sx = ty * ty * (3 - 2 * ty), tx * tx * (3 - 2 * tx)
    a = hash01(ix, iy, s) * (1 - sx) + hash01(ix + 1, iy, s) * sx; b = hash01(ix, iy + 1, s) * (1 - sx) + hash01(ix + 1, iy + 1, s) * sx
    return a * (1 - sy) + b * sy
def nearest_pa(P, radius=10):
    best = None
    for R in range(int(P[0]) - radius, int(P[0]) + radius + 1):
        for C in range(int(P[1]) - radius, int(P[1]) + radius + 1):
            if cell(R, C)[0] == 'PA':
                d = math.dist((R, C), P)
                if best is None or d < best[0]: best = (d, (R, C))
    return best[1] if best else None

# ----------------------------------------------------------------------------- trail style
def make_lake(rng, seed, gr, gc, nr, nc, protect, formations):
    """A pond or small lake beside the guide at (gr, gc), n = the guide's unit normal: two to four
    overlapping roughened ovals (bean, kidney, lobed), centred a little off the line so the guide
    clips its edge and the road wraps round the shore. None if it would touch anything fixed,
    pavement, a protected spot or another formation."""
    side = rng.choice([-1, 1]); size = rng.uniform(7.0, 12.0)
    lc = (gr + nr * side * size * 0.55, gc + nc * side * size * 0.55)
    lobes = []
    for _ in range(rng.randint(2, 4)):
        a = rng.uniform(0, 2 * math.pi); d = rng.uniform(0, size * 0.75)
        lobes.append((lc[0] + math.sin(a) * d, lc[1] + math.cos(a) * d, rng.uniform(size * 0.5, size * 0.9), rng.uniform(1.0, 1.9), rng.uniform(0, math.pi)))
    span = int(size * 2.2) + 3; tiles = []
    for R in range(int(lc[0]) - span, int(lc[0]) + span + 1):
        for C in range(int(lc[1]) - span, int(lc[1]) + span + 1):
            rough = (vnoise(R, C, 2.5, seed + 21) - 0.5) * 1.8 + (vnoise(R, C, 7, seed + 23) - 0.5) * 2.4
            for (yr, yc, rad, st, ang) in lobes:
                u = (R - yr) * math.cos(ang) + (C - yc) * math.sin(ang); v = -(R - yr) * math.sin(ang) + (C - yc) * math.cos(ang)
                if math.hypot(u / st, v) + rough <= rad: tiles.append((R, C)); break
    if len(tiles) < 60: return None
    tset = set(tiles)
    for (R, C) in tiles:
        for dR in range(-3, 4):
            for dC in range(-3, 4):
                t = (R + dR, C + dC)
                if t in formations or hard(*t) or cell(*t)[0] == 'PA': return None
        if any(math.dist((R, C), (pr, pc)) < prad for (pr, pc, prad) in protect): return None
    return tiles

def trail(road):
    rng = random.Random(zlib.crc32(road['name'].encode()))
    seed = zlib.crc32(road['name'].encode()) % 10000
    guide = catmull([tuple(p) for p in road['points']])
    cum = [0.0]
    for i in range(1, len(guide)): cum.append(cum[-1] + math.dist(guide[i-1], guide[i]))
    L = cum[-1]
    for R in range(int(min(p[0] for p in guide)) - 24, int(max(p[0] for p in guide)) + 25, 16):
        for C in range(int(min(p[1] for p in guide)) - 24, int(max(p[1] for p in guide)) + 25, 16): load(coord_of(R // 64, C // 64))
    start = tuple(map(round, guide[0])); end = tuple(map(round, guide[-1]))
    if road.get('startOnRoad'): start = nearest_pa(guide[0]) or start
    goal_tiles = None
    if road.get('endOnRoad'):
        e = nearest_pa(guide[-1]); end = e or end
        goal_tiles = {(R, C) for R in range(end[0] - 3, end[0] + 4) for C in range(end[1] - 3, end[1] + 4) if cell(R, C)[0] == 'PA'}

    # distance to the guide, for every tile of the corridor (D tiles either side)
    D = road.get('corridorTiles', 30); dist = {}
    for (gr, gc) in guide[::2]:
        for R in range(int(gr) - D, int(gr) + D + 2):
            for C in range(int(gc) - D, int(gc) + D + 2):
                d = math.hypot(R - gr, C - gc)
                if d <= D and d < dist.get((R, C), 1e9): dist[(R, C)] = d

    # natural formations ON the guide (moss, slate, the odd pond); the path goes round them
    protect = [tuple(p) for p in road.get('protect', [])] + [(*start, 16), (*end, 16)]
    lo, hi = road.get('obstacleEvery', [38, 70]); pond = road.get('pondChance', 0.4)
    formations = {}; s = rng.uniform(20, lo)
    while s < L - 20:
        i = min(range(len(cum)), key=lambda j: abs(cum[j] - s))
        (gr, gc) = guide[i]; a = guide[max(0, i - 2)]; b = guide[min(len(guide) - 1, i + 2)]
        nr, nc = -(b[1] - a[1]), b[0] - a[0]; nl = math.hypot(nr, nc) or 1
        kind = 'WA' if rng.random() < pond else rng.choice(['ZZ', 'ZZ', 'SL'])
        if kind == 'WA':
            lake = make_lake(rng, seed, gr, gc, nr / nl, nc / nl, protect, formations)
            if lake:
                for t in lake: formations[t] = 'WA'
                s += rng.uniform(lo, hi) * 1.4      # a lake takes room: the next formation comes later
                continue
            kind = rng.choice(['ZZ', 'SL'])        # no room for a lake here: a deposit instead
        off = rng.uniform(-1.5, 1.5); cr, cc = gr + nr / nl * off, gc + nc / nl * off
        # a deposit grown the way the template generator grows them (tools/editor/client/layouts/
        # GridModel.js generateClumps with DEFAULT_CLUMP): from one seed tile, adding neighbours
        # weighted by (tiles of the clump they touch) ^ clumpTightness, to clumpSize +- clumpVariation
        seed_t = (round(cr), round(cc))
        ring_ok = all(not hard(R, C) and cell(R, C)[0] != 'PA' for R in range(seed_t[0] - 7, seed_t[0] + 8) for C in range(seed_t[1] - 7, seed_t[1] + 8))
        near_bad = any(math.dist(seed_t, (pr, pc)) < prad + 4 for (pr, pc, prad) in protect)
        if ring_ok and not near_bad:
            target = min(99, max(CLUMP['minClumpSize'], CLUMP['clumpSize'] + rng.randint(-CLUMP['clumpVariation'], CLUMP['clumpVariation'])))
            tiles = [seed_t]; inset = {seed_t}
            ok = lambda t: t not in formations and not hard(*t) and cell(*t)[0] != 'PA' and math.dist(t, seed_t) <= 7
            while len(tiles) < target:
                cand = {}
                for (R, C) in tiles:
                    for dR, dC in NEIGHBOURS:
                        n = (R + dR, C + dC)
                        if n in inset or n in cand or not ok(n): continue
                        adj = sum(1 for aR, aC in NEIGHBOURS if (n[0] + aR, n[1] + aC) in inset)
                        cand[n] = adj ** CLUMP['clumpTightness']
                if not cand: break
                pick = rng.random() * sum(cand.values())
                for n, w in cand.items():
                    pick -= w
                    if pick <= 0: break
                tiles.append(n); inset.add(n)
            for t in tiles: formations[t] = kind
        s += rng.uniform(lo, hi)

    # tiles beside water (a new lake or one already there): the route hugs the shore
    shore = set()
    for t in dist:
        if t in formations or hard(*t): continue
        if any(formations.get((t[0] + dR, t[1] + dC)) == 'WA' or cell(t[0] + dR, t[1] + dC)[0] == 'WA' for dR, dC in NEIGHBOURS): shore.add(t)
    # A*: four-connected, near the guide, wandering with smooth noise; formations and hard tiles closed
    def cost(t):
        if t not in dist or t in formations or hard(*t): return None
        base = 0.35 if cell(*t)[0] == 'PA' else (0.55 if t in shore else 1.0)
        return base + 0.35 * (dist[t] / 8) ** 2 + 2.2 * vnoise(t[0], t[1], 14, seed) + 0.8 * vnoise(t[0], t[1], 5, seed + 1)
    goal = goal_tiles or {end}
    openh = [(0, 0, start)]; came = {start: None}; g = {start: 0}; found = None
    while openh:
        _, gc_, cur = heapq.heappop(openh)
        if cur in goal: found = cur; break
        if gc_ > g.get(cur, 1e18): continue
        for dR, dC in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (cur[0] + dR, cur[1] + dC); c = cost(n)
            if c is None: continue
            ng = g[cur] + c
            if ng < g.get(n, 1e18):
                g[n] = ng; came[n] = cur
                heapq.heappush(openh, (ng + 0.35 * (abs(n[0] - end[0]) + abs(n[1] - end[1])), ng, n))
    if not found: return None, formations, 'no path (blocked?)'
    path = []; t = found
    while t: path.append(t); t = came[t]
    path.reverse()
    fade = road.get('fadeTiles', 0)
    if fade:
        keep = []
        for i, t in enumerate(path):
            left = len(path) - 1 - i
            if left < fade and hash01(t[0], t[1], seed + 3) > (left / fade) ** 0.8 * 0.95: continue
            keep.append(t)
        path = keep
    return path, formations, None

def paint_trail(path, formations):
    pset = set(path)
    for (R, C), kind in formations.items():
        clear_for(R, C, kind, pset | set(formations))
        setcell(R, C, tile=kind)
    for (R, C) in path:
        clear_for(R, C, 'PA', pset | set(formations)); setcell(R, C, tile='PA')
    # a little dressing: rocks on slate, a mushroom or tulip on moss (both valid there)
    by_kind = {}
    for t, kind in formations.items(): by_kind.setdefault(kind, []).append(t)
    for kind, tiles in by_kind.items():
        dress = {'SL': ['Rocks'], 'ZZ': ['Mushroom', 'Tulip']}.get(kind)
        if not dress: continue
        for t in tiles:
            if hash01(t[0], t[1], 91) < 0.12 and cell(*t)[1] == '**':
                ty = dress[int(hash01(t[0], t[1], 92) * len(dress))]
                if ty in KEYOF and valid_on(KEYOF[ty], kind):
                    setcell(*t, res=KEYOF[ty]); bump(coord_of(t[0] // 64, t[1] // 64), ty, 1)

# ----------------------------------------------------------------------------- smooth style (formal roads)
def smooth_cells(road):
    width = road.get('width', 2); fade = road.get('fadeTiles', 0)
    samp = catmull([tuple(p) for p in road['points']], 0.2)
    cum = [0.0]
    for i in range(1, len(samp)): cum.append(cum[-1] + math.dist(samp[i-1], samp[i]))
    L = cum[-1]; cells = []; seen = set()
    for i, (r, c) in enumerate(samp):
        a = samp[max(0, i-1)]; b = samp[min(len(samp)-1, i+1)]; dr, dc = b[0]-a[0], b[1]-a[1]
        base = (round(r), round(c)); left = L - cum[i]
        if fade and left < fade:
            if hash01(*base) > (left / fade) ** 0.8 * 0.95: continue
            group = [base]
        else:
            off = (0, 1) if abs(dr) >= abs(dc) else (1, 0)
            group = [base, (base[0]+off[0], base[1]+off[1])][:max(1, min(2, width))]
            if width >= 3: group.append((base[0]-off[0], base[1]-off[1]))
        for cc in group:
            if cc not in seen: seen.add(cc); cells.append(cc)
    for (R, C) in cells: load(coord_of(R // 64, C // 64))
    problems = [(R, C) for (R, C) in cells if hard(R, C)]
    return cells, problems

def preview(path, formations, pad=4):
    S = set(path); rs = [r for r, _ in path]; cs = [c for _, c in path]
    T = {'GR': '.', 'WA': '~', 'SL': ':', 'DI': ',', 'SA': '_', 'LV': '^', 'PA': '=', 'ZZ': '"', 'CY': '%', 'CB': '#'}
    for R in range(min(rs)-pad, max(rs)+pad+1):
        line = ''
        for C in range(min(cs)-pad, max(cs)+pad+1):
            t, k = cell(R, C)
            if (R, C) in S: ch = '='
            elif (R, C) in formations: ch = {'WA': 'O', 'ZZ': 'm', 'SL': 's'}[formations[(R, C)]]
            elif t is None: ch = ' '
            elif (R, C) in BLOCKED: ch = 'M'
            else: ch = T.get(t, '?')
            if C % 64 == 0 and ch in '.,:"_%': ch = '|'
            line += ch
        print(f'{R:5d} {line}')

def save():
    for coord in sorted(TOUCHED):
        d, raw = CACHE[coord]
        compact = raw == json.dumps(json.loads(raw), separators=(',', ':'))
        out = json.dumps(d, separators=(',', ':')) if compact else json.dumps(d, indent=2) + ('\n' if raw.endswith('\n') else '')
        open(os.path.join(B, f'{coord}.json'), 'w').write(out)

if __name__ == '__main__':
    roads = json.load(open(os.path.join(HERE, 'data', 'roads.json')))['roads']
    args = sys.argv[1:]; want = args[args.index('--preview') + 1] if '--preview' in args else None
    bad = False
    for road in roads:
        if road.get('style', 'trail') == 'smooth':
            cells, problems = smooth_cells(road)
            print(f"{road['name']}: smooth, {len(cells)} tiles, {len(problems)} problems", problems[:6] if problems else '')
            if problems: bad = True; continue
            for (R, C) in cells: clear_for(R, C, 'PA', set(cells)); setcell(R, C, tile='PA')
            continue
        path, formations, err = trail(road)
        nform = len({(round(r / 1), round(c / 1)) for (r, c) in formations})
        print(f"{road['name']}: trail, {len(path) if path else 0} tiles, {nform} formation tiles" + (f", PROBLEM: {err}" if err else ''))
        if err: bad = True; continue
        if want == road['name']: preview(path, formations)
        paint_trail(path, formations)
    if '--apply' in args:
        if bad: sys.exit('not written: fix the problems first')
        save(); print('wrote', sorted(TOUCHED))
