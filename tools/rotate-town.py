"""Rotate townN into townE / townS / townW (90, 180, 270 degrees clockwise) so every town
opens toward the valley. Usage: python3 tools/rotate-town.py [--check]
With --check it only reports whether the files on disk equal the rotation of townN."""
import json, sys, copy
ROOT='/Users/jonathanknight/GameDevelopment/vvgame/'
res=json.load(open(ROOT+'game-server/tuning/resources.json'))
rows={r['layoutkey']:r for r in res if r.get('layoutkey')}
def dims(k):
    """A piece's footprint (w, h): sizeX x sizeY for a rectangle (BL-21), else size x size."""
    r=rows.get(k) or {}
    s=int(r.get('size') or 1)
    return int(r.get('sizeX') or s), int(r.get('sizeY') or s)
FILLER=('**','xx')
N=64
def rot(x,y,q):
    for _ in range(q): x,y=N-1-y,x   # 90 degrees clockwise per quarter turn
    return x,y
def rotate(d,q):
    """Every cell of townN moved to its rotated place, then each multi-tile piece's key moved to
    the anchor of its rotated footprint (anchor = bottom-left cell, footprint x..x+w-1, y-h+1..y).
    A square piece (or any piece on a half turn) lands exactly on its rotated footprint. A
    rectangle on a quarter turn cannot turn on its side (its art and sizeX/sizeY are fixed), so it
    keeps its w x h, centred on where its rotated footprint lands (ties toward its own rotated
    anchor cell): those are listed for a look. Whatever stood in the new anchor cell (a filler,
    or an overlapping piece: N has trees inside the Carnival's footprint, towers over wall cells)
    swaps into the cell the key left, so every cell of the layout is kept, just re-arranged."""
    T=d['tiles']; R=d['resources']
    nt=[[None]*N for _ in range(N)]; nr=[[None]*N for _ in range(N)]
    for y in range(N):
        for x in range(N):
            rx,ry=rot(x,y,q); nt[ry][rx]=T[y][x]; nr[ry][rx]=R[y][x]
    moves=0; turned=[]; placed=set()
    for y in range(N):
        for x in range(N):
            v=R[y][x]
            if v in FILLER or v not in rows: continue
            w,h=dims(v)
            if w==1 and h==1: continue
            fp=[rot(x+i,y-j,q) for i in range(w) for j in range(h)]
            ox,oy=rot(x,y,q)
            if w==h or q%2==0:
                ax=min(c[0] for c in fp); ay=max(c[1] for c in fp)
            else:
                cx=(min(c[0] for c in fp)+max(c[0] for c in fp))/2; cy=(min(c[1] for c in fp)+max(c[1] for c in fp))/2
                def near(v0,o):  # the integer nearest v0, ties toward o
                    lo,hi=int(v0//1),-int(-v0//1)
                    return lo if abs(lo-v0)<abs(hi-v0) or (abs(lo-v0)==abs(hi-v0) and abs(lo-o)<=abs(hi-o)) else hi
                ax=near(cx-(w-1)/2,ox); ay=near(cy+(h-1)/2,oy)
                ax=max(0,min(N-w,ax)); ay=max(h-1,min(N-1,ay))
                turned.append(f"{rows[v]['type']} {w}x{h} N({x},{y}) -> ({ax},{ay})")
            if (ax,ay)==(ox,oy): placed.add((ax,ay)); continue
            if (ax,ay) in placed: print('  WARNING', rows[v]['type'], 'at', (ax,ay), 'collides with a piece already placed; left at', (ox,oy)); continue
            nr[oy][ox], nr[ay][ax] = nr[ay][ax], v; moves+=1; placed.add((ax,ay))
    out=copy.deepcopy(d); out['tiles']=nt; out['resources']=nr
    return out, moves, turned
if __name__=='__main__':
    src=json.load(open(ROOT+"game-server/layouts/gridLayouts/town/townN.json")); check='--check' in sys.argv
    for q,name in ((1,'townE'),(2,'townS'),(3,'townW')):
        out,moves,turned=rotate(src,q)
        path=ROOT+f'game-server/layouts/gridLayouts/town/{name}.json'
        if check:
            cur=json.load(open(path))
            print(name, 'tiles', 'match' if cur['tiles']==out['tiles'] else 'DIFFER', '| resources', 'match' if cur['resources']==out['resources'] else 'DIFFER', f'| {moves} anchors moved')
        else:
            json.dump(out,open(path,'w'),indent=2); print('wrote',name, f'({moves} anchors moved)')
            for t in turned: print('  check (a rectangle on a quarter turn):', t)
