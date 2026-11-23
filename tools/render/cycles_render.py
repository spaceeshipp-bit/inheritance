"""Offline "beauty" renders of the game's real scenes in Blender's Cycles.

The look-dev page exports a map with the family posed (tests/e2e/sceneexport.ts);
this script imports it, upgrades the materials for a path tracer (bevelled edges,
gentle surface variation, glossy wood and brass, soft lamps), lights it with the
map's own lamps plus a soft fill, adds depth of field, and renders.

  blender -b -P tools/render/cycles_render.py -- <scene.glb> <camera.json> <out.png>
      [--mode interior|overview|outdoor] [--samples 192] [--size 1920x1080]
      [--exposure 0] [--fstop 2.8] [--lamps 1.0]

`overview` makes every back face see-through, so a cut-away from above looks
straight into the rooms through ceilings and walls facing away from the camera.
"""
import json
import math
import sys

import bpy
from mathutils import Vector


def args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    pos = [a for a in argv if not a.startswith("--")]
    opts = {}
    i = 0
    while i < len(argv):
        if argv[i].startswith("--"):
            opts[argv[i][2:]] = argv[i + 1]
            i += 2
        else:
            i += 1
    return pos, opts


(glb, cam_json, out), opts = args()[0][:3], args()[1]
mode = opts.get("mode", "interior")
modes = set(mode.split(","))  # e.g. "outdoor,overview"
overview = "overview" in modes
outdoor = "outdoor" in modes
samples = int(opts.get("samples", "192"))
w, h = (int(x) for x in opts.get("size", "1920x1080").split("x"))
exposure = float(opts.get("exposure", "0"))
fstop = float(opts.get("fstop", "1.2" if overview else "2.8"))
lamp_k = float(opts.get("lamps", "1.0"))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
scene = bpy.context.scene

# The glTF is y-up; Blender is z-up. The importer converts, so game (x, y, z) is Blender (x, -z, y).
def g2b(v):
    return Vector((v[0], -v[2], v[1]))


