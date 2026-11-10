"""Joins screenshots side by side so several screens can be reviewed at once.

Usage: python scripts/montage.py out.png shot1.png shot2.png ...
"""
import sys

from PIL import Image

out, *paths = sys.argv[1:]
images = [Image.open(p).convert('RGB') for p in paths]
gap = 16
height = max(i.height for i in images)
width = sum(i.width for i in images) + gap * (len(images) - 1)
sheet = Image.new('RGB', (width, height), (120, 120, 120))
x = 0
for image in images:
    sheet.paste(image, (x, 0))
    x += image.width + gap
sheet.save(out)
print(out, sheet.size)
