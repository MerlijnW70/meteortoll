#!/usr/bin/env python3
# Usage, from the repository root: python scripts/render-icons.py (needs Pillow).
# Renders the meteortoll mark (app/src/app/icon.svg: a 3x3 matrix on the accent colour) to the
# raster icons browsers and phones ask for. Same geometry as the SVG, supersampled for clean edges.
from PIL import Image, ImageDraw
ACCENT = (0x8b, 0x7c, 0xff)
INK = (0x0a, 0x0b, 0x0e)
FAINT = tuple(round(0.55 * i + 0.45 * a) for i, a in zip(INK, ACCENT))
def mark(size, rounded=True, ss=8):
    s = size * ss / 64
    img = Image.new('RGBA', (size * ss, size * ss), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, size * ss - 1, size * ss - 1], radius=(14 * s if rounded else 0), fill=ACCENT)
    for r, y in enumerate((14, 27.5, 41)):
        for c, x in enumerate((14, 27.5, 41)):
            d.rounded_rectangle([x * s, y * s, (x + 9) * s, (y + 9) * s], radius=2 * s, fill=(FAINT if (r + c) % 2 else INK))
    return img.resize((size, size), Image.LANCZOS)
out = 'app/src/app/'
mark(256).save(out + 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
mark(180, rounded=False).convert('RGB').save(out + 'apple-icon.png')
mark(512).save('app/public/icon-512.png')
mark(192).save('app/public/icon-192.png')
print('ok')
