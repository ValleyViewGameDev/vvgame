"""The Bohemia goat meadow on grid 1013542 (owner request, 2026-11-05).

Goats are raised only in Bohemia (resources.json Goat growregion; docs/tuning.md 4m), and this is
where a player first meets them: an open grass field cut into the forest, its edge ragged, with two
Goats grazing in it. Loose flowers in the field move to the forest just outside it (counts kept).

  python3 tools/gridgen/goat_meadow.py           # ASCII preview, writes nothing
  python3 tools/gridgen/goat_meadow.py --apply   # writes valleyFixedCoord/1013542.json

1013542 is a Claude-made grid; --apply marks it ownerEdited in data/phase1-manifest.json so
phase1_build.mjs never regenerates it.
"""
import json, math, os, random, sys

HERE = os.path.dirname(os.path.abspath(__file__))
GS = os.path.join(HERE, '..', '..', 'game-server')
FILE = os.path.join(GS, 'layouts', 'gridLayouts', 'valleyFixedCoord', '1013542.json')
RES = json.load(open(os.path.join(GS, 'tuning', 'resources.json')))
BYKEY = {r['layoutkey']: r for r in RES if r.get('layoutkey')}
KEY = {r['type']: r['layoutkey'] for r in RES if r.get('layoutkey')}
LETTER = {r['layoutkey']: r['type'] for r in RES if r.get('category') == 'tile'}
rng = random.Random(1013542)

raw = open(FILE).read(); L = json.loads(raw); T = L['tiles']; R = L['resources']
ORIG = json.loads(raw)
count = lambda: {k: sum(row.count(k) for row in R) for k in {k for row in R for k in row if k != '**'}}
before = count()

CY, CX, RY, RX = 40.0, 18.0, 7.5, 11.0

def field(y, x):
    d = ((y - CY) / RY) ** 2 + ((x - CX) / RX) ** 2
    rag = 0.16 * math.sin(x * 0.9 + y * 0.4) + 0.12 * math.cos(y * 1.3 - x * 0.7)
    return d + rag < 1.0

moved = []
for y in range(64):
    for x in range(64):
        if not field(y, x): continue
        k = R[y][x]
        if k != '**':
            if BYKEY.get(k, {}).get('category') in ('doober', 'npc'): moved.append(k)
            R[y][x] = '**'
        T[y][x] = 'GR'

def free_outside(k):
    while True:
        y, x = rng.randrange(1, 63), rng.randrange(1, 63)
        if field(y, x) or abs(y - CY) > RY + 6 or abs(x - CX) > RX + 8: continue
        if R[y][x] == '**' and BYKEY[k].get(f'validon{LETTER[T[y][x]]}') is True: return y, x
for k in moved:
    y, x = free_outside(k); R[y][x] = k

# the two goats, a little apart in the field
for (y, x) in ((38, 14), (42, 22)):
    assert field(y, x); R[y][x] = KEY['Goat']

problems = []
for y in range(64):
    for x in range(64):
        k = R[y][x]
        if k in ('**', 'xx') or (k == ORIG['resources'][y][x] and T[y][x] == ORIG['tiles'][y][x]): continue
        r = BYKEY.get(k)
        if not r: problems.append(f'unknown {k} at {y},{x}'); continue
        if r.get(f'validon{LETTER[T[y][x]]}') is not True: problems.append(f"{r['type']} on {T[y][x]} at {y},{x}")
after = count()

ch = {'GR': '.', 'DI': ',', 'WA': '~', 'SL': ':', 'ZZ': '"'}
sym = {'Goat': 'G', 'Oak Tree': 'T', 'Pine Tree': 'P'}
for y in range(28, 53):
    print(f'{y:2d} ' + ''.join(sym.get(BYKEY.get(R[y][x], {}).get('type'), '?') if R[y][x] != '**' else ch.get(T[y][x], '?') for x in range(0, 40)))
print(f'flowers moved {len(moved)}')
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
    if '1013542' in man:
        man['1013542']['ownerEdited'] = True
        man['1013542']['note'] = 'Bohemia goat meadow, goat_meadow.py (owner request 2026-11-05)'
        open(man_p, 'w').write(json.dumps(man, indent=1))
    print('wrote', FILE)
