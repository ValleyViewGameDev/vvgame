"""The Avondale mulberry farm on grid 1012334 (owner request, 2026-11-05).

Mulberry Trees grow only in Avondale (resources.json Mulberry Tree growregion; docs/tuning.md 4m).
This is where a player finds them: a wild orchard along the river's southern bank, no buildings
and no walls, the forest cleared in a band that follows the bank, and the trees standing in
planted rows of dirt. The trees are drawn ripe (Mulberry Leaf, repeatable: picked, it replants
its Mulberry Tree on the spot), kept under the Mulberry Tree's 50-per-grid cap so a player can
still plant a few of their own here.

  python3 tools/gridgen/mulberry_farm.py           # ASCII preview, writes nothing
  python3 tools/gridgen/mulberry_farm.py --apply   # writes valleyFixedCoord/1012334.json

1012334 is the owner's template (Avondale); the farm changes only the band south of the river.
Loose flowers (Daisy, Rosemary, Feverfew) in the band are moved south of it, not removed.
"""
import json, math, os, random, sys

HERE = os.path.dirname(os.path.abspath(__file__))
GS = os.path.join(HERE, '..', '..', 'game-server')
FILE = os.path.join(GS, 'layouts', 'gridLayouts', 'valleyFixedCoord', '1012334.json')
RES = json.load(open(os.path.join(GS, 'tuning', 'resources.json')))
BYKEY = {r['layoutkey']: r for r in RES if r.get('layoutkey')}
KEY = {r['type']: r['layoutkey'] for r in RES if r.get('layoutkey')}
LETTER = {r['layoutkey']: r['type'] for r in RES if r.get('category') == 'tile'}
rng = random.Random(1012334)

raw = open(FILE).read(); L = json.loads(raw); T = L['tiles']; R = L['resources']
ORIG = json.loads(raw)   # validation looks only at cells this script changes
count = lambda: {k: sum(row.count(k) for row in R) for k in {k for row in R for k in row if k != '**'}}
before = count()

X0, X1 = 3, 62
# the south bank: the first land row below the river, per column
shore = {}
for x in range(64):
    last = max((y for y in range(0, 45) if T[y][x] == 'WA'), default=None)
    shore[x] = (last + 1) if last is not None else None

def band(y, x):
    """In the cleared farm band: from the bank down about 9 rows, its lower edge ragged."""
    s = shore.get(x)
    if s is None or not (X0 <= x <= X1): return False
    edge = 9 + int(round(1.4 * math.sin(x * 0.45) + 1.0 * math.cos(x * 1.3)))
    return s <= y <= s + edge

# 1. clear the band: trees go, loose flowers move south of it, ground becomes grass
moved = []
for y in range(64):
    for x in range(64):
        if not band(y, x): continue
        k = R[y][x]
        if k != '**':
            cat = BYKEY.get(k, {}).get('category')
            if cat == 'doober' or cat == 'npc': moved.append(k)
            R[y][x] = '**'
        if T[y][x] != 'WA': T[y][x] = 'GR'

def free_south():
    while True:
        y, x = rng.randrange(44, 63), rng.randrange(1, 63)
        if not band(y, x) and R[y][x] == '**' and T[y][x] in ('GR', 'DI') and BYKEY[moved_k].get(f'validon{LETTER[T[y][x]]}'):
            return y, x
for moved_k in moved:
    y, x = free_south(); R[y][x] = moved_k

# 2. planted rows: dirt rows every third row, from two below the bank; trees every third tile,
#    each row offset, a few gaps left wild
trees = 0
for y in range(26, 52):
    if (y - 26) % 3: continue
    xs = [x for x in range(X0, X1 + 1) if band(y, x) and y >= shore[x] + 2 and band(y + 1, x)]
    if len(xs) < 4: continue
    for x in xs: T[y][x] = 'DI'
    off = ((y - 26) // 3) % 3
    for x in xs:
        if (x - off) % 3 == 1 and rng.random() > 0.2:
            R[y][x] = KEY['Mulberry Leaf']; trees += 1

# 3. a few wild touches on the bank: the odd dirt patch, no buildings
for _ in range(10):
    x = rng.randrange(X0, X1)
    if shore.get(x) is None: continue
    y = shore[x]
    if R[y][x] == '**' and T[y][x] == 'GR': T[y][x] = 'DI'

# ---- validate --------------------------------------------------------------------------------
problems = []
for y in range(64):
    for x in range(64):
        k = R[y][x]
        if k in ('**', 'xx') or (k == ORIG['resources'][y][x] and T[y][x] == ORIG['tiles'][y][x]): continue
        r = BYKEY.get(k)
        if not r: problems.append(f'unknown {k} at {y},{x}'); continue
        if r.get(f'validon{LETTER[T[y][x]]}') is not True: problems.append(f"{r['type']} on {T[y][x]} at {y},{x}")
after = count()

ch = {'GR': '.', 'DI': ',', 'WA': '~', 'PA': '=', 'SL': ':', 'ZZ': '"'}
sym = {'Mulberry Leaf': 'M', 'Oak Tree': 'T', 'Pine Tree': 'P', 'Mountain': 'A', 'Daisy': 'd', 'Rosemary': 'r', 'Feverfew': 'f'}
for y in range(20, 56):
    print(f'{y:2d} ' + ''.join(sym.get(BYKEY.get(R[y][x], {}).get('type'), '?') if R[y][x] != '**' else ch.get(T[y][x], '?') for x in range(64)))
print(f'mulberry trees {trees}; flowers moved {len(moved)}')
print('count changes:', {BYKEY.get(k, {}).get('type', k): after.get(k, 0) - before.get(k, 0) for k in set(before) | set(after) if after.get(k, 0) != before.get(k, 0)})
if problems: print('PROBLEMS:', problems[:20]); sys.exit(1)
if trees > 45: sys.exit('too many trees for the 50-per-grid cap')

if '--apply' in sys.argv:
    dist = L.get('resourceDistribution')
    if isinstance(dist, dict):
        for k in set(before) | set(after):
            t = BYKEY.get(k, {}).get('type')
            if t in dist: dist[t] = max(0, dist[t] + after.get(k, 0) - before.get(k, 0))
    compact = raw == json.dumps(json.loads(raw), separators=(',', ':'))
    out = json.dumps(L, separators=(',', ':')) if compact else json.dumps(L, indent=2) + ('\n' if raw.endswith('\n') else '')
    open(FILE, 'w').write(out)
    print('wrote', FILE)
