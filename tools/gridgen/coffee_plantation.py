"""The Strathmoore coffee plantation on grid 1012165 (owner request, 2026-11-05).

Coffee grows only in Strathmoore (resources.json Coffee Plant growregion; docs/tuning.md 4m), and
this is its showpiece: a stone-walled plantation in the middle of the grid, two coffee fields in
planted rows (40 Coffee Cherries: they replant themselves when picked, and leave 10 of the Coffee
Plant's 50-per-grid cap for the player), a stepstone avenue and cross path, a mini lake with
shrubs and a marble statue, a cobbled yard with the Coffee Factory, its barrels, crates and sacks,
stone lions at the east gate and busts at the crossing. Pavement leads east out of the gate to
the grid's edge, where the trail "Plantation road east to Caliban's Crossing" (data/roads.json)
takes over.

  python3 tools/gridgen/coffee_plantation.py           # ASCII preview, writes nothing
  python3 tools/gridgen/coffee_plantation.py --apply   # writes valleyFixedCoord/1012165.json

Run it on the Quick Generate file (it clears its own footprint); 1012165 is marked ownerEdited in
data/phase1-manifest.json so phase1_build.mjs never regenerates it.
"""
import json, math, os, random, sys

HERE = os.path.dirname(os.path.abspath(__file__))
GS = os.path.join(HERE, '..', '..', 'game-server')
FILE = os.path.join(GS, 'layouts', 'gridLayouts', 'valleyFixedCoord', '1012165.json')
RES = json.load(open(os.path.join(GS, 'tuning', 'resources.json')))
BYKEY = {r['layoutkey']: r for r in RES if r.get('layoutkey')}
KEY = {r['type']: r['layoutkey'] for r in RES if r.get('layoutkey')}
LETTER = {r['layoutkey']: r['type'] for r in RES if r.get('category') == 'tile'}
rng = random.Random(1012165)

raw = open(FILE).read(); L = json.loads(raw); T = L['tiles']; R = L['resources']
before = {}
for row in R:
    for k in row:
        if k != '**': before[k] = before.get(k, 0) + 1

# ---- footprint --------------------------------------------------------------------------------
WY0, WY1, WX0, WX1 = 17, 46, 12, 51           # the wall ring (inclusive)
GATES = {(31, WX1), (32, WX1), (31, WX0), (32, WX0)}
CLEAR = (WY0 - 2, WY1 + 2, WX0 - 2, WX1 + 2)  # inside + a two-tile cleared margin

def inside(y, x): return WY0 < y < WY1 and WX0 < x < WX1
def put(y, x, key): R[y][x] = key
def tile(y, x, t): T[y][x] = t

# creatures in the footprint move out to a free grass tile beyond the margin
movers = []
for y in range(CLEAR[0], CLEAR[1] + 1):
    for x in range(CLEAR[2], CLEAR[3] + 1):
        k = R[y][x]
        if inside(y, x) or (y, x) in GATES: T[y][x] = 'GR'          # a clean lawn inside the walls
        elif T[y][x] not in ('GR', 'DI'): T[y][x] = 'GR'
        if k == '**': continue
        if BYKEY.get(k, {}).get('category') == 'npc': movers.append(k)
        R[y][x] = '**'

def free_outside():
    while True:
        y, x = rng.randrange(2, 62), rng.randrange(2, 62)
        if CLEAR[0] - 1 <= y <= CLEAR[1] + 1 and CLEAR[2] - 1 <= x <= CLEAR[3] + 1: continue
        if R[y][x] == '**' and T[y][x] == 'GR': return y, x
for k in movers:
    y, x = free_outside(); put(y, x, k)

# ---- wall --------------------------------------------------------------------------------------
for y in range(WY0, WY1 + 1):
    for x in range(WX0, WX1 + 1):
        on_ring = y in (WY0, WY1) or x in (WX0, WX1)
        if on_ring and (y, x) not in GATES: put(y, x, KEY['Stone Wall'])

# ---- paths: the avenue (gate to gate) and the cross path, stepstones ---------------------------
for x in range(WX0, WX1 + 1):
    tile(31, x, 'SP'); tile(32, x, 'SP')
for y in range(WY0 + 1, WY1):
    tile(y, 34, 'SP')

# ---- coffee fields: planted rows of dirt, cherries staggered every fourth tile ----------------
cherries = 0
for block in ((20, 22, 24, 26, 28), (35, 37, 39, 41, 43)):
    for i, y in enumerate(block):
        for x in range(16, 32): tile(y, x, 'DI')
        for x in range(16 + (i % 2) * 2, 32, 4):
            put(y, x, KEY['Coffee Cherry']); cherries += 1
# a dirt headland along each field's inner edge, where the pickers walk
for y in list(range(19, 30)) + list(range(34, 45)):
    tile(y, 15, 'DI')

# ---- the mini lake (north-east), roughened oval with a stepstone landing ----------------------
CY, CX = 24.0, 43.0
for y in range(19, 30):
    for x in range(37, 50):
        d = ((y - CY) / 3.6) ** 2 + ((x - CX) / 5.4) ** 2
        wob = 0.18 * math.sin(x * 1.7 + y * 0.9) + 0.12 * math.cos(y * 2.3 - x * 0.6)
        if d + wob < 1.0: tile(y, x, 'WA')
for x in range(35, 38): tile(24, x, 'SP')                     # landing from the cross path
for y, x in ((20, 38), (21, 48), (27, 48), (28, 39), (19, 44), (29, 46)):
    if T[y][x] != 'WA': put(y, x, KEY['Flowering Shrub'])