# ── Materials ──
def upgrade(mat):
    if not mat or not mat.use_nodes:
        return
    nt = mat.node_tree
    bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    out_node = next((n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"), None)
    if not bsdf or not out_node:
        return
    name = mat.name.lower()
    # Soft, rounded edges on every box: the single biggest step from "primitive" to "toy".
    bevel = nt.nodes.new("ShaderNodeBevel")
    bevel.inputs["Radius"].default_value = 0.018
    bevel.samples = 6
    # A whisper of surface variation so flat colours read as painted wood, plaster, cloth.
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 140.0
    noise.inputs["Detail"].default_value = 3.0
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.035
    bump.inputs["Distance"].default_value = 0.002
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bevel.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    metal = bsdf.inputs["Metallic"].default_value
    rough = bsdf.inputs["Roughness"].default_value
    if metal > 0.5:
        bsdf.inputs["Roughness"].default_value = min(rough, 0.32)  # brass and steel that gleam
    elif rough < 0.75:
        # Varnish: a clear coat on anything not matte (wood, lacquer, tiles).
        if "Coat Weight" in bsdf.inputs:
            bsdf.inputs["Coat Weight"].default_value = 0.12
            bsdf.inputs["Coat Roughness"].default_value = 0.15
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.45
    # Skin and cloth: a little sheen on soft materials.
    if rough > 0.85 and "Sheen Weight" in bsdf.inputs:
        bsdf.inputs["Sheen Weight"].default_value = 0.25
    # Emissive things (bulbs, windows, screens) glow a little more under a path tracer.
    if "Emission Strength" in bsdf.inputs and bsdf.inputs["Emission Strength"].default_value > 0:
        bsdf.inputs["Emission Strength"].default_value *= 2.2
    if overview:
        # Back faces (ceilings seen from above, the far side of walls) are see-through.
        geo = nt.nodes.new("ShaderNodeNewGeometry")
        transp = nt.nodes.new("ShaderNodeBsdfTransparent")
        mix = nt.nodes.new("ShaderNodeMixShader")
        surf = out_node.inputs["Surface"].links[0].from_socket if out_node.inputs["Surface"].links else bsdf.outputs["BSDF"]
        nt.links.new(geo.outputs["Backfacing"], mix.inputs["Fac"])
        nt.links.new(surf, mix.inputs[1])
        nt.links.new(transp.outputs["BSDF"], mix.inputs[2])
        nt.links.new(mix.outputs["Shader"], out_node.inputs["Surface"])


for m in bpy.data.materials:
    upgrade(m)
    # Double-sided materials would make the overview's back faces solid again.
    m.use_backface_culling = False

# ── Lights: the map's own lamps, softened; a fill so nothing is pitch black ──
for ob in list(scene.objects):
    if ob.type == "LIGHT":
        ld = ob.data
        if ld.type == "POINT":
            # The importer turns the game's candela into a few watts; a room lamp wants ~100-200 W.
            ld.energy *= 350 * lamp_k
            ld.shadow_soft_size = 0.25
        elif ld.type == "SUN":
            ld.angle = math.radians(2.5)
    if ob.type == "CAMERA":
        bpy.data.objects.remove(ob, do_unlink=True)

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
    bg.inputs["Strength"].default_value = 0.3
    has_sun = any(o.type == "LIGHT" and o.data.type == "SUN" for o in scene.objects)
    sun = bpy.data.lights.new("Sun", "SUN")
    sun.energy = 2.6
    sun.angle = math.radians(1.5)
    sun.color = (1.0, 0.95, 0.86)
    so = bpy.data.objects.new("Sun", sun)
    so.rotation_euler = (math.radians(48), 0, math.radians(140))
    if not has_sun:
        scene.collection.objects.link(so)
else:
    bg.inputs["Color"].default_value = (0.55, 0.47, 0.40, 1.0)  # warm bounce from the rooms
    bg.inputs["Strength"].default_value = (0.9 if overview else 0.35) * float(opts.get("fill", "1"))
    # What the camera sees beyond the walls: a deep, warm dark, not the fill light.
    nt = world.node_tree
    lp = nt.nodes.new("ShaderNodeLightPath")
    dark = nt.nodes.new("ShaderNodeBackground")
    dark.inputs["Color"].default_value = (0.035, 0.026, 0.022, 1.0)
    mix = nt.nodes.new("ShaderNodeMixShader")
    wout = next(n for n in nt.nodes if n.type == "OUTPUT_WORLD")
    nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs["Fac"])
    nt.links.new(bg.outputs["Background"], mix.inputs[1])
    nt.links.new(dark.outputs["Background"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], wout.inputs["Surface"])

# ── Camera ──
with open(cam_json) as f:
    cj = json.load(f)
cam_data = bpy.data.cameras.new("Cam")
cam = bpy.data.objects.new("Cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
# Overrides in game coordinates: --campos x,y,z --camlook x,y,z; --zoom narrows the view (2 = twice as close).
if "campos" in opts:
    cj["pos"] = [float(v) for v in opts["campos"].split(",")]
if "camlook" in opts:
    cj["look"] = [float(v) for v in opts["camlook"].split(",")]
cj["fov"] = math.degrees(2 * math.atan(math.tan(math.radians(cj["fov"]) / 2) / float(opts.get("zoom", "1"))))
pos, look = g2b(cj["pos"]), g2b(cj["look"])
cam.location = pos
direction = look - pos
cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
cam_data.sensor_fit = "VERTICAL"
cam_data.angle_y = math.radians(cj["fov"])
cam_data.clip_end = 500
cam_data.dof.use_dof = True
cam_data.dof.aperture_fstop = fstop
# Focus on what the camera looks at (the family), a little nearer than the look point.
focus = float(opts.get("focus", "0")) or (direction.length * 0.9 if overview else direction.length)
cam_data.dof.focus_distance = focus

# ── Render ──
scene.render.engine = "CYCLES"
cy = scene.cycles
cy.device = "CPU"
cy.samples = samples
cy.use_adaptive_sampling = True
cy.adaptive_threshold = 0.015
cy.max_bounces = 8
cy.diffuse_bounces = 4
cy.glossy_bounces = 4
cy.transparent_max_bounces = 16
cy.caustics_reflective = False
cy.caustics_refractive = False
cy.sample_clamp_indirect = 6.0
# This Blender build has no OpenImageDenoise: sample more, and clean up afterwards
# (tools/render/denoise.py, non-local means) if needed.
cy.use_denoising = False
scene.render.resolution_x = w
scene.render.resolution_y = h
scene.render.resolution_percentage = 100
scene.render.film_transparent = False
vs = scene.view_settings
try:
    vs.view_transform = "AgX"
    vs.look = "AgX - Punchy" if outdoor else "AgX - Medium High Contrast"
except TypeError:
    vs.view_transform = "Filmic"
    vs.look = "Medium High Contrast"
vs.exposure = exposure
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = out
bpy.ops.render.render(write_still=True)
print("RENDERED", out)
