/**
 * Scene → STL walker. Bridges the live three.js scene to the pure ASCII-STL
 * serialiser: it traverses an assembled sign, groups every tagged mesh's
 * triangles by its layer, and hands the millimetre vertex soup to buildAsciiStl.
 *
 * Kept out of the (client-only) Scene3D component so it can be unit-tested with
 * a hand-built three.js scene — BufferGeometry + matrix maths are pure JS and
 * need no WebGL context. Scene3D is a one-line caller (`sceneToStl(scene)`).
 *
 * Tagging contract (set by Scene3D via `userData`):
 *   - `stlLayer: string` on a group/mesh → its subtree exports under that solid.
 *     The NEAREST tagged ancestor wins, so nested groups inherit their layer.
 *   - no tag anywhere up the chain → the mesh is annotation (register lines,
 *     glow, hit targets, dimensions) and is left out of the export.
 *   - `stlSkip: true` → explicitly drop this mesh even if an ancestor is tagged.
 */
import * as THREE from 'three';
import { buildAsciiStl, type StlSolidInput } from './stl-export';

/**
 * Scene units per millimetre — Scene3D renders at `mm × S` with S = 0.01, so we
 * divide world coordinates by this to emit a true-millimetre STL.
 */
export const SCENE_UNITS_PER_MM = 0.01;

/** Nearest ancestor (incl. self) carrying an `stlLayer` tag, or null. */
function nearestLayer(obj: THREE.Object3D): string | null {
    let p: THREE.Object3D | null = obj;
    while (p) {
        const tag = (p.userData as { stlLayer?: unknown } | undefined)?.stlLayer;
        if (typeof tag === 'string' && tag.length > 0) return tag;
        p = p.parent;
    }
    return null;
}

/**
 * Walk `root` and serialise every tagged layer into one multi-solid ASCII STL
 * (true millimetres). Returns null when nothing exportable is found (e.g. the
 * scene isn't mounted, or carries only annotation geometry).
 */
export function sceneToStl(
    root: THREE.Object3D,
    opts: { unitsPerMm?: number } = {},
): string | null {
    try {
        const S = opts.unitsPerMm ?? SCENE_UNITS_PER_MM;
        root.updateMatrixWorld(true);
        // Layer name → flat triangle vertices (mm), 9 numbers per triangle.
        const buckets = new Map<string, number[]>();
        const v = new THREE.Vector3();
        root.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (!mesh.isMesh) return; // lines / edges / dimensions aren't solids
            if ((mesh.userData as { stlSkip?: unknown })?.stlSkip) return;
            const layer = nearestLayer(obj);
            if (!layer) return; // untagged → not part of the physical sign
            const geom = mesh.geometry as THREE.BufferGeometry | undefined;
            const pos = geom?.getAttribute('position') as
                | THREE.BufferAttribute
                | undefined;
            if (!geom || !pos) return;
            const world = mesh.matrixWorld;
            let out = buckets.get(layer);
            if (!out) {
                out = [];
                buckets.set(layer, out);
            }
            const push = (i: number) => {
                v.fromBufferAttribute(pos, i).applyMatrix4(world);
                out!.push(v.x / S, v.y / S, v.z / S);
            };
            const index = geom.getIndex();
            if (index) {
                for (let i = 0; i < index.count; i++) push(index.getX(i));
            } else {
                for (let i = 0; i < pos.count; i++) push(i);
            }
        });
        const solids: StlSolidInput[] = [...buckets.entries()].map(
            ([name, positions]) => ({ name, positions }),
        );
        const stl = buildAsciiStl(solids);
        return stl.length > 0 ? stl : null;
    } catch (e) {
        // Surface the real cause in the console — the caller only sees a null,
        // so without this a genuine failure is invisible to whoever's debugging.
        console.error('sceneToStl failed:', e);
        return null;
    }
}
