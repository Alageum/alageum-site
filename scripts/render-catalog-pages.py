#!/usr/bin/env python3
"""Render the authorized, reviewed catalog as compact source-page images."""
import argparse
import hashlib
from pathlib import Path
import fitz
from PIL import Image
parser = argparse.ArgumentParser()
parser.add_argument('--pdf', required=True, type=Path)
parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'frontend/public/catalog-source')
args = parser.parse_args()
assert hashlib.sha256(args.pdf.read_bytes()).hexdigest() == '5cc9f57bf3ed16be6f168c0fff25f02a444675146919bfd277b7e722e640cefc', 'Unexpected source; review before publishing'
args.output.mkdir(parents=True, exist_ok=True)
with fitz.open(args.pdf) as document:
    assert len(document) == 104
    for index, page in enumerate(document):
        pixmap = page.get_pixmap(dpi=170)
        image = Image.frombytes('RGB', (pixmap.width, pixmap.height), pixmap.samples)
        image.save(args.output / f'page-{index + 1:03}.webp', quality=88, method=4)
print('Rendered all 104 reviewed source pages')
