"""Bake a map's lighting into its lightmap (see client/src/render/lightmap.ts).

Input: the map exported with `sceneexport.ts <map>:bake` (static geometry with
the game's lightmap UVs in TEXCOORD_1, and the map's lamps) and its layout
(.layout.json, with the signature the game checks). Cycles path-traces the
light falling on every wall, floor and piece of furniture (direct and bounced,
without the surface's own colour) into the atlas; the result is saved as an
8-bit JPEG scaled to fit, with a .json carrying the signature and the scale.

  blender -b -P tools/render/bake_lightmap.py -- <map-bake.glb> <map-bake.layout.json> <out-dir> <map>
      [--samples 96] [--mode interior|outdoor] [--lamps 1.0] [--fill 1.0]

Writes <out-dir>/<map>.jpg and <out-dir>/<map>.json (client/public/lightmaps/).
"""
import json
import math
import os
import sys

import bpy
import numpy as np


def parse():
    argv = sys.argv[sys.argv.index("--") + 1:]
    pos = [a for a in argv if not a.startswith("--")]
    opts, i = {}, 0
    while i < len(argv):
        if argv[i].startswith("--"):
            opts[argv[i][2:]] = argv[i + 1]
            i += 2
        else:
            i += 1
    return pos, opts


(glb, layout_path, out_dir, map_id), opts = parse()[0][:4], parse()[1]
samples = int(opts.get("samples", "96"))
outdoor = opts.get("mode", "interior") == "outdoor"
lamp_k = float(opts.get("lamps", "1.0"))
fill_k = float(opts.get("fill", "1.0"))
with open(layout_path) as f:
    layout = json.load(f)
size = int(layout["size"])

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
scene = bpy.context.scene

# Light the house as the beauty renders do (tools/render/cycles_render.py).
for ob in list(scene.objects):
    if ob.type == "LIGHT" and ob.data.type == "POINT":
        ob.data.energy *= 350 * lamp_k
        ob.data.shadow_soft_size = 0.25
    if ob.type == "CAMERA":
        bpy.data.objects.remove(ob, do_unlink=True)
for m in bpy.data.materials:
    if not m.use_nodes:
        continue
    bsdf = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf and bsdf.inputs["Emission Strength"].default_value > 0:
        bsdf.inputs["Emission Strength"].default_value *= 2.2

world = bpy.data.worlds.new("World")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
if outdoor:
    sky = world.node_tree.nodes.new("ShaderNodeTexSky")
    sky.sky_type = "NISHITA"
    sky.sun_elevation = math.radians(38)
    sky.sun_rotation = math.radians(140)
    sky.sun_intensity = 0.3
    world.node_tree.links.new(sky.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 0.3 * fill_k
    if not any(o.type == "LIGHT" and o.data.type == "SUN" for o in scene.objects):
        sun = bpy.data.lights.new("Sun", "SUN")
        sun.energy = 2.6
        sun.angle = math.radians(1.5)
        so = bpy.data.objects.new("Sun", sun)
        so.rotation_euler = (math.radians(48), 0, math.radians(140))
        scene.collection.objects.link(so)
else:
    bg.inputs["Color"].default_value = (0.55, 0.47, 0.40, 1.0)
    bg.inputs["Strength"].default_value = 0.35 * fill_k

# The targets: the merged static blockers, which carry the game's lightmap UVs as their second UV map.
targets = [o for o in scene.objects if o.type == "MESH" and o.name.startswith("static-blocker") and len(o.data.uv_layers) >= 2]
if not targets:
    raise SystemExit("no static-blocker meshes with a second UV map in " + glb)
img = bpy.data.images.new("Lightmap", size, size, alpha=False, float_buffer=True)
done = set()
for o in targets:
    o.data.uv_layers.active_index = 1  # bake into the lightmap UVs
    for slot in o.material_slots:
        m = slot.material
        if not m or m.name in done:
            continue
        done.add(m.name)
        m.use_nodes = True
        node = m.node_tree.nodes.new("ShaderNodeTexImage")
        node.image = img
        m.node_tree.nodes.active = node
for o in scene.objects:
    o.select_set(o in targets)
bpy.context.view_layer.objects.active = targets[0]

scene.render.engine = "CYCLES"
cy = scene.cycles
cy.device = "CPU"
cy.samples = samples
cy.max_bounces = 6
cy.diffuse_bounces = 4
cy.sample_clamp_indirect = 6.0
cy.use_denoising = False
bake = scene.render.bake
bake.margin = 4
bake.margin_type = "EXTEND"
bake.target = "IMAGE_TEXTURES"
bake.use_clear = True
print("BAKING", len(targets), "objects into", size, "x", size, "at", samples, "samples")
bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, margin=4, use_clear=True)

# Linear light, bottom row first. Scale so the brightest (99.7th percentile) fits, then sRGB-encode to 8 bits.
px = np.array(img.pixels[:], dtype=np.float32).reshape(size, size, 4)[:, :, :3]
peak = float(np.percentile(px.max(axis=2), 99.7))
scale = max(peak, 1e-3)
v = np.clip(px / scale, 0, 1)
srgb = np.where(v <= 0.0031308, v * 12.92, 1.055 * np.power(v, 1 / 2.4) - 0.055)
# Blender's row 0 is the bottom (v = 0) after its glTF importer flipped v; the game reads the file with
# flipY, so the file's top row must be v = 0 in Blender's terms: write the rows as they are.
rgb8 = (np.clip(srgb, 0, 1) * 255 + 0.5).astype(np.uint8)
os.makedirs(out_dir, exist_ok=True)
jpg = os.path.join(out_dir, map_id + ".jpg")
try:
    import cv2
    bgr = np.ascontiguousarray(rgb8[:, :, ::-1])
    # Take out the path tracer's grain (charts are padded, so little bleeds between them).
    strength = float(opts.get("denoise", "7"))
    if strength > 0:
        bgr = cv2.fastNlMeansDenoisingColored(bgr, None, strength, strength, 5, 15)
    cv2.imwrite(jpg, bgr, [cv2.IMWRITE_JPEG_QUALITY, 90])
except ImportError:
    out = bpy.data.images.new("Out", size, size, alpha=False)
    out.pixels[:] = np.dstack([rgb8 / 255.0, np.ones((size, size, 1))]).astype(np.float32).ravel()
    out.filepath_raw = jpg
    out.file_format = "JPEG"
    out.save()
with open(os.path.join(out_dir, map_id + ".json"), "w") as f:
    json.dump({"signature": layout["signature"], "scale": scale}, f, indent=2)
print("BAKED", jpg, "scale", scale)
