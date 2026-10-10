"""Mountain seams between grids: wherever a mountain covers the edge tile of one grid, the matching
edge tile of its neighbour should be covered too (unless it is water). Prints every mismatch.
   python3 tools/gridgen/check_seams.py [candidateDir]"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
FIXED = os.path.join(HERE, '..', '..', 'game-server', 'layouts', 'gridLayouts', 'valleyFixedCoord')
cand = sys.argv[1] if len(sys.argv) > 1 else None
SZ = {'m1': 3, 'm2': 4}
coord = lambda fr, fc: 1010000 + (fr // 8) * 1000 + (fc // 8) * 100 + (fr % 8) * 10 + (fc % 8)
cache = {}
def grid(fr, fc):
    if (fr, fc) in cache: return cache[(fr, fc)]
    c = coord(fr, fc); p = os.path.join(cand, f'{c}.json') if cand and os.path.exists(os.path.join(cand, f'{c}.json')) else os.path.join(FIXED, f'{c}.json')
    if not (0 <= fr < 64 and 0 <= fc < 64) or not os.path.exists(p): cache[(fr, fc)] = None; return None
    L = json.load(open(p)); b = bytearray(4096)
    for y in range(64):
        for x in range(64):
            s = SZ.get(L['resources'][y][x])
            if s:
                for dy in range(s):
                    for dx in range(s):
                        if y - dy >= 0 and x + dx < 64: b[(y - dy) * 64 + x + dx] = 1
    cache[(fr, fc)] = (b, L['tiles'])
    return cache[(fr, fc)]
total = 0; seams = []
for fr in range(64):
    for fc in range(64):
        A = grid(fr, fc)
        if not A or not any(A[0]): continue
        for dr, dc in ((0, 1), (1, 0), (0, -1), (-1, 0)):
            B = grid(fr + dr, fc + dc)
            if not B: continue
            bad = 0
            for i in range(64):
                ax, ay = (63, i) if dc == 1 else (0, i) if dc == -1 else (i, 63) if dr == 1 else (i, 0)
                bx, by = (0, i) if dc == 1 else (63, i) if dc == -1 else (i, 0) if dr == 1 else (i, 63)
                if A[0][ay * 64 + ax] and not B[0][by * 64 + bx] and B[1][by][bx] != 'WA': bad += 1
            if bad: seams.append((coord(fr, fc), coord(fr + dr, fc + dc), bad)); total += bad
for s in seams: print(f'  {s[0]} -> {s[1]}: {s[2]} edge tiles covered on one side only')
print(f'seam mismatches: {total} tiles across {len(seams)} grid edges')
