"""Badge art: remove the flat white background from an image-AI badge (docs/phase-1/BADGE_ART_PROMPTS.md).

    python3 -m venv .venv-badges && .venv-badges/bin/pip install pillow
    .venv-badges/bin/python scripts/badge-cutout.py trophy/<generated>.jpeg public/badges/rank-novice

Writes <out>-512.png and <out>-128.png (transparent, square, trimmed to the badge with a small margin).

Remove the flat white background from a generated badge: flood-fill from the image border over near-white pixels
(so white highlights inside the badge are kept), then feather the edge, trim to the badge with a margin, and write PNGs."""
import sys
from collections import deque
from PIL import Image, ImageFilter

src, out_stem = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGB")
w, h = im.size
px = im.load()
bg = bytearray(w * h)  # 1 = background

def near_white(p, lim=232):
    r, g, b = p
    return min(r, g, b) >= lim and max(r, g, b) - min(r, g, b) <= 14

q = deque()
for x in range(w):
    for y in (0, h - 1):
        if near_white(px[x, y]): bg[y * w + x] = 1; q.append((x, y))
for y in range(h):
    for x in (0, w - 1):
        if near_white(px[x, y]) and not bg[y * w + x]: bg[y * w + x] = 1; q.append((x, y))
while q:
    x, y = q.popleft()
    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
        if 0 <= nx < w and 0 <= ny < h and not bg[ny * w + nx] and near_white(px[nx, ny]):
            bg[ny * w + nx] = 1; q.append((nx, ny))

alpha = Image.frombytes("L", (w, h), bytes(0 if v else 255 for v in bg))
alpha = alpha.filter(ImageFilter.GaussianBlur(1.2))  # soften the cut edge (JPEG halo)
rgba = im.copy(); rgba.putalpha(alpha)
bbox = alpha.point(lambda a: 255 if a > 8 else 0).getbbox()
pad = int(0.04 * max(w, h))
box = (max(0, bbox[0] - pad), max(0, bbox[1] - pad), min(w, bbox[2] + pad), min(h, bbox[3] + pad))
rgba = rgba.crop(box)
side = max(rgba.size)
canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
canvas.paste(rgba, ((side - rgba.size[0]) // 2, (side - rgba.size[1]) // 2))
for size in (512, 128):
    canvas.resize((size, size), Image.LANCZOS).save(f"{out_stem}-{size}.png", optimize=True)
removed = sum(bg) / (w * h)
print(f"background removed: {removed:.0%} of pixels; badge box {box}; wrote {out_stem}-512.png and -128.png")
