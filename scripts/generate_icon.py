#!/usr/bin/env python3
"""出番表 app icon generator.

Framework rules this obeys (framework/CORE.md, framework/web.md):
  - Pillow only. No SVG, no cairo, no design tool, no hand-placed binary.
  - Drawn at 4x and downsampled with LANCZOS so edges are anti-aliased.
  - Plain opaque square: no transparency, no pre-rounded corners, no shine.
    iOS applies the rounding and the mask itself.
  - It must still read at 40px.

    python3 scripts/generate_icon.py          # write all candidates + previews
    python3 scripts/generate_icon.py --pick b # install candidate b as the icon

Font note: candidate A needs a Japanese face. Hiragino ships with macOS; if it
is absent the script says so and skips A rather than silently drawing tofu.
"""
import sys, os
from PIL import Image, ImageDraw, ImageFont

S = 180            # shipped size
D = S * 4          # draw size (4x, per the framework)
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets')
PREV = os.path.join(os.path.dirname(__file__), '..', '.icon-preview')

RED   = (161,   0,  14)
INK   = ( 28,  26,  23)
CREAM = (250, 248, 245)
WHITE = (255, 255, 255)
DIM   = (200, 192, 182)

FONTS = [
    '/System/Library/Fonts/ヒラギノ角ゴシック W8.ttc',
    '/System/Library/Fonts/ヒラギノ角ゴシック W7.ttc',
    '/System/Library/Fonts/Hiragino Sans GB.ttc',
]

def jp_font(size):
    for p in FONTS:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return None

def canvas(bg):
    # RGB, not RGBA: an opaque square is required, so transparency is not
    # merely unused here, it is impossible to introduce by accident.
    return Image.new('RGB', (D, D), bg)


def cand_a():
    """出 — the first character of 出番表. A single heavy glyph is the most
    legible thing that exists at 40px, and it names the app outright."""
    img = canvas(RED); d = ImageDraw.Draw(img)
    f = jp_font(int(D * 0.66))
    if f is None:
        return None
    box = d.textbbox((0, 0), '出', font=f)
    w, h = box[2] - box[0], box[3] - box[1]
    d.text((D / 2 - w / 2 - box[0], D / 2 - h / 2 - box[1]), '出', font=f, fill=CREAM)
    return img


def cand_b():
    """A schedule read top to bottom, with one slot lit — the app inverts the
    theatre's calendar to pick out one performer's rows. Horizontal bands are
    the composition Load-Bearing used precisely because they survive 40px."""
    # On cream this had no presence at 40px and the bands mushed together, so
    # it is drawn on ink instead - the 40px test rejected the first version.
    img = canvas(INK); d = ImageDraw.Draw(img)
    rows, m = 4, int(D * 0.16)
    gap = int(D * 0.055)
    bh = (D - 2 * m - gap * (rows - 1)) // rows
    for i in range(rows):
        y = m + i * (bh + gap)
        lit = (i == 1)
        # The lit row runs full width; the others stop short, so the difference
        # is a length difference as well as a colour one and survives greyscale.
        x1 = D - m if lit else int(D - m - (D * 0.17 if i % 2 else D * 0.30))
        d.rounded_rectangle([m, y, x1, y + bh], radius=bh // 2,
                            fill=RED if lit else CREAM if i == 0 else (92, 86, 79))
    return img


def cand_c():
    """めくり — the placard flipped on stage naming who is on now. A white card
    on red, with two heavy rules standing in for the name."""
    img = canvas(RED); d = ImageDraw.Draw(img)
    cw, ch = int(D * 0.46), int(D * 0.62)
    x, y = (D - cw) // 2, (D - ch) // 2
    d.rectangle([x, y, x + cw, y + ch], fill=CREAM)
    lh = int(ch * 0.13)
    for i, frac in enumerate((0.20, 0.46)):
        ly = y + int(ch * frac)
        pad = int(cw * (0.16 if i == 0 else 0.26))
        d.rounded_rectangle([x + pad, ly, x + cw - pad, ly + lh],
                            radius=lh // 2, fill=INK)
    d.rounded_rectangle([x + int(cw * 0.16), y + int(ch * 0.72),
                         x + int(cw * 0.60), y + int(ch * 0.72) + lh],
                        radius=lh // 2, fill=RED)
    return img


CANDIDATES = {'a': ('出 kanji on red', cand_a),
              'b': ('schedule rows, one lit', cand_b),
              'c': ('めくり placard', cand_c)}


def shrink(img, size):
    return img.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(PREV, exist_ok=True)
    if '--pick' in sys.argv:
        key = sys.argv[sys.argv.index('--pick') + 1]
        img = CANDIDATES[key][1]()
        if img is None:
            sys.exit(f'candidate {key} could not be drawn (missing font)')
        os.makedirs(OUT, exist_ok=True)
        path = os.path.join(OUT, 'apple-touch-icon.png')
        shrink(img, S).save(path)
        with Image.open(path) as v:
            print(f'wrote {path}  {v.size[0]}x{v.size[1]} {v.mode}')
            assert v.mode == 'RGB', 'icon must be opaque RGB'
        return

    # Contact sheet: each candidate at 1024 (judge the composition and check the
    # silhouette is not a creature) and at 40 (judge whether it survives).
    sheet = Image.new('RGB', (3 * 1024 + 4 * 40, 1024 + 200 + 80), (255, 255, 255))
    sd = ImageDraw.Draw(sheet)
    for i, (k, (label, fn)) in enumerate(CANDIDATES.items()):
        img = fn()
        if img is None:
            print(f'  candidate {k}: SKIPPED - no Japanese font found'); continue
        x = 40 + i * (1024 + 40)
        sheet.paste(shrink(img, 1024), (x, 40))
        for j, px in enumerate((40, 80, 120)):
            sheet.paste(shrink(img, px), (x + j * 170, 1024 + 90))
        sd.text((x, 1024 + 240), f'{k}: {label}', fill=(0, 0, 0))
        shrink(img, S).save(os.path.join(PREV, f'candidate-{k}.png'))
        print(f'  candidate {k}: {label}')
    sheet.save(os.path.join(PREV, 'candidates.png'))
    print(f'\ncontact sheet: {os.path.join(PREV, "candidates.png")}')


if __name__ == '__main__':
    main()
