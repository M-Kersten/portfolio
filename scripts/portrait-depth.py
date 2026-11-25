#!/usr/bin/env python3
"""The depth map behind the About portrait's relief (public/profile/depth.png).

The last portrait is drawn as a point cloud (src/components/home/PortraitRelief.tsx):
every dot of the photo, pushed towards you by this map. White is nearest, black
is the back plane. Run it again after changing the last photo:

    pip install onnxruntime numpy pillow
    curl -L -o depth-anything-v2-small.onnx \\
      https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model.onnx
    python3 scripts/portrait-depth.py depth-anything-v2-small.onnx

It runs on your own machine; the photo goes nowhere. The model (Depth Anything
V2, small, 99 MB) isn't kept in the repository.

What it does:
  1. The photo is a dither, so it's blurred back into greys first, which is
     enough for the model to see a person in.
  2. The model's depth puts the arms far in front of everything and leaves the
     face nearly flat. So the depth is split in two: each part's own level (an
     edge-keeping blur), which is pulled together, and the relief within a part
     (nose, cheeks, the round of an arm), which is pushed out.
  3. Everything behind the body is one back plane.

LO, LEVEL and RELIEF below are the knobs. The map's white stands for the
`DEPTH` photo pixels in PortraitRelief.tsx: the script prints the figure to put
there.
"""
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
PHOTO = ROOT / 'public/profile/5.png'
OUT = ROOT / 'public/profile/depth.png'

LO = 0.40  # the model's depth (0 far .. 1 near) behind which everything is the back plane
LEVEL = 300  # photo pixels of depth per unit, between the parts (arms, chest, head)
RELIEF = 1000  # the same within a part: the face's own shape, exaggerated


def estimate(model: str) -> np.ndarray:
    im = Image.open(PHOTO).convert('RGBA')
    bg = Image.new('RGBA', im.size, (0, 0, 0, 255))
    bg.alpha_composite(im)
    a = np.asarray(bg.convert('L').filter(ImageFilter.GaussianBlur(3)), dtype=np.float32) / 255
    a = np.clip(a / max(1e-6, np.percentile(a, 99.5)), 0, 1) ** 0.8  # sparse dots blur to a dim grey: lift it
    soft = Image.fromarray((a * 255).astype(np.uint8)).convert('RGB')
    w = 518  # the model's size: multiples of 14
    h = round(w * im.height / im.width / 14) * 14
    x = np.asarray(soft.resize((w, h), Image.BICUBIC), dtype=np.float32) / 255
    x = ((x - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]).transpose(2, 0, 1)[None].astype(np.float32)
    s = ort.InferenceSession(model, providers=['CPUExecutionProvider'])
    d = s.run(None, {s.get_inputs()[0].name: x})[0][0]
    return (d - d.min()) / (d.max() - d.min())


def relief(d: np.ndarray) -> np.ndarray:
    h, w = d.shape
    d0 = np.maximum(d, LO)
    # each part's own level: a blur that doesn't cross a step in depth (bilateral), at half size
    small = np.asarray(Image.fromarray(d0).resize((w // 2, h // 2), Image.BILINEAR), dtype=np.float32)
    r, ss, sr = 36, 18.0, 0.035
    pad = np.pad(small, r, mode='edge')
    acc = np.zeros_like(small)
    wsum = np.zeros_like(small)
    sh, sw = small.shape
    for dy in range(-r, r + 1, 2):
        for dx in range(-r, r + 1, 2):
            n = pad[r + dy : r + dy + sh, r + dx : r + dx + sw]
            wt = np.exp(-(dx * dx + dy * dy) / (2 * ss * ss) - (n - small) ** 2 / (2 * sr * sr))
            acc += wt * n
            wsum += wt
    base = np.asarray(Image.fromarray(acc / wsum).resize((w, h), Image.BILINEAR), dtype=np.float32)
    return np.maximum(LEVEL * (base - LO) + RELIEF * (d0 - base), 0)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    z = relief(estimate(sys.argv[1]))
    photo = Image.open(PHOTO)
    out = Image.fromarray(np.clip(z / z.max() * 255, 0, 255).astype(np.uint8)).resize((photo.width // 2, photo.height // 2), Image.LANCZOS)
    out.save(OUT, optimize=True)
    print(f'{OUT.relative_to(ROOT)} written. Its white is {z.max():.0f} photo pixels: set DEPTH in PortraitRelief.tsx to that.')
