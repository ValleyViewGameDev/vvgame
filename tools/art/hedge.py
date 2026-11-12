#!/usr/bin/env python3
"""
The HEDGE wall set (docs/walls.md, "The hedge"; backlog BL-22, owner 2026-11-11): a clipped
hedgerow for hedge mazes, with no posts, one height everywhere, and one continuous face.

It is not cut from a generated junction panel. Each of the sixteen looks a wall tile can have
(one per N/E/S/W connection mask) is DRAWN here, leaf by leaf, the way this game's topiary is
painted: large single leaves pointing down, each a pale yellow-green with a darker green edge,
lying over one another like shingles, so the outline is a row of leaf tips. (The first version
laid a generated leaf texture over straight-edged boxes; the owner's review: it read as a
snake's scales, with blotches, nothing like the topiary. A texture has no single leaves.)

The geometry, in tile units (T), seen in the game's camera (tops from above, south faces):
  - the hedge's footprint is a band through the tile's middle: a centre block plus an arm to
    each connected edge;
  - a leaf growing at footprint point (x, yf) is drawn HEIGHT higher on screen: the lit TOP;
  - under the top's south edge hangs the FACE, the same leaves in shade, darker toward the
    ground, then a soft contact shadow; a north-south hedge shows its top only.
Why tiles join with no seam:
  - the leaves are ONE pattern that repeats every tile (a jittered lattice: leaf i, j is the same
    leaf in every tile), so a leaf that straddles two tiles is the same leaf in both pictures;
  - each picture also draws its neighbours' leaves near the shared edge, so both hold the same
    pixels there, and is cut a few pixels past the edge;
  - the tile to the south is drawn after the tile to the north (the board's y-sort) and its top
    starts exactly where the northern one's ends.

  python3 tools/art/hedge.py [--proof <png>]
Writes game-client/public/assets/walls/hedge-post.png (a lone block, mask 0) and hedge-m1 ..
hedge-m15.png (192 px: a 1.5-tile square whose bottom middle tile is the hedge's tile, as the
stone wall's), the set's entry in walls.json, and the Deco panel picture
game-client/public/assets/resources/hedge.png + .svg. Then: npm run build:atlas.
PixiRendererWalls.js and the editor's boardArt.js draw a set that has `-m15` whole, by mask.
"""
import base64, io, json, math, os, sys
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'game-client', 'public', 'assets', 'walls')
RES = os.path.join(ROOT, 'game-client', 'public', 'assets', 'resources')
arg = lambda n, d=None: (sys.argv[sys.argv.index('--' + n) + 1] if '--' + n in sys.argv else d)

T = 256                      # one tile, working pixels (the pictures ship at half this)
WIN = T * 3 // 2             # the picture: a 1.5-tile square
OX, OY = T // 4, T // 2      # the tile's top-left corner inside it
H = T // 2                   # how far the top is lifted: the face's height on screen
M = round(T * 0.15)          # the margin beside the band (the hedge is 0.7 of a tile thick)
OVER = 6                     # a picture is cut this far past a connected tile edge
# the leaf, and the lattice it grows on (both repeat every tile)
LEAF_L, LEAF_W = 50, 34      # a top leaf: about a fifth of a tile long, as the topiary's is against its ball
NX, NY = 8, 10               # leaves across a tile, rows down it (rows are staggered, so NY is even)
DX, DY = T / NX, T / NY
# the topiary's own colours (sampled from topiary-ball.png and topiary-cone.png): a lit leaf and
# its edge, then the shaded leaves lower down the form
TOP_FILL, TOP_EDGE = (188, 201, 22), (88, 122, 10)
FACE_FILL = [(146, 166, 14), (150, 170, 14), (136, 158, 12), (120, 146, 10), (104, 132, 8)]   # row by row, rim to ground
FACE_EDGE = [(72, 100, 8), (76, 104, 8), (66, 94, 8), (56, 84, 6), (46, 72, 4)]
UNDER_TOP, UNDER_FACE = (128, 150, 14), (60, 88, 8)   # what shows in the chinks between leaves
FACE_ROWS = [H - M + 4 + 25 * k for k in range(5)]    # the face's five rows of leaves, screen y (the rim is at T - M - H)


def rnd(i, j, salt):
    """a repeatable 0..1 for leaf (i, j): the same in every tile"""
    v = math.sin(i * 127.1 + j * 311.7 + salt * 74.7) * 43758.5453
    return v - math.floor(v)


