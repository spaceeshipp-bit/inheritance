#!/usr/bin/env bash
# Render a list of exported scenes at full quality, then clean each one up.
#   tools/render/queue.sh <dir> "<name> <mode> [args...]" ...
# Each <dir>/<name>.glb + .camera.json becomes <dir>/final-<name>.png.
set -u
dir="$1"; shift
here="$(cd "$(dirname "$0")" && pwd)"
for job in "$@"; do
  # shellcheck disable=SC2086
  set -- $job
  name="$1"; mode="$2"; shift 2
  start=$(date +%s)
  nice -n 5 blender -b -P "$here/cycles_render.py" -- "$dir/$name.glb" "$dir/$name.camera.json" "$dir/raw-$name.png" \
    --mode "$mode" --samples "${SAMPLES:-256}" --size "${SIZE:-1920x1080}" "$@" > "$dir/raw-$name.log" 2>&1
  /usr/bin/python3.12 "$here/denoise.py" "$dir/raw-$name.png" "$dir/final-$name.png" "${DENOISE:-4}" >> "$dir/raw-$name.log" 2>&1
  echo "$name done in $(( $(date +%s) - start )) s"
done
