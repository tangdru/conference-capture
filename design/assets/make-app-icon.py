"""Render the app icon: a teal ring with a magenta ring over it, centred
with equal padding on a near-black square.

    python3 design/assets/make-app-icon.py

Writes the 1024px icon into the Xcode asset catalog and a copy to
design/assets/app-icon-preview.png. Needs Pillow.
"""
from pathlib import Path

from PIL import Image, ImageDraw

N = 1024
K = 4  # supersampling for smooth edges
PAD_X = 158  # gap left and right of the rings; top/bottom follows from their shape
STROKE = 18  # ring thickness at 1024px

BG = (15, 15, 13)
TEAL = (0, 240, 224)
MAGENTA = (255, 45, 120)

# The rings' outer bounding boxes as tuned by eye (x0, y0, x1, y1 at 1024px).
# Only their size and position relative to each other matter -- the pair is
# scaled and centred below.
teal = (205, 205, 933, 933)
magenta = (144, 126, 759, 741)

x0 = min(teal[0], magenta[0])
y0 = min(teal[1], magenta[1])
x1 = max(teal[2], magenta[2])
y1 = max(teal[3], magenta[3])
scale = (N - 2 * PAD_X) / (x1 - x0)
dx = (N - (x1 - x0) * scale) / 2
dy = (N - (y1 - y0) * scale) / 2


def place(box):
    return tuple(
        ((v - (x0 if i % 2 == 0 else y0)) * scale + (dx if i % 2 == 0 else dy)) * K
        for i, v in enumerate(box)
    )


img = Image.new('RGB', (N * K, N * K), BG)
draw = ImageDraw.Draw(img)
draw.ellipse(place(teal), outline=TEAL, width=STROKE * K)
draw.ellipse(place(magenta), outline=MAGENTA, width=STROKE * K)
img = img.resize((N, N), Image.LANCZOS)

root = Path(__file__).resolve().parents[2]
img.save(root / 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png')
img.save(root / 'design/assets/app-icon-preview.png')
