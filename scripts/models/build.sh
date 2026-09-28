#!/bin/sh
# Rebuild the site's Blender models in public/models (see README.md):
#   PYTHON=/path/to/python-with-bpy scripts/models/build.sh [chip] [tower]
# With no names, builds both.
set -e
cd "$(dirname "$0")"
for model in ${*:-chip tower}; do
  "${PYTHON:-python3}" "build_$model.py"
  # meshopt-compressed and quantized; -kn keeps every part's name for the site
  npx --yes gltfpack@1.3.0 -i "out/$model-raw.glb" -o "../../public/models/$model.glb" -cc -kn -km -vp 12 -vn 8
  ls -l "../../public/models/$model.glb"
done