_cache = {}
def leaf_sprite(key, fill, edge, angle, scale, light):
    """one leaf, tip down, turned `angle` degrees: a soft-edged fill over a darker edge, its lit half a touch paler, a faint midrib"""
    if key in _cache: return _cache[key]
    S = 4; L, W = LEAF_L * scale * S, LEAF_W * scale * S; size = int(max(L, W) * 1.5); c = size / 2
    half = lambda t: (W / 2) * math.sin(math.pi * t ** 0.72) ** 0.85     # widest above the middle, a point at the tip
    ts = [k / 24 for k in range(25)]
    right = [(c + half(t), c - L / 2 + L * t) for t in ts]; left = [(c - half(t), c - L / 2 + L * t) for t in reversed(ts)]
    grow = lambda pts, d: [(c + (x - c) * (1 + d / (W / 2)), c + (y - c) * (1 + d / (L / 2))) for x, y in pts]
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.polygon(grow(right + left, 2.6 * S), fill=edge + (255,))                      # the darker edge, widest under the tip
    d.polygon(right + left, fill=fill + (255,))
    pale = tuple(min(255, round(v * light)) for v in fill)
    d.polygon([(c, c - L / 2)] + left[::-1][1:-1] + [(c, c + L / 2)], fill=pale + (255,))   # the half toward the light
    rib = tuple(round(v * 0.90) for v in fill)
    d.line([(c, c - L * 0.36), (c, c + L * 0.40)], fill=rib + (255,), width=max(1, int(1.2 * S)))
    im = im.rotate(angle, resample=Image.BICUBIC).filter(ImageFilter.GaussianBlur(0.9 * S))   # soft, as painted
    im = im.resize((size // S, size // S), Image.LANCZOS)
    _cache[key] = im
    return im


def top_leaves(mask):
    """the top's leaves for a mask: (x, yf, i, j) of every lattice leaf growing on the footprint, and on the
    neighbours' first leaves across a connected edge"""
    n, e, s, w = mask & 1, mask & 2, mask & 4, mask & 8
    x0, x1, y0, y1 = M + 12, T - M - 12, M + 22, T - M - 16          # where a leaf may grow on the centre block
    reach = LEAF_L + OVER
    rects = [(x0, x1, y0, y1)]
    if e: rects.append((x0, T + reach, y0, y1))
    if w: rects.append((-reach, x1, y0, y1))
    if n: rects.append((x0, x1, -reach, y1))
    if s: rects.append((x0, x1, y0, T + reach))
    out = []
    for j in range(-NY, 2 * NY):
        for i in range(-NX, 2 * NX):
            x = (i + (0.5 if j % 2 else 0) + 0.25) * DX + (rnd(i % NX, j % NY, 1) - 0.5) * 9
            yf = (j + 0.5) * DY + (rnd(i % NX, j % NY, 2) - 0.5) * 7
            if any(a <= x <= b and c <= yf <= d for a, b, c, d in rects): out.append((x, yf, i % NX, j % NY))
    return out


def edge_depth(mask, x, yf):
    """how far inside the hedge a top leaf grows, measured from the nearest NORTH, EAST or WEST edge (not the south one:
    the rim over the face stays bright). The footprint is two bars, one east-west and one north-south, each running on
    for ever through a connected edge, so the answer does not change at a tile border."""
    n, e, s, w = mask & 1, mask & 2, mask & 4, mask & 8; far = 1e6
    hbar = min(x - (-far if w else M), (far if e else T - M) - x, yf - M) if M <= yf <= T - M else -far
    vbar = min(x - M, T - M - x, yf - (-far if n else M)) if M <= x <= T - M and (s or yf <= T - M) else -far
    return max(hbar, vbar)


def face_spans(mask):
    """the columns that show a face: under the centre block unless a hedge runs on south, and under the east and west arms"""
    e, s, w = mask & 2, mask & 4, mask & 8
    spans = []
    if not s: spans.append((M + 6, T - M - 6))
    if e: spans.append(((T - M - 6) if s else (T - M - 30), T + LEAF_L + OVER))
    if w: spans.append((-LEAF_L - OVER, (M + 6) if s else (M + 30)))
    spans.sort(); merged = []
    for a, b in spans:
        if merged and a <= merged[-1][1]: merged[-1] = (merged[-1][0], max(merged[-1][1], b))
        else: merged.append((a, b))
    return merged


def draw(mask):
    """one tile's picture for a connection mask (bits: n 1, e 2, s 4, w 8)"""
    img = Image.new('RGBA', (WIN, WIN), (0, 0, 0, 0))
    def paste(sp, x, y):
        px_, py_ = round(OX + x - sp.size[0] / 2), round(OY + y - sp.size[1] / 2)
        if -sp.size[0] < px_ < WIN and -sp.size[1] < py_ < WIN: img.alpha_composite(sp, (max(0, px_), max(0, py_)), (max(0, -px_), max(0, -py_)))
    spans = face_spans(mask); n, e, s, w = mask & 1, mask & 2, mask & 4, mask & 8
    # the contact shadow, then the face: a dark ground for the chinks, the leaves from the ground up
    if spans:
        sh = Image.new('RGBA', (WIN, WIN), (0, 0, 0, 0)); d = ImageDraw.Draw(sh)
        for a, b in spans: d.rectangle([OX + a - 4, OY + T - M - 8, OX + b + 4, OY + T - M + 9], fill=(24, 44, 10, 110))
        sh = sh.filter(ImageFilter.GaussianBlur(5)); sp = sh.load()
        # the shadow is translucent, so two pictures must not both lay it down at a shared edge: across the strip
        # they share, each fades out as the other fades in
        for wx in range(WIN):
            x = wx - OX; k = 1.0
            if w and x < OVER: k = max(0.0, (x + OVER) / (2 * OVER))
            if e and x > T - OVER: k = max(0.0, (T + OVER - x) / (2 * OVER))
            if k < 1:
                for wy in range(WIN): r, g, b_, a_ = sp[wx, wy]; sp[wx, wy] = (r, g, b_, round(a_ * k))
        img.alpha_composite(sh)
        d = ImageDraw.Draw(img)
        for a, b in spans: d.rectangle([OX + a + 8, OY + T - M - H - 6, OX + b - 8, OY + T - M - 12], fill=UNDER_FACE + (255,))
        for k in reversed(range(len(FACE_ROWS))):
            for i in range(-NX, 2 * NX):
                x = (i + (0.5 if k % 2 else 0) + 0.6) * DX + (rnd(i % NX, k, 3) - 0.5) * 9
                if not any(a + 10 <= x <= b - 10 for a, b in spans): continue
                y = FACE_ROWS[k] + (rnd(i % NX, k, 4) - 0.5) * 6
                j = 0.94 + 0.12 * rnd(i % NX, k, 5); fill = tuple(round(v * j) for v in FACE_FILL[k])
                paste(leaf_sprite(('f', i % NX, k), fill, FACE_EDGE[k], (rnd(i % NX, k, 6) - 0.5) * 36, 0.92 + 0.14 * rnd(i % NX, k, 7), 1.05), x, y)
    # the top: its ground, then its leaves from the south edge up, so each lies over the one below it
    d = ImageDraw.Draw(img); u0, u1, v0, v1 = M + 10, T - M - 10, M + 14, T - M - 14
    for a, b, c, dd in [(u0, u1, v0, v1)] + ([(u0, T + 60, v0, v1)] if e else []) + ([(-60, u1, v0, v1)] if w else []) + ([(u0, u1, -60, v1)] if n else []) + ([(u0, u1, v0, T + 60)] if s else []):
        d.rectangle([OX + a, OY + c - H, OX + b, OY + dd - H], fill=UNDER_TOP + (255,))
    for x, yf, i, j in sorted(top_leaves(mask), key=lambda p: -p[1]):
        # each leaf a shade of its own (fine-grained, never a blotch), and the leaves along an edge a little deeper
        # in tone, the way the topiary's turn darker toward its outline
        depth = min(1.0, max(0.0, edge_depth(mask, x, yf)) / 46.0); tone = round(depth * 3)
        k = (0.96 + 0.08 * rnd(i, j, 8)) * (0.88 + 0.12 * tone / 3); fill = tuple(min(255, round(v * k)) for v in TOP_FILL)
        paste(leaf_sprite(('t', i, j, tone), fill, TOP_EDGE, (rnd(i, j, 9) - 0.5) * 44, 0.90 + 0.18 * rnd(i, j, 10), 1.06), x, yf - H)
    # a soft darker outline just inside the silhouette, as the topiary and the trees have (before the cut, so it
    # runs straight on into the neighbour's and never closes off a connected edge)
    alpha = img.getchannel('A').point(lambda v: 255 if v >= 128 else 0)
    ring = Image.eval(alpha.filter(ImageFilter.MinFilter(7)), lambda v: 255 - v)      # 255 within 3 px of the outside
    ring = Image.composite(ring, Image.new('L', img.size, 0), alpha).filter(ImageFilter.GaussianBlur(1.2))
    dark = Image.new('RGBA', img.size, (58, 92, 8, 255)); dark.putalpha(ring.point(lambda v: round(v * 0.55)))
    a0 = img.getchannel('A'); img.alpha_composite(dark); img.putalpha(a0)
    # cut a few pixels past a connected edge: the neighbour's picture carries on from there
    px = img.load()
    for wy in range(WIN):
        for wx in list(range(0, OX - OVER)) + list(range(OX + T + OVER, WIN)): px[wx, wy] = (0, 0, 0, 0)
    return img


def name(mask): return 'post' if mask == 0 else f'm{mask}'


def main():
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.startswith('hedge-'): os.remove(os.path.join(OUT, f))   # the earlier seven-piece set
    small = WIN // 2
    for mask in range(16):
        draw(mask).resize((small, small), Image.LANCZOS).save(os.path.join(OUT, f'hedge-{name(mask)}.png'), optimize=True)
    mf = os.path.join(OUT, 'walls.json'); manifest = json.load(open(mf)) if os.path.exists(mf) else {'sets': {}}
    manifest['sets']['hedge'] = {'plus': None, 'post': None, 'px': small, 'span': WIN / T, 'pieces': [name(m) for m in range(16)],
                                 'whole': True, 'made': 'tools/art/hedge.py: one whole picture per connection mask (post = mask 0, m<mask>: n 1, e 2, s 4, w 8), drawn leaf by leaf'}
    open(mf, 'w').write(json.dumps(manifest, indent=2) + '\n')
    # the Deco panel's picture: a short run, two tiles side by side, fitted to a 256 square
    run = Image.new('RGBA', (WIN + T, WIN), (0, 0, 0, 0)); run.alpha_composite(draw(2), (0, 0)); run.alpha_composite(draw(8), (T, 0))
    run = run.crop(run.getbbox()); k = T / max(run.size); run = run.resize((round(run.size[0] * k), round(run.size[1] * k)), Image.LANCZOS)
    pic = Image.new('RGBA', (T, T), (0, 0, 0, 0)); pic.alpha_composite(run, ((T - run.size[0]) // 2, (T - run.size[1]) // 2))
    pic.save(os.path.join(RES, 'hedge.png'), optimize=True)
    buf = io.BytesIO(); pic.save(buf, 'PNG')
    open(os.path.join(RES, 'hedge.svg'), 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 {T} {T}" width="{T}" height="{T}"><image width="{T}" height="{T}" xlink:href="data:image/png;base64,{base64.b64encode(buf.getvalue()).decode()}"/></svg>')
    if arg('proof'): proof_sheet(arg('proof'))
    print(f'wrote walls/hedge-post.png and hedge-m1..m15.png ({small} px), walls.json, resources/hedge.png + .svg. Next: npm run build:atlas in game-client.')


def compose(mask):
    """what the board draws for a mask: the whole picture, from the files on disk"""
    return Image.open(os.path.join(OUT, f'hedge-{name(mask)}.png')).convert('RGBA')


def proof_sheet(path, tile=128):
    """a small maze drawn the way the board draws it: row by row, each tile's square at its bottom-middle"""
    maze = ["#########.#",
            "#.......#.#",
            "#.###.#.#.#",
            "#.#...#...#",
            "#.#.#####.#",
            "#...#.....#",
            "###.#.###.#",
            "#.....#...#",
            "#######.#.#",
            "..........#",
            "#.##.#..###"]
    rows, cols = len(maze), len(maze[0]); at = lambda r, c: 0 <= r < rows and 0 <= c < cols and maze[r][c] == '#'
    sheet = Image.new('RGBA', (cols * tile, (rows + 1) * tile), (120, 172, 20, 255))
    for r in range(rows):
        for c in range(cols):
            if not at(r, c): continue
            mask = (1 if at(r - 1, c) else 0) | (2 if at(r, c + 1) else 0) | (4 if at(r + 1, c) else 0) | (8 if at(r, c - 1) else 0)
            sq = compose(mask); s = round(tile * 1.5)
            if sq.size[0] != s: sq = sq.resize((s, s), Image.LANCZOS)
            sheet.alpha_composite(sq, (round(c * tile - tile / 4), (r + 1) * tile + tile - s))
    sheet.convert('RGB').save(path, quality=92)


if __name__ == '__main__':
    main()
