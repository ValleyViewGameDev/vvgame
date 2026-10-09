import json, sys, os
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(__file__))
from render import render
D=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'game-server', 'layouts', 'gridLayouts', 'valleyFixedCoord')
def coord(fr,fc): return 1010000+(fr//8)*1000+(fc//8)*100+(fr%8)*10+(fc%8)
def mosaic(r0,r1,c0,c1,out,scale=4,extra_dir=None):
    W=(c1-c0+1)*64*scale; H=(r1-r0+1)*64*scale
    img=Image.new('RGB',(W,H),(40,40,40)); dr=ImageDraw.Draw(img)
    for fr in range(r0,r1+1):
        for fc in range(c0,c1+1):
            c=coord(fr,fc); p=None
            for d in ([extra_dir] if extra_dir else [])+[D]:
                if os.path.exists(f'{d}/{c}.json'): p=f'{d}/{c}.json'; break
            if p:
                tmp=os.path.join(os.path.dirname(__file__),'_tile.png'); render(p,tmp,scale=scale)
                img.paste(Image.open(tmp),((fc-c0)*64*scale,(fr-r0)*64*scale))
            dr.rectangle([(fc-c0)*64*scale,(fr-r0)*64*scale,(fc-c0+1)*64*scale-1,(fr-r0+1)*64*scale-1],outline=(255,255,0))
            dr.text(((fc-c0)*64*scale+3,(fr-r0)*64*scale+3),str(c),fill=(255,255,0))
    img.save(out)
if __name__=='__main__':
    a=list(map(int,sys.argv[1:5])); mosaic(*a, sys.argv[5], int(sys.argv[6]) if len(sys.argv)>6 else 4, sys.argv[7] if len(sys.argv)>7 else None)
