"""Grow the walled valley towns for the size-4 buildings (2026-10-22).

The valley towns are the miniTemplates valleyTown01 / valleyTown02 stamped into a
valleyFixedCoord layout at some origin, with slots swapped by hand (a Bank in the Library
slot) and hand edits around them. The buildings that stood in them were 3 x 3 and are now
4 x 4 (resources.json), so every tier and every side-by-side pair collides.

The expansion inserts DUPLICATE columns and rows at fixed cut lines inside the compound
(through each tier of buildings and through each building block), so a 3-wide block becomes
4 wide, walls and paths continue through the cut, and everything right of / below the cut
shifts by one, up to the nearest PLAIN column / row beyond the compound (grass, dirt or sand
under nothing but trees, or a horizontal wall or band that only gets a tile shorter), which is deleted to absorb the insert, so
roads leaving the grid and everything else outside the town keep their place. The inserted copy carries the tiles of the cut line and, for resources, only
walls (a door copies as wall) and footprint stubs; 1 x 1 props and anchors are not doubled.

Usage:
  python3 tools/expand-town.py --check                 conflicts of every valley town (dry)
  python3 tools/expand-town.py --templates             grow miniTemplates/valleyTown01 + 02
  python3 tools/expand-town.py --town 1012276 [--variant 1|2 --origin X,Y] [--dry]
  python3 tools/expand-town.py --all [--dry]           every town the detector recognises
"""
import json, sys, glob, copy, os

ROOT = '/Users/jonathanknight/GameDevelopment/vvgame/'
LAY = ROOT + 'game-server/layouts/gridLayouts/'
res = json.load(open(ROOT + 'game-server/tuning/resources.json'))
SIZE = {r['layoutkey']: int(r.get('size') or 1) for r in res if r.get('layoutkey')}
NAME = {r['layoutkey']: r['type'] for r in res if r.get('layoutkey')}
WALLS = {'wa', 'wf', 'Gw', 'Bw', 'Sw', 'Lw', 'Ow', 'iw'}
DOORS = {'Dor', 'DDor', 'ADor', 'Lck', 'Mr'}
EMPTY, STUB = '**', 'xx'

# the templates' slot anchors (local x, y) and the cut lines that grow each tier and block
TEMPLATES = {
    1: {'slots': {(4, 3): 'mS', (11, 3): 'sT', (2, 7): 'h+', (8, 7): 'aR', (11, 7): 'wD', (2, 12): 'Li', (11, 13): 'sH', (1, 2): 'F2'},
        'cols': [3, 9, 12], 'rows': [2, 6, 11], 'wallsig': [(0, 0), (14, 0), (0, 14), (8, 14), (14, 9), (8, 9)]},
    2: {'slots': {(2, 3): 'sT', (7, 3): 'mS', (2, 7): 'h+', (8, 7): 'wD', (11, 7): 'aR', (9, 13): 'Li', (1, 13): 'sH', (12, 2): 'F2'},
        'cols': [3, 9, 12], 'rows': [2, 6, 12], 'wallsig': [(0, 0), (14, 0), (14, 14), (6, 14), (0, 9), (6, 9)]},
}


def load(path):
    return json.load(open(path))


def save(path, d):
    json.dump(d, open(path, 'w'), indent=2)


def footprint(key, x, y):
    s = SIZE.get(key, 1)
    return [(x + i, y - j) for i in range(s) for j in range(s)]


# the buildings this is about: multi-tile rows that are not scenery (mountains, big trees, the
# volcano and the big statue overlap each other and their trees on purpose)
SCENERY = {'m1', 'm2', 'm3', 'vo', 'dt2', 'dt3', 'st2', 'pt6', 'Xm', 'P2', 'F2', 'Sl'}
TOWN = {k for k, s in SIZE.items() if s > 1 and k not in SCENERY}


def buildings(R, only_town=True):
    out = []
    for y in range(64):
        for x in range(64):
            k = R[y][x]
            if k not in (EMPTY, STUB) and SIZE.get(k, 1) > 1 and (k in TOWN or not only_town):
                out.append((k, x, y))
    return out