put(29, 43, KEY['Marble Statue'])                               # on the south shore
put(23, 36, KEY['Stone Bust'])                                  # by the landing

# ---- the factory yard (south-east): cobbles, the Coffee Factory and its stores ----------------
for y in range(35, 44):
    for x in range(38, 49): tile(y, x, 'CB')
tile(33, 43, 'SP'); tile(34, 43, 'SP')                          # the yard's lane off the avenue
put(40, 42, KEY['Coffee Factory'])                              # size 2: anchor bottom-left
for (y, x) in ((39, 42), (39, 43), (40, 43)): put(y, x, 'xx')   # its footprint (stubs)
for (y, x) in ((36, 39), (36, 40), (37, 39)): put(y, x, KEY['Barrel'])
for (y, x) in ((36, 47), (37, 47)): put(y, x, KEY['Crate'])
for (y, x) in ((42, 46), (42, 47), (41, 47)): put(y, x, KEY['Sack'])
put(42, 39, KEY['Haybale'])

# ---- statues, shrubs and pots along the avenue --------------------------------------------------
put(30, 33, KEY['Stone Bust']); put(33, 35, KEY['Stone Bust'])     # the crossing
for x in (17, 21, 25, 29):
    put(30, x, KEY['Flowering Shrub']); put(33, x, KEY['Flowering Shrub'])
put(30, 13, KEY['Flower Pot']); put(33, 13, KEY['Flower Pot'])     # the back (west) gate
put(30, 50, KEY['Flower Pot']); put(33, 50, KEY['Flower Pot'])     # the front (east) gate

# ---- outside the front gate: stone lions and the pavement east to the edge --------------------
put(30, WX1 + 1, KEY['Stone Lion']); put(33, WX1 + 1, KEY['Stone Lion'])
road = [(31, x) for x in range(WX1 + 1, 58)] + [(32, x) for x in range(WX1 + 1, 57)]
road += [(31, 58), (31, 59), (30, 59), (30, 60), (30, 61), (31, 61), (31, 62), (31, 63)]
for (y, x) in road:
    R[y][x] = '**' if BYKEY.get(R[y][x], {}).get('category') in ('source', 'doober') else R[y][x]
    if R[y][x] != '**':                                              # a creature on the road steps off
        k = R[y][x]; R[y][x] = '**'; ny, nx = free_outside(); put(ny, nx, k)
    tile(y, x, 'PA')

# ---- validate ------------------------------------------------------------------------------------
problems = []
for y in range(64):
    for x in range(64):
        k = R[y][x]
        if k in ('**', 'xx'): continue
        r = BYKEY.get(k)
        if not r: problems.append(f'unknown key {k} at {y},{x}'); continue
        if r.get(f'validon{LETTER[T[y][x]]}') is not True:
            problems.append(f"{r['type']} on {T[y][x]} at {y},{x}")
after = {}
for row in R:
    for k in row:
        if k != '**': after[k] = after.get(k, 0) + 1

def show(y0=13, y1=50, x0=8, x1=63):
    ch = {'GR': '.', 'DI': ',', 'WA': '~', 'SP': ':', 'CB': '#', 'PA': '=', 'SL': 's', 'ZZ': '"'}
    sym = {'Stone Wall': 'W', 'Coffee Cherry': 'c', 'Coffee Factory': 'F', 'Barrel': 'b', 'Crate': 'k',
           'Sack': 'S', 'Haybale': 'h', 'Stone Bust': 'B', 'Stone Lion': 'L', 'Marble Statue': 'M',
           'Flowering Shrub': '*', 'Flower Pot': 'p', 'Oak Tree': 'T', 'Pine Tree': 'P'}
    for y in range(y0, y1 + 1):
        print(f'{y:2d} ' + ''.join(('x' if R[y][x] == 'xx' else sym.get(BYKEY.get(R[y][x], {}).get('type'), '?')) if R[y][x] != '**' else ch.get(T[y][x], '?') for x in range(x0, x1 + 1)))

show()
print(f'cherries {cherries}; creatures moved {len(movers)} ({", ".join(BYKEY[k]["type"] for k in movers) or "none"})')
print('count changes:', {BYKEY.get(k, {}).get('type', k): after.get(k, 0) - before.get(k, 0) for k in set(before) | set(after) if after.get(k, 0) != before.get(k, 0)})
if problems: print('PROBLEMS:', problems[:20]); sys.exit(1)

if '--apply' in sys.argv:
    dist = L.get('resourceDistribution')
    if isinstance(dist, dict):
        for k in set(before) | set(after):
            t = BYKEY.get(k, {}).get('type')
            if t in dist: dist[t] = max(0, dist[t] + after.get(k, 0) - before.get(k, 0))
    compact = raw == json.dumps(json.loads(raw), separators=(',', ':'))
    out = json.dumps(L, separators=(',', ':')) if compact else json.dumps(L, indent=2) + ('\n' if raw.endswith('\n') else '')
    open(FILE, 'w').write(out)
    man_p = os.path.join(HERE, 'data', 'phase1-manifest.json'); man = json.load(open(man_p))
    if '1012165' in man:
        man['1012165']['ownerEdited'] = True
        man['1012165']['note'] = 'Strathmoore coffee plantation, coffee_plantation.py (owner request 2026-11-05)'
        open(man_p, 'w').write(json.dumps(man, indent=1))
    print('wrote', FILE)
