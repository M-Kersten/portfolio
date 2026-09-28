#!/bin/sh
# Rebuild public/models/chip.glb from the Blender source (see README.md).
#   PYTHON=/path/to/python-with-bpy scripts/models/build-chip.sh
set -e
cd "$(dirname "$0")"
"${PYTHON:-python3}" build_chip.py
# meshopt-compressed and quantized; -kn keeps every part's name for the site
npx --yes gltfpack@1.3.0 -i out/chip-raw.glb -o ../../public/models/chip.glb -cc -kn -km -vp 12 -vn 8
ls -l ../../public/models/chip.glb
