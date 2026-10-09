import json, os,sys
GS=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'game-server')
res=json.load(open(GS+'/tuning/resources.json')); bykey={r['layoutkey']:r for r in res if r.get('layoutkey')}
TCH={'GR':'.','WA':'~','SL':':','DI':',','SA':'_','LV':'^','PA':'=','ZZ':'"','CY':'%','CB':'#','OW':'o','**':' '}
def show(path, r0=None,r1=None,c0=None,c1=None, legend=True):
    d=json.load(open(path)); T=d['tiles']; R=d['resources']
    if r0 is None:
        cells=[(r,c) for r in range(64) for c in range(64) if T[r][c]!='**' or R[r][c]!='**']
        r0=min(r for r,c in cells); r1=max(r for r,c in cells); c0=min(c for r,c in cells); c1=max(c for r,c in cells)
    used={}
    sym={}
    pool=iter('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@$&*+?!<>/|')
    fixed={'Oak Tree':'T','Pine Tree':'P','Rocks':'r','Dead Tree':'d','Stone Wall':'W'}
    print(f'rows {r0}-{r1} cols {c0}-{c1}')
    for r in range(r0,r1+1):
        line=''
        for c in range(c0,c1+1):
            k=R[r][c]
            if k!='**' and k in bykey:
                t=bykey[k]['type']
                if t not in sym: sym[t]=fixed.get(t) or next(pool)
                line+=sym[t]
            else: line+=TCH.get(T[r][c],'?')
        print(f'{r:2d} {line}')
    if legend: print('legend:', ', '.join(f'{v}={k}' for k,v in sym.items()))
if __name__=='__main__':
    a=sys.argv[2:]
    show(sys.argv[1], *map(int,a)) if a else show(sys.argv[1])
