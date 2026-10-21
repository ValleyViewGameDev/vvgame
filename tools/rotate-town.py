"""Rotate townN into townE / townS / townW (90, 180, 270 degrees clockwise) so every town
opens toward the valley. Usage: python3 tools/rotate-town.py [--check]
With --check it only reports whether the files on disk equal the rotation of townN."""
import json, sys, copy
ROOT='/Users/jonathanknight/GameDevelopment/vvgame/'
res=json.load(open(ROOT+'game-server/tuning/resources.json'))
size={r['layoutkey']:int(r.get('size') or 1) for r in res if r.get('layoutkey')}
N=64
def rot(x,y,q):
    for _ in range(q): x,y=N-1-y,x   # 90 degrees clockwise per quarter turn
    return x,y
def rotate(d,q):
    T=d['tiles']; R=d['resources']
    nt=[[None]*N for _ in range(N)]; nr=[[None]*N for _ in range(N)]
    for y in range(N):
        for x in range(N):
            rx,ry=rot(x,y,q); nt[ry][rx]=T[y][x]; nr[ry][rx]=R[y][x]
    # Multi-tile pieces: the footprint is x..x+s-1, y-s+1..y (anchor bottom-left). After the
    # rotation the anchor cell sits in another corner of the rotated footprint, so the key moves
    # to the rotated footprint's bottom-left cell and that cell's content ('xx' or '**') takes the
    # anchor's old place: every cell of the layout is kept, just re-arranged.
    moves=0
    for y in range(N):
        for x in range(N):
            v=R[y][x]
            if v in ('**','xx') or size.get(v,1)==1: continue
            s=size[v]
            fp=[rot(x+i,y-j,q) for i in range(s) for j in range(s)]
            ax=min(c[0] for c in fp); ay=max(c[1] for c in fp)
            ox,oy=rot(x,y,q)
            if (ax,ay)==(ox,oy): continue
            assert nr[ay][ax] in ('**','xx'), (v,x,y,'target cell holds',nr[ay][ax])
            nr[oy][ox], nr[ay][ax] = nr[ay][ax], v; moves+=1
    out=copy.deepcopy(d); out['tiles']=nt; out['resources']=nr
    return out, moves
if __name__=='__main__':
    src=json.load(open(ROOT+"game-server/layouts/gridLayouts/town/townN.json")); check='--check' in sys.argv
    for q,name in ((1,'townE'),(2,'townS'),(3,'townW')):
        out,moves=rotate(src,q)
        path=ROOT+f'game-server/layouts/gridLayouts/town/{name}.json'
        if check:
            cur=json.load(open(path))
            print(name, 'tiles', 'match' if cur['tiles']==out['tiles'] else 'DIFFER', '| resources', 'match' if cur['resources']==out['resources'] else 'DIFFER', f'| {moves} anchors moved')
        else:
            json.dump(out,open(path,'w'),indent=2); print('wrote',name, f'({moves} anchors moved)')
