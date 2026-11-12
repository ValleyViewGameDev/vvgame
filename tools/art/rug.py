#!/usr/bin/env python3
"""
Cut a flat RUG panel (tools/art/jobs/deco-r6.json: a rug seen from directly overhead on magenta)
into a floor sprite: key the magenta, take the rug's own box, resize it to the footprint's exact
aspect (the model's rectangle is never exactly 3 : 1 or 1 : 2), and seat it at the bottom-centre
of a square, as every board sprite is (the atlas only holds squares; the row's artSpan is the
square's side in tiles).

  python3 tools/art/rug.py --candidate painterly-rug-3x1-1 --file rug-runner --w 3 --h 1 [--job deco-r6] [--fill 0.95] [--px 768]
Prints ARTSPAN: the square's side in tiles. It is deliberately a little MORE than the footprint's
longer side (fill < 1): the renderer draws a row's art as an artSpan square only when artSpan is
not the footprint's width, and a rug should not touch its tiles' edges anyway.
"""
import base64, colorsys, io, os, sys
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
arg = lambda n, d=None: (sys.argv[sys.argv.index('--' + n) + 1] if '--' + n in sys.argv else d)
job, cand, name = arg('job', 'deco-r6'), arg('candidate'), arg('file')
fw, fh, fill, px = int(arg('w', 1)), int(arg('h', 1)), float(arg('fill', 0.95)), int(arg('px', 768))
src = Image.open(os.path.join(ROOT, 'tools', 'art', '_candidates', job, 'exploration', 'openai', cand + '.png')).convert('RGBA')
p = src.load(); W, H = src.size
for y in range(H):
    for x in range(W):
        r, g, b, a = p[x, y]; h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if 280 <= h * 360 <= 335 and s > 0.45 and v > 0.45: p[x, y] = (0, 0, 0, 0)
# the key leaves a pink anti-aliased ring: shave one pixel off the alpha
al = src.getchannel('A').filter(ImageFilter.MinFilter(3)); src.putalpha(al)
box = src.getbbox(); rug = src.crop(box)
# The fringe: between its threads the model shades the magenta to a dull pink the key does not
# take. The fringe is the band at each SHORT end before the rug's solid body begins; in it only
# gold stays.
rp = rug.load(); RW, RH = rug.size; along_x = RW >= RH
def gold(q):
    h, sa, v = colorsys.rgb_to_hsv(q[0] / 255, q[1] / 255, q[2] / 255); return q[3] > 200 and 22 <= h * 360 <= 64 and sa > 0.35
# the body begins at the gold border: the first line that is gold from side to side (a fringe line has gaps, pink or empty)
solid = lambda i: sum(1 for j in range(RH if along_x else RW) if gold(rp[(i, j) if along_x else (j, i)])) > 0.97 * (RH if along_x else RW)
n = RW if along_x else RH
first = next(i for i in range(n) if solid(i)); last = next(i for i in range(n - 1, -1, -1) if solid(i))
for i in list(range(0, first)) + list(range(last + 1, n)):
    for j in range(RH if along_x else RW):
        x, y = (i, j) if along_x else (j, i); r, g, bb, a = rp[x, y]
        if not a: continue
        h, sa, v = colorsys.rgb_to_hsv(r / 255, g / 255, bb / 255)
        if not (22 <= h * 360 <= 64 and sa > 0.35): rp[x, y] = (0, 0, 0, 0)
span = max(fw, fh) / fill                      # the square's side, tiles
tile = px / span                               # one tile, output pixels
w, h = round(fw * tile * fill), round(fh * tile * fill)
rug = rug.resize((w, h), Image.LANCZOS)
out = Image.new('RGBA', (px, px), (0, 0, 0, 0))
out.alpha_composite(rug, ((px - w) // 2, px - h - round((fh * tile - h) / 2)))   # centred on the footprint, which sits at the square's bottom
res = os.path.join(ROOT, 'game-client', 'public', 'assets', 'resources')
out.save(os.path.join(res, name + '.png'), optimize=True)
buf = io.BytesIO(); out.save(buf, 'PNG')
open(os.path.join(res, name + '.svg'), 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 {px} {px}" width="{px}" height="{px}"><image width="{px}" height="{px}" xlink:href="data:image/png;base64,{base64.b64encode(buf.getvalue()).decode()}"/></svg>')
print(f'{name}: the rug was {box[2] - box[0]} x {box[3] - box[1]} px in the panel (aspect {(box[2] - box[0]) / (box[3] - box[1]):.2f}, footprint {fw / fh:.2f}); wrote resources/{name}.png + .svg ({px} px)')
print(f'ARTSPAN {name} {round(span, 2)}')
