"""
Haunted River, pass 1 (redo, 2026-10-09): GEOGRAPHY + SET OVERLAYS only. docs/making-original-grids.md

Step 1 of 2. Draws the section on one 192x128 canvas (3 grids wide, 2 tall) and writes, per grid:
  - base:    64x64 tile keys, only WA (water) and PA (pavement); everything else '**'. These are
             the two tile types the editor's Quick Generate keeps.
  - overlay: cells the hand-made sets force afterwards: {r, c, tile|null, res|null}; res '' clears.
  - areas:   named cell lists (meadow, hollow, island) step 2 relocates template resources into.
Step 2 (haunted_river_02_qg.mjs) runs the editor's real quickGenerate() on each base and applies
the overlays.

   world x 0-63      64-127     128-191
   y   0-63   A 1015166  B 1015167  C 1015260     (frontier row 46, cols 14, 15, 16)
   y  64-127  D 1015176  E 1015177  F 1015270     (frontier row 47)
"""
import json, math, random, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
GS = os.path.join(HERE, '..', '..', 'game-server')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'out')
os.makedirs(OUT, exist_ok=True)
RES = json.load(open(GS + '/tuning/resources.json'))
BY_KEY = {r['layoutkey']: r for r in RES if r.get('layoutkey')}
W, H = 192, 128
rng = random.Random(4614)

GRIDS = {
    'A': (1015166, 0, 0, 'valley1'), 'B': (1015167, 64, 0, 'valley1'), 'C': (1015260, 128, 0, 'valley2'),
    'D': (1015176, 0, 64, 'valley1'), 'E': (1015177, 64, 64, 'valley1'), 'F': (1015270, 128, 64, 'valley2'),
}
def grid_of(x, y):
    for n, (_, x0, y0, _) in GRIDS.items():
        if x0 <= x < x0 + 64 and y0 <= y < y0 + 64: return n
def inb(x, y): return 0 <= x < W and 0 <= y < H

base = [['**'] * W for _ in range(H)]          # 'WA' / 'PA' / '**'
otile = [[None] * W for _ in range(H)]         # overlay tile key
ores = [[None] * W for _ in range(H)]          # overlay resource type ('' = clear)
areas = {}                                     # name -> list of (x, y)

def make_noise(cell, seed):
    r = random.Random(seed)
    gw, gh = (W + 120) // cell + 3, (H + 60) // cell + 3
    g = [[r.random() for _ in range(gw)] for _ in range(gh)]
    def f(x, y):
        fx, fy = x / cell, y / cell
        ix, iy = int(fx), int(fy); tx, ty = fx - ix, fy - iy
        sx, sy = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
        a = g[iy][ix] * (1 - sx) + g[iy][ix + 1] * sx
        b = g[iy + 1][ix] * (1 - sx) + g[iy + 1][ix + 1] * sx
        return a * (1 - sy) + b * sy
    return f
n_bank = make_noise(5, 4)

# ---------------------------------------------------------------- river: from phase1_build.mjs
# The Haunted River is drawn once, valley-wide, by phase1_build.mjs (data/rivers.json); its water
# for these six grids is in data/pilot-water.json. Run phase1_build.mjs first.
import base64
PW = json.load(open(os.path.join(HERE, 'data', 'pilot-water.json')))['water']
for name, (coord, x0, y0, _) in GRIDS.items():
    m = base64.b64decode(PW[str(coord)])
    for y in range(64):
        for x in range(64):
            if m[y * 64 + x]: base[y0 + y][x0 + x] = 'WA'
# the mere in E, and the Scriptorium island in it
def ell(x, y, c, r): return ((x - c[0]) / r[0]) ** 2 + ((y - c[1]) / r[1]) ** 2
for y in range(H):
    for x in range(W):
        if ell(x, y, (84, 104), (17, 12)) + 0.25 * (n_bank(x, y) - 0.5) <= 1: base[y][x] = 'WA'
island = []
for y in range(H):
    for x in range(W):
        if ell(x, y, (85, 103), (9.5, 6.5)) + 0.18 * (n_bank(x + 50, y) - 0.5) <= 1:
            base[y][x] = '**'; island.append((x, y))
areas['island'] = island

# ---------------------------------------------------------------- roads (pavement)
def lay_road(points, width=1):
    for (ax, ay), (bx, by) in zip(points, points[1:]):
        steps = max(abs(bx - ax), abs(by - ay)) * 2 + 1
        for i in range(steps + 1):
            t = i / steps
            x, y = round(ax + (bx - ax) * t), round(ay + (by - ay) * t)
            for dx in range(width):
                if inb(x + dx, y): base[y][x + dx] = 'PA'

def force(x, y, tile=None, res=None):
    if tile is not None: otile[y][x] = tile
    if res is not None: ores[y][x] = res

# the Old Ferry Landing sits just off the river's east bank on row 31 of A
LY = 31
_wet = [x for x in range(0, 64) if base[LY][x] == 'WA']
LX = (max(_wet) + 5) if _wet else 27            # just off the river's east bank

# ---------------------------------------------------------------- town: valleyTown02 in B
town = json.load(open(GS + '/layouts/gridLayouts/miniTemplates/valleyTown02.json'))
TX, TY = 64 + 30, 14
for ty in range(-2, 17):
    for tx in range(-2, 17):
        force(TX + tx, TY + ty, 'GR', '')                      # clearing round the walls
for ty, row in enumerate(town['tiles']):
    for tx, k in enumerate(row):
        if k not in ('**', ''): force(TX + tx, TY + ty, k, '')
for ty, row in enumerate(town['resources']):
    for tx, k in enumerate(row):
        if k not in ('**', '') and k in BY_KEY: force(TX + tx, TY + ty, None, BY_KEY[k]['type'])
