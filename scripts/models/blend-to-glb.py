"""Export a source .blend to the plain .glb that scripts/build-models.mjs optimises.

Run with Blender's Python module (pip/uv package `bpy`, Python 3.13), not the system Python:

    uv venv -p 3.13 .bpy && uv pip install -p .bpy/bin/python bpy
    .bpy/bin/python -I scripts/models/blend-to-glb.py -- <in.blend> <out.glb> <model key>

What it does, per model (MODELS below):
- rebuilds every material as a flat Principled BSDF (the source's diffuse nodes and its
  external livery images are not shipped: neutral paint, no airline brand);
- names the objects for src/aircraftModel.js (`body`, `engines`, `gear_*`);
- turns the nose from Blender +X to glTF -Z (three's forward), scales to the real length and
  seats the lowest wheel at -gearHeight below the origin, the physics contact point
  (src/aircraft.js), so the wheels sit on the runway the flight model rolls on.
"""
import sys
import math
import bpy
from mathutils import Matrix, Vector

MODELS = {
    # OpenGameArt "jet airplane" by weirdybeardyman, CC0 (passengerjet_gear_down.blend).
    # 39.5 m: 737-800 overall length, Boeing 737 Airplane Characteristics for Airport
    # Planning (D6-58325-6), Fig. 2.2.1. gearHeight: src/aircraft.js b738.
    'twinjet': {
        'length_m': 39.5,
        'gear_height_m': 3.4,
        'names': {
            'Body': 'body', 'Engines': 'engines',
            'Front Gear': 'gear_nose', 'Front Gear Panel': 'gear_nose_door',
            'Rear Gear': 'gear_main', 'Rear Rear Panels': 'gear_main_doors',
        },
        # name: (base colour sRGB, metallic, roughness)
        'paint': {
            'Livery': ((0.93, 0.94, 0.96), 0.1, 0.45),
            'Engine': ((0.80, 0.82, 0.85), 0.2, 0.4),
            'EngineInterior': ((0.12, 0.13, 0.15), 0.3, 0.6),
            'EngineShiny': ((0.62, 0.64, 0.67), 0.8, 0.3),
            'Misc': ((0.55, 0.57, 0.60), 0.3, 0.5),
            'Tyre': ((0.06, 0.06, 0.06), 0.0, 0.9),
            'Hub': ((0.70, 0.71, 0.73), 0.6, 0.35),
        },
    },
}


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def main():
    args = sys.argv[sys.argv.index('--') + 1:]
    src, out, key = args
    cfg = MODELS[key]
    bpy.ops.wm.open_mainfile(filepath=src)

    for mat in bpy.data.materials:
        if mat.name not in cfg['paint']:
            raise SystemExit(f'unpainted material {mat.name}')
        rgb, metal, rough = cfg['paint'][mat.name]
        mat.use_nodes = True
        nt = mat.node_tree
        nt.nodes.clear()
        bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
        bsdf.inputs['Base Color'].default_value = (*[srgb_to_linear(c) for c in rgb], 1.0)
        bsdf.inputs['Metallic'].default_value = metal
        bsdf.inputs['Roughness'].default_value = rough
        outn = nt.nodes.new('ShaderNodeOutputMaterial')
        nt.links.new(bsdf.outputs['BSDF'], outn.inputs['Surface'])
    for img in list(bpy.data.images):
        bpy.data.images.remove(img)

    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    for o in list(bpy.data.objects):
        if o.type != 'MESH':
            bpy.data.objects.remove(o)
    for o in meshes:
        if o.name not in cfg['names']:
            raise SystemExit(f'unnamed object {o.name}')

    # Bake each object's transform into its mesh, then one transform for the whole model.
    for o in meshes:
        o.data.transform(o.matrix_world)
        o.matrix_world = Matrix.Identity(4)
    xs = [v.co.x for o in meshes for v in o.data.vertices]
    scale = cfg['length_m'] / (max(xs) - min(xs))
    rot = Matrix.Rotation(math.pi / 2, 4, 'Z')  # nose +X -> +Y (glTF -Z after Y-up export)
    for o in meshes:
        o.data.transform(rot @ Matrix.Scale(scale, 4))
    wheels = [v.co.z for o in meshes if cfg['names'][o.name].startswith('gear_') for v in o.data.vertices]
    lift = -cfg['gear_height_m'] - min(wheels)
    for o in meshes:
        o.data.transform(Matrix.Translation(Vector((0, 0, lift))))
        o.data.update()
        o.name = cfg['names'][o.name]
        o.data.name = o.name

    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True,
                              export_apply=True, export_animations=False,
                              export_materials='EXPORT', export_image_format='NONE')
    print(f'{key}: scale {scale:.4f}, lift {lift:.3f} m, {len(meshes)} meshes -> {out}')


main()
