#!/usr/bin/env python3
"""A picture of a dungeon layout for review: python3 tools/dungeons/preview.py <name> [out.png]
Tiles as flat colours, each thing as its own painted art where it has one (public/assets/resources),
an enemy as a red disc with its initial, a spawner as a purple ring, a door as a brown bar."""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
name = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'docs', 'dungeons', name + '.png')
L = json.load(open(os.path.join(ROOT, 'game-server/layouts/gridLayouts/dungeon', name + '.json')))
RES = json.load(open(os.path.join(ROOT, 'game-server/tuning/resources.json')))
by_key = {r['layoutkey']: r for r in RES if r.get('layoutkey') and r['category'] != 'tile'}
ART = os.path.join(ROOT, 'game-client/public/assets/resources')
C = 22
TILE = {'DU': (22, 20, 26), 'CB': (126, 122, 116), 'SL': (92, 98, 110), 'WA': (52, 104, 168), 'ZZ': (86, 122, 72), 'LV': (214, 92, 30), 'DI': (128, 98, 66), 'GR': (96, 150, 78), 'SA': (214, 196, 140), 'PA': (160, 150, 130)}
img = Image.new('RGBA', (64 * C, 64 * C), (12, 11, 14, 255)); dr = ImageDraw.Draw(img)
try: font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 12)
except Exception: font = ImageFont.load_default()
cache = {}
def art(r):
    f = r.get('iconFile') or r.get('filename')
    if not f: return None
    p = os.path.join(ART, f.replace('.svg', '.png'))
    if p not in cache: cache[p] = Image.open(p).convert('RGBA') if os.path.exists(p) else None
    return cache[p]
# the void is the bare dungeon tile the picture's edge can reach; bare dungeon tile shut in by walls is a dark floor
bare = lambda x, y: L['tiles'][y][x] == 'DU' and L['resources'][y][x] == '**'
void = set(); stack = [(x, y) for x in range(64) for y in (0, 63)] + [(x, y) for y in range(64) for x in (0, 63)]
while stack:
    x, y = stack.pop()
    if (x, y) in void or not (0 <= x < 64 and 0 <= y < 64) or not bare(x, y): continue
    void.add((x, y)); stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
for y in range(64):
    for x in range(64):
        t = L['tiles'][y][x]
        col = TILE.get(t, (60, 60, 60))
        if t == 'DU': col = (12, 11, 14) if (x, y) in void else (58, 52, 64)
        dr.rectangle([x * C, y * C, x * C + C - 1, y * C + C - 1], fill=col)
later = []
for y in range(64):
    for x in range(64):
        k = L['resources'][y][x]
        if k == '**': continue
        r = by_key.get(k); x0, y0 = x * C, y * C
        if r['type'] == 'Stone Wall':
            dr.rectangle([x0, y0, x0 + C - 1, y0 + C - 1], fill=(58, 54, 60), outline=(34, 31, 36)); continue
        if r.get('action') == 'door':
            dr.rectangle([x0 + 2, y0 + 2, x0 + C - 3, y0 + C - 3], fill=(150, 96, 44), outline=(70, 40, 14)); continue
        if r['category'] == 'npc':
            if r.get('action') == 'spawn': dr.ellipse([x0 + 2, y0 + 2, x0 + C - 3, y0 + C - 3], outline=(200, 90, 255), width=3)
            else:
                dr.ellipse([x0 + 1, y0 + 1, x0 + C - 2, y0 + C - 2], fill=(214, 48, 48), outline=(255, 255, 255))
                dr.text((x0 + C / 2, y0 + C / 2), r['type'][0], fill='white', font=font, anchor='mm')
            continue
        a = art(r); sx = r.get('sizeX') or r.get('size') or 1; sy = r.get('sizeY') or r.get('size') or 1
        if a is not None: later.append((a, x0, y0 - (sy - 1) * C, sx * C, sy * C, r))
        else: dr.text((x0 + C / 2, y0 + C / 2), k[:2], fill=(255, 230, 120), font=font, anchor='mm')
for a, x0, y0, w, h, r in later:
    if r.get('action') == 'collect': dr.rectangle([x0, y0, x0 + w - 1, y0 + h - 1], outline=(255, 214, 64))  # loot wears a gold frame
    s = a.copy(); s.thumbnail((w - 2, h - 2)); img.alpha_composite(s, (x0 + (w - s.width) // 2, y0 + (h - s.height) // 2))
bb = [min(x for y in range(64) for x in range(64) if L['resources'][y][x] != '**'), min(y for y in range(64) for x in range(64) if L['resources'][y][x] != '**'), max(x for y in range(64) for x in range(64) if L['resources'][y][x] != '**'), max(y for y in range(64) for x in range(64) if L['resources'][y][x] != '**')]
img = img.crop((max(0, bb[0] - 1) * C, max(0, bb[1] - 1) * C, min(64, bb[2] + 2) * C, min(64, bb[3] + 2) * C))
os.makedirs(os.path.dirname(out), exist_ok=True); img.convert('RGB').save(out); print(out, img.size)