YARD = (TX + 2, TY + 14)
lay_road([(YARD[0], YARD[1] + 2), (YARD[0] - 3, YARD[1] + 10), (YARD[0] - 2, 46), (YARD[0] - 6, 58), (88, 70), (86, 80), (86, 88)])   # Ferry Road
lay_road([(YARD[0] - 2, YARD[1] + 1), (80, 30), (66, 32), (52, 31), (max(40, LX + 8), 30), (LX + 4, 31)])                         # Landing Lane
lay_road([(86, 88), (85, 93), (83, 96), (82, 98)], width=2)                                                                          # causeway

# ---------------------------------------------------------------- Old Ferry Landing (A)
for y in range(LY - 3, LY + 4):
    for x in range(LX - 5, LX + 4):
        if base[y][x] != 'WA': force(x, y, 'SA', '')
for (dx, dy, t) in [(-3, -2, 'Crate'), (-2, -2, 'Barrel'), (-4, -1, 'Sack'), (2, 2, 'Crate'), (-4, 2, 'Barrel'), (1, -3, 'Flag')]:
    if base[LY + dy][LX + dx] != 'WA': force(LX + dx, LY + dy, None, t)

# ---------------------------------------------------------------- the Drowned Scriptorium (E island)
RX, RY = 80, 99
for y in range(RY, RY + 8):
    for x in range(RX, RX + 11): force(x, y, 'CB', '')
gaps = {(RX + 5, RY + 7), (RX + 6, RY + 7), (RX + 10, RY + 3), (RX + 2, RY), (RX + 3, RY), (RX + 8, RY)}
walls = [(x, RY) for x in range(RX, RX + 11)] + [(x, RY + 7) for x in range(RX, RX + 11)] + \
        [(RX, y) for y in range(RY, RY + 8)] + [(RX + 10, y) for y in range(RY, RY + 8)]
for (x, y) in walls:
    if (x, y) not in gaps and rng.random() > 0.12: force(x, y, None, 'Stone Wall')
for (dx, dy), t in {
    (5, 3): 'Fountain', (2, 2): 'Stack of Books', (3, 2): 'Stack of Books', (2, 5): 'Stack of Books',
    (8, 2): 'Bed', (8, 5): 'Chair', (3, 5): 'Chair',
    (4, 1): 'Scroll', (7, 4): 'Scroll', (9, 6): 'Scroll', (1, 3): 'Scroll',
    (6, 6): 'Ink', (4, 6): 'Book', (9, 1): 'Book', (7, 1): 'Ancient Coin',
}.items(): force(RX + dx, RY + dy, None, t)
for (x, y) in [(93, 100), (93, 103), (92, 106)]: force(x, y, 'DI', 'Ghost Spawner')    # monks' tombstones
for (x, y) in [(91, 101), (90, 105), (89, 108)]: force(x, y, None, 'Ghost')
for (x, y) in [(94, 101), (91, 104), (88, 97), (77, 104)]:
    if base[y][x] != 'WA': force(x, y, 'DI', 'Bones')
for (x, y) in [(86, 87), (88, 86)]:
    if base[y][x] == '**': force(x, y, 'GR', 'Garlic')
for (x, y) in island:                                       # keep the island open round the ruin
    if otile[y][x] is None and ores[y][x] is None and rng.random() < 0.7: force(x, y, None, '')

# ---------------------------------------------------------------- spider hollow (F) and bee meadow (C)
hollow, meadow = [], []
for y in range(H):
    for x in range(128, W):
        if ((x - 160) / 13) ** 2 + ((y - 100) / 10) ** 2 + 0.3 * (n_bank(x, y) - 0.5) <= 1:
            force(x, y, 'DI' if rng.random() < 0.85 else 'ZZ', ''); hollow.append((x, y))
        if ((x - 160) / 12) ** 2 + ((y - 30) / 9) ** 2 + 0.3 * (n_bank(x + 7, y) - 0.5) <= 1:
            force(x, y, 'GR', ''); meadow.append((x, y))
for (x, y) in hollow:                                       # dead trees in the hollow
    if otile[y][x] == 'DI' and rng.random() < 0.08: force(x, y, None, 'Dead Tree')
for (x, y) in [(156, 27), (165, 33)]:                       # hollow trees the bees live in
    force(x, y, 'GR', 'Big Dead Tree')
    for dy in range(2):
        for dx in range(2):
            if (dx, dy) != (0, 0): force(x + dx, y - dy, 'GR', '')
areas['hollow'] = [p for p in hollow if otile[p[1]][p[0]] == 'DI' and ores[p[1]][p[0]] == '']
areas['meadow'] = [p for p in meadow if ores[p[1]][p[0]] == '']

# ---------------------------------------------------------------- write per grid
for name, (coord, x0, y0, vt) in GRIDS.items():
    out = {
        'name': name, 'gridCoord': coord, 'valleyType': vt,
        'base': [[base[y][x] for x in range(x0, x0 + 64)] for y in range(y0, y0 + 64)],
        'overlay': [{'r': y - y0, 'c': x - x0, 'tile': otile[y][x], 'res': ores[y][x]}
                    for y in range(y0, y0 + 64) for x in range(x0, x0 + 64) if otile[y][x] is not None or ores[y][x] is not None],
        'areas': {k: [[y - y0, x - x0] for (x, y) in v if grid_of(x, y) == name] for k, v in areas.items()},
    }
    json.dump(out, open(f'{OUT}/{coord}.geo.json', 'w'))
    print(name, coord, vt, 'overlay cells', len(out['overlay']), {k: len(v) for k, v in out['areas'].items() if v})