def conflicts(d):
    """Every multi-tile building whose footprint runs into something: walls, another building, off-grid."""
    R = d['resources']
    occ = {}
    for k, x, y in buildings(R):
        for c in footprint(k, x, y):
            occ.setdefault(c, []).append((k, x, y))
    bad = []
    for k, x, y in buildings(R):
        why = []
        for cx, cy in footprint(k, x, y):
            if not (0 <= cx < 64 and 0 <= cy < 64): why.append('off-grid'); continue
            v = R[cy][cx]
            if v in WALLS or v in DOORS: why.append(f'wall at {cx},{cy}')
            elif v not in (EMPTY, STUB) and (cx, cy) != (x, y): why.append(f'{v} at {cx},{cy}')
            if len(occ.get((cx, cy), [])) > 1: why.append(f'overlaps {[b[0] for b in occ[(cx, cy)] if b != (k, x, y)]} at {cx},{cy}')
        if why: bad.append((NAME.get(k, k), x, y, sorted(set(why))[:4]))
    return bad


def detect(d):
    """Which template and origin a town is: the slot anchors (allowing slot swaps) and the wall corners."""
    R = d['resources']
    best = None
    for v, t in TEMPLATES.items():
        for oy in range(0, 50):
            for ox in range(0, 50):
                score = 0
                for (lx, ly) in t['slots']:
                    k = R[oy + ly][ox + lx] if oy + ly < 64 and ox + lx < 64 else EMPTY
                    if k not in (EMPTY, STUB) and SIZE.get(k, 1) > 1: score += 1
                for (lx, ly) in t['wallsig']:
                    if oy + ly < 64 and ox + lx < 64 and R[oy + ly][ox + lx] in WALLS: score += 1
                if best is None or score > best[0]: best = (score, v, ox, oy)
    score, v, ox, oy = best
    return (v, ox, oy, score) if score >= 9 else None


PLAIN_RES = {EMPTY, STUB, 'OT', 'PT', 'f1'}
GROUND = {'', None, 'GR', 'DI', 'SA', 'SL', 'CL', 'ZZ', 'MO'}  # ground and deposit noise (a lone slate tile in grass) is never a feature


def movable(r):
    """A single-tile or scenery resource that may hop one tile when its column (row) is deleted."""
    return r not in (EMPTY, STUB) and r not in WALLS and r not in DOORS and r not in TOWN


def deletable_col(d, x):
    """A column that can vanish without breaking anything: every cell is empty, a tree or a
    stub, a wall with walls on both sides (a horizontal wall just gets one tile shorter), or
    a lone prop / animal / rock with an empty cell beside it to hop to; and its tile is ground
    or continues sideways (part of a horizontal band, not a vertical feature)."""
    T, R = d['tiles'], d['resources']
    if x <= 0 or x >= 63: return False
    for y in range(64):
        r, t = R[y][x], T[y][x]
        okr = r in PLAIN_RES or (r in WALLS and R[y][x - 1] in WALLS and R[y][x + 1] in WALLS) or (movable(r) and (free(d, x + 1, y) or free(d, x - 1, y)))
        if not okr: return False
        if t not in GROUND and not (T[y][x - 1] == t or T[y][x + 1] == t): return False
    return True


def deletable_row(d, y):
    T, R = d['tiles'], d['resources']
    if y <= 0 or y >= 63: return False
    for x in range(64):
        r, t = R[y][x], T[y][x]
        okr = r in PLAIN_RES or (r in WALLS and R[y - 1][x] in WALLS and R[y + 1][x] in WALLS) or (movable(r) and (free(d, x, y + 1) or free(d, x, y - 1)))
        if not okr: return False
        if t not in GROUND and not (T[y - 1][x] == t or T[y + 1][x] == t): return False
    return True


def free(d, x, y):
    """An empty cell on plain ground: where a hopping prop may land (never onto a path or water)."""
    return d['resources'][y][x] == EMPTY and d['tiles'][y][x] in GROUND


def hop_col(d, xdel):
    """Before column xdel goes, its lone props hop to a free cell beside them (or are dropped)."""
    R = d['resources']
    for y in range(64):
        r = R[y][xdel]
        if movable(r):
            if free(d, xdel + 1, y): R[y][xdel + 1] = r
            elif free(d, xdel - 1, y): R[y][xdel - 1] = r


def hop_row(d, ydel):
    R = d['resources']
    for x in range(64):
        r = R[ydel][x]
        if movable(r):
            if free(d, x, ydel + 1): R[ydel + 1][x] = r
            elif free(d, x, ydel - 1): R[ydel - 1][x] = r


def find_plain(d, right_start, left_start, is_col, limit=20):
    """The nearest deletable column (row): first beyond the compound's far wall, then before its near wall."""
    for i in range(right_start, min(63, right_start + limit)):
        if (deletable_col(d, i) if is_col else deletable_row(d, i)): return i
    for i in range(left_start, max(0, left_start - limit), -1):
        if (deletable_col(d, i) if is_col else deletable_row(d, i)): return i
    return None


