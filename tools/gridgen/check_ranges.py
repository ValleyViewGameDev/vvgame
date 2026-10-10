"""Prove mountain ranges are sealed (players step in 8 directions, diagonals between blockers too).
   python3 tools/gridgen/check_ranges.py [candidateDir]
   For each range: tiles in a corridor round its crest, split into the two sides; a breadth-first
   search over tiles NOT under a mountain footprint must not reach one side from the other
   (tips excluded, a range is meant to be walked round). Also prints leaks' positions."""
import json, os, sys, math
HERE = os.path.dirname(os.path.abspath(__file__))
GS = os.path.join(HERE, '..', '..', 'game-server')
FIXED = os.path.join(GS, 'layouts', 'gridLayouts', 'valleyFixedCoord')
cand = sys.argv[1] if len(sys.argv) > 1 else None
SIZE = {'m1': 3, 'm2': 4}
coord = lambda fr, fc: 1010000 + (fr // 8) * 1000 + (fc // 8) * 100 + (fr % 8) * 10 + (fc % 8)
cache = {}
def layout(fr, fc):
    c = coord(fr, fc)
    if c not in cache:
        p = os.path.join(cand, f'{c}.json') if cand and os.path.exists(os.path.join(cand, f'{c}.json')) else os.path.join(FIXED, f'{c}.json')
        cache[c] = json.load(open(p)) if os.path.exists(p) else None
    return cache[c]
blocked_cache = {}
def blocked_cell(fr, fc):
    if (fr, fc) in blocked_cache: return blocked_cache[(fr, fc)]
    L = layout(fr, fc); b = bytearray(4096)
    if L:
        for y in range(64):
            for x in range(64):
                s = SIZE.get(L['resources'][y][x])
                if s:
                    for dy in range(s):
                        for dx in range(s):
                            if y - dy >= 0 and x + dx < 64: b[(y - dy) * 64 + x + dx] = 1
    blocked_cache[(fr, fc)] = b
    return b
def blocked(X, Y):
    return blocked_cell(Y // 64, X // 64)[(Y % 64) * 64 + (X % 64)] == 1
def catmull(p0, p1, p2, p3, t):
    t2, t3 = t * t, t * t * t
    return tuple(0.5 * ((2 * p1[i]) + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3) for i in range(2))
ranges = json.load(open(os.path.join(HERE, 'data', 'mountains.json')))['ranges']
ok_all = True
for rg in ranges:
    P = [(c * 64, r * 64) for r, c in rg['points']]; Q = [P[0]] + P + [P[-1]]; pts = []
    for i in range(1, len(Q) - 2):
        seg = max(4, int(math.hypot(Q[i + 1][0] - Q[i][0], Q[i + 1][1] - Q[i][1]) * 1.5))
        pts += [catmull(Q[i - 1], Q[i], Q[i + 1], Q[i + 2], k / seg) for k in range(seg)]
    n = len(pts); lo, hi = int(n * 0.08), int(n * 0.92)
    W = rg['halfWidthTiles'][1] + 22
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    side = {}
    for Y in range(int(min(ys) - W), int(max(ys) + W)):
        for X in range(int(min(xs) - W), int(max(xs) + W)):
            best, bi = 1e18, 0
            for i in range(0, n, 2):
                d = (pts[i][0] - X) ** 2 + (pts[i][1] - Y) ** 2
                if d < best: best, bi = d, i
            if best > W * W or not (lo <= bi <= hi): continue
            a = pts[max(0, bi - 2)]; b = pts[min(n - 1, bi + 2)]
            cr = (b[0] - a[0]) * (Y - a[1]) - (b[1] - a[1]) * (X - a[0])
            side[(X, Y)] = (1 if cr > 0 else -1, math.sqrt(best))
    far = rg['halfWidthTiles'][1] + 12
    seeds = [k for k, (s, d) in side.items() if s < 0 and d > far and not blocked(*k)]
    seen = set(seeds); stack = list(seeds); leak = None
    while stack and not leak:
        X, Y = stack.pop()
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                k = (X + dx, Y + dy)
                if k in seen or k not in side or blocked(*k): continue
                seen.add(k)
                if side[k][0] > 0 and side[k][1] > far: leak = k; break
                stack.append(k)
            if leak: break
    status = 'SEALED' if not leak else f'LEAK reaching {leak} (frontier row {leak[1]/64:.2f}, col {leak[0]/64:.2f})'
    if leak: ok_all = False
    print(f"{rg['name']}: {status}  ({len(seeds)} seed tiles, {len(seen)} reached)")
for ck in json.load(open(os.path.join(HERE, 'data', 'mountains.json'))).get('checks', []):
    r0, c0, r1, c1 = [int(v * 64) for v in ck['box']]
    src = (int(ck['from'][1] * 64), int(ck['from'][0] * 64)); dst = (int(ck['to'][1] * 64), int(ck['to'][0] * 64))
    seen = {src}; stack = [src]; found = False
    while stack and not found:
        X, Y = stack.pop()
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                k = (X + dx, Y + dy)
                if k in seen or not (c0 <= k[0] < c1 and r0 <= k[1] < r1) or blocked(*k): continue
                if k == dst: found = True; break
                seen.add(k); stack.append(k)
            if found: break
    if found: ok_all = False
    print(f"check {ck['name']}: {'LEAK (a path crosses)' if found else 'SEALED'}  ({len(seen)} tiles reached)")
sys.exit(0 if ok_all else 1)
