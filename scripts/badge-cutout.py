"""Badge art: remove the flat white background from image-AI badges (docs/phase-1/BADGE_ART_PROMPTS.md).

    python3 -m venv .venv-badges && .venv-badges/bin/pip install pillow

One badge per image:
    .venv-badges/bin/python scripts/badge-cutout.py trophy/rank-novice.jpeg public/badges/rank-novice

A sheet with several badges (names in reading order: left to right, top row first):
    .venv-badges/bin/python scripts/badge-cutout.py --sheet trophy/sheet-trophies.jpeg public/badges \\
        trophy-advanced-beginner trophy-competent trophy-proficient trophy-expert trophy-summit

Writes <name>-512.png and <name>-128.png for each badge (transparent, square, trimmed with a small margin).

How: flood-fill from the image border over near-white pixels (so white highlights inside a badge are kept), also clear
large enclosed patches of flat white (inside handles and loops), feather the cut edge, then find each badge as a separate island of non-white pixels. Specks smaller than 0.5% of the image are ignored,
and pieces whose boxes overlap are merged (e.g. a sparkle drawn just off a badge).
"""
import sys
from collections import deque
from PIL import Image, ImageFilter


def near_white(p, lim=232):
    r, g, b = p
    return min(r, g, b) >= lim and max(r, g, b) - min(r, g, b) <= 14


def background_mask(im):
    w, h = im.size
    px = im.load()
    bg = bytearray(w * h)  # 1 = background
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if near_white(px[x, y]) and not bg[y * w + x]: bg[y * w + x] = 1; q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if near_white(px[x, y]) and not bg[y * w + x]: bg[y * w + x] = 1; q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not bg[ny * w + nx] and near_white(px[nx, ny]):
                bg[ny * w + nx] = 1; q.append((nx, ny))
    # Background sealed inside the art (e.g. inside a trophy handle) doesn't touch the border. Remove enclosed regions of
    # flat, near-pure white that are large enough to be background, not a highlight: a highlight is small or shaded.
    seen = bytearray(w * h)
    min_hole = 0.0015 * w * h
    for start in range(w * h):
        if bg[start] or seen[start] or not near_white(px[start % w, start // w], lim=242): continue
        region = [start]; seen[start] = 1; i = 0
        while i < len(region):
            x, y = region[i] % w, region[i] // w; i += 1
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < w and 0 <= ny < h:
                    j = ny * w + nx
                    if not seen[j] and not bg[j] and near_white(px[nx, ny], lim=242): seen[j] = 1; region.append(j)
        if len(region) >= min_hole:
            for j in region: bg[j] = 1
    return bg


def islands(bg, w, h, min_frac=0.005):
    """Bounding boxes of the connected non-background regions, specks dropped, overlapping boxes merged."""
    seen = bytearray(w * h)
    boxes = []
    for start in range(w * h):
        if bg[start] or seen[start]: continue
        seen[start] = 1
        q = deque([start]); n = 0
        x0 = y0 = 10 ** 9; x1 = y1 = -1
        while q:
            i = q.popleft(); n += 1
            x, y = i % w, i // w
            x0, y0, x1, y1 = min(x0, x), min(y0, y), max(x1, x), max(y1, y)
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < w and 0 <= ny < h:
                    j = ny * w + nx
                    if not bg[j] and not seen[j]: seen[j] = 1; q.append(j)
        if n >= min_frac * w * h: boxes.append([x0, y0, x1, y1])
    merged = True
    while merged:
        merged = False
        for a in range(len(boxes)):
            for b in range(a + 1, len(boxes)):
                A, B = boxes[a], boxes[b]
                if A[0] <= B[2] and B[0] <= A[2] and A[1] <= B[3] and B[1] <= A[3]:
                    boxes[a] = [min(A[0], B[0]), min(A[1], B[1]), max(A[2], B[2]), max(A[3], B[3])]
                    boxes.pop(b); merged = True; break
            if merged: break
    return boxes


def reading_order(boxes):
    """Sort into rows (by vertical centre) then left to right."""
    if not boxes: return boxes
    heights = sorted(b[3] - b[1] for b in boxes)
    tol = heights[len(heights) // 2] / 2
    rows = []
    for b in sorted(boxes, key=lambda b: (b[1] + b[3]) / 2):
        cy = (b[1] + b[3]) / 2
        if rows and abs(cy - rows[-1][0]) <= tol: rows[-1][1].append(b)
        else: rows.append([cy, [b]])
    return [b for _, row in rows for b in sorted(row, key=lambda b: b[0])]


def save_badge(rgba, box, stem, w, h):
    pad = int(0.04 * max(box[2] - box[0], box[3] - box[1]))
    crop = (max(0, box[0] - pad), max(0, box[1] - pad), min(w, box[2] + 1 + pad), min(h, box[3] + 1 + pad))
    part = rgba.crop(crop)
    side = max(part.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(part, ((side - part.size[0]) // 2, (side - part.size[1]) // 2))
    for size in (512, 128):
        canvas.resize((size, size), Image.LANCZOS).save(f"{stem}-{size}.png", optimize=True)
    note = "  (smaller than 512 px in the source: upscaled)" if side < 512 else ""
    print(f"  {stem}: {side}px source{note}")


def main(argv):
    sheet = argv[:1] == ["--sheet"]
    if sheet: argv = argv[1:]
    if len(argv) < 2: sys.exit(__doc__)
    src = argv[0]
    im = Image.open(src).convert("RGB")
    w, h = im.size
    bg = background_mask(im)
    alpha = Image.frombytes("L", (w, h), bytes(0 if v else 255 for v in bg)).filter(ImageFilter.GaussianBlur(1.2))
    rgba = im.copy(); rgba.putalpha(alpha)
    if not sheet:
        box = list(alpha.point(lambda a: 255 if a > 8 else 0).getbbox()); box[2] -= 1; box[3] -= 1
        save_badge(rgba, box, argv[1], w, h)
        return
    outdir, names = argv[1], argv[2:]
    boxes = reading_order(islands(bg, w, h))
    if len(boxes) != len(names):
        sys.exit(f"Found {len(boxes)} badges in {src} but {len(names)} names were given. Check the sheet for badges that "
                 f"touch each other (they need white space between them) or stray marks, then try again.")
    print(f"{src}: {len(boxes)} badges")
    for box, name in zip(boxes, names):
        save_badge(rgba, box, f"{outdir.rstrip('/')}/{name}", w, h)


if __name__ == "__main__":
    main(sys.argv[1:])