def insert_col(d, x, xdel):
    """Duplicate column x (the copy right after it) and delete column xdel on either side, so only the band between them shifts by one."""
    T, R = d['tiles'], d['resources']
    hop_col(d, xdel)
    for y in range(64):
        src = R[y][x]
        copy_r = 'wa' if src in WALLS or src in DOORS else STUB if (src == STUB or SIZE.get(src, 1) > 1) else EMPTY
        T[y].pop(xdel); R[y].pop(xdel)
        at = x + 1 if xdel > x else x
        T[y].insert(at, T[y][at - 1]); R[y].insert(at, copy_r)


def insert_row(d, y, ydel):
    T, R = d['tiles'], d['resources']
    hop_row(d, ydel)
    copy_r = ['wa' if v in WALLS or v in DOORS else STUB if (v == STUB or SIZE.get(v, 1) > 1) else EMPTY for v in R[y]]
    tiles = list(T[y])
    T.pop(ydel); R.pop(ydel)
    at = y + 1 if ydel > y else y
    T.insert(at, tiles); R.insert(at, copy_r)


def expand(d, variant, ox, oy):
    """The cuts, far side first; each absorbed by deleting the nearest plain column / row beyond the compound's wall."""
    t = TEMPLATES[variant]
    log = []
    # a deletion LEFT of (above) the compound shifts the compound itself, so the origin moves with it
    for lx in sorted(t['cols'], reverse=True):
        xdel = find_plain(d, ox + 16, ox - 2, True)
        if xdel is None: raise RuntimeError(f'no deletable column on either side of the compound for the cut at {ox + lx}')
        insert_col(d, ox + lx, xdel); log.append(f'col {ox + lx} (+1), col {xdel} removed')
        if xdel < ox: ox -= 1
    for ly in sorted(t['rows'], reverse=True):
        ydel = find_plain(d, oy + 16, oy - 2, False)
        if ydel is None: raise RuntimeError(f'no deletable row on either side of the compound for the cut at {oy + ly}')
        insert_row(d, oy + ly, ydel); log.append(f'row {oy + ly} (+1), row {ydel} removed')
        if ydel < oy: oy -= 1
    return log


def restub(d):
    """Footprint stubs for the editor: every cell of a multi-tile footprint that is empty becomes xx; stray xx outside any footprint stays (the layouts use them as fillers)."""
    R = d['resources']
    for k, x, y in buildings(R):
        for cx, cy in footprint(k, x, y):
            if 0 <= cx < 64 and 0 <= cy < 64 and R[cy][cx] == EMPTY: R[cy][cx] = STUB


def main():
    a = sys.argv[1:]
    dry = '--dry' in a
    if '--check' in a:
        for f in sorted(glob.glob(LAY + 'valleyFixedCoord/*.json')):
            d = load(f); bad = conflicts(d)
            if bad:
                det = detect(d)
                print(f"{os.path.basename(f)[:-5]}: {len(bad)} conflicts; template {det}")
                for b in bad: print('   ', b)
        return
    if '--templates' in a:
        for v in (1, 2):
            p = LAY + f'miniTemplates/valleyTown0{v}.json'
            d = load(p); expand(d, v, 0, 0); restub(d)
            print(f'valleyTown0{v}: conflicts after:', conflicts(d))
            if not dry: save(p, d)
        return
    towns = []
    if '--town' in a: towns = [a[a.index('--town') + 1]]
    if '--all' in a: towns = [os.path.basename(f)[:-5] for f in sorted(glob.glob(LAY + 'valleyFixedCoord/*.json'))]
    for coord in towns:
        p = LAY + f'valleyFixedCoord/{coord}.json'
        d = load(p)
        if not conflicts(d): continue
        if '--variant' in a and '--town' in a:
            v = int(a[a.index('--variant') + 1]); ox, oy = map(int, a[a.index('--origin') + 1].split(','))
        else:
            det = detect(d)
            if not det: print(f'{coord}: no template match, left alone ({len(conflicts(d))} conflicts)'); continue
            v, ox, oy, _ = det
        try: log = expand(d, v, ox, oy)
        except RuntimeError as e: print(f'{coord}: SKIPPED, {e}'); continue
        restub(d)
        after = conflicts(d)
        print(f'{coord}: template {v} at ({ox},{oy}); ' + '; '.join(log) + f'; conflicts after: {after if after else "none"}')
        if not dry: save(p, d)


if __name__ == '__main__':
    main()
