# Render layout JSON(s) to PNG: tile colours + small markers per resource category.
import json, os, sys
from PIL import Image, ImageDraw
GS=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'game-server')
res=json.load(open(GS+'/tuning/resources.json'))
bykey={r['layoutkey']:r for r in res if r.get('layoutkey')}
TC={'GR':(130,187,77),'WA':(88,160,216),'SL':(151,150,139),'DI':(201,143,89),'SA':(224,202,36),'LV':(196,88,61),'PA':(245,191,137),'ZZ':(63,116,73),'CY':(108,59,59),'CB':(172,170,137),'OW':(255,255,255)}
def color_for(r):
    t=r['type']; c=r.get('category'); a=r.get('action')
    if t=='Oak Tree': return (20,90,20)
    if t=='Pine Tree': return (10,60,40)
    if 'Dead Tree' in t: return (90,70,50)
    if t in ('Rocks','Stone','Mountain','Mountain Large'): return (80,80,80)
    if c=='npc' and a in ('attack','spawn'): return (230,0,0)
    if c=='npc': return (255,0,255)
    if c=='doober': return (255,255,255)
    if c=='deco' and a=='wall': return (40,40,40)
    if c in ('deco',): return (150,0,150)
    if c in ('shop','crafting','training','trainingAndShop','station','travel','stall','farmplot'): return (255,140,0)
    return (0,0,0)
def render(path,out,scale=8,title=None):
    d=json.load(open(path))
    img=Image.new('RGB',(64*scale,64*scale),(0,0,0)); dr=ImageDraw.Draw(img)
    for r in range(64):
        for c in range(64):
            t=d['tiles'][r][c]; dr.rectangle([c*scale,r*scale,c*scale+scale-1,r*scale+scale-1],fill=TC.get(t,(255,0,255)))
            k=d['resources'][r][c]
            if k!='**' and k in bykey and scale>=3:
                col=color_for(bykey[k]); m=min(1 if bykey[k]['type'] in ('Oak Tree','Pine Tree') else 2, (scale-1)//2)
                dr.rectangle([c*scale+m,r*scale+m,c*scale+scale-1-m,r*scale+scale-1-m],fill=col)
    img.save(out)
if __name__=='__main__':
    for p in sys.argv[1:]:
        render(p, p.split('/')[-1].replace('.json','.png'))
