import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { sceneToStl, SCENE_UNITS_PER_MM } from './stl-scene';

const S = SCENE_UNITS_PER_MM;

/** A tagged mesh: unit plane (2 triangles) at the scene origin. */
function taggedPlane(layer: string): THREE.Mesh {
    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial(),
    );
    mesh.userData.stlLayer = layer;
    return mesh;
}

describe('sceneToStl', () => {
    it('exports each tagged layer as its own named solid', () => {
        const root = new THREE.Group();
        root.add(taggedPlane('tray'));
        root.add(taggedPlane('letters'));
        const stl = sceneToStl(root)!;
        expect(stl).toBeTypeOf('string');
        expect(stl).toContain('solid tray');
        expect(stl).toContain('solid letters');
        expect((stl.match(/^solid /gm) ?? []).length).toBe(2);
    });

    it('merges meshes that share a layer tag into one solid', () => {
        const root = new THREE.Group();
        root.add(taggedPlane('tray')); // e.g. the face
        root.add(taggedPlane('tray')); // e.g. a return, same rigid part
        const stl = sceneToStl(root)!;
        expect((stl.match(/^solid /gm) ?? []).length).toBe(1);
        // Two unit planes → four triangles total under one solid.
        expect((stl.match(/facet normal/g) ?? []).length).toBe(4);
    });

    it('inherits the nearest ancestor tag through nested groups', () => {
        const root = new THREE.Group();
        const layerGroup = new THREE.Group();
        layerGroup.userData.stlLayer = 'acrylic';
        const inner = new THREE.Group(); // untagged intermediate
        const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            new THREE.MeshBasicMaterial(),
        );
        inner.add(mesh);
        layerGroup.add(inner);
        root.add(layerGroup);
        const stl = sceneToStl(root)!;
        expect(stl).toContain('solid acrylic');
    });

    it('skips untagged meshes, non-mesh objects and stlSkip meshes', () => {
        const root = new THREE.Group();
        root.add(
            new THREE.Mesh(
                new THREE.PlaneGeometry(1, 1),
                new THREE.MeshBasicMaterial(),
            ),
        ); // untagged → dropped
        const line = new THREE.LineSegments(
            new THREE.BufferGeometry().setAttribute(
                'position',
                new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 1], 3),
            ),
        );
        line.userData.stlLayer = 'tray'; // tagged but NOT a mesh → dropped
        root.add(line);
        const skipped = taggedPlane('tray');
        skipped.userData.stlSkip = true; // explicit skip
        root.add(skipped);
        expect(sceneToStl(root)).toBeNull(); // nothing exportable
    });

    it('converts scene units (mm × S) back to millimetres', () => {
        const root = new THREE.Group();
        // A 100 mm plane sits at 100 × S scene units; after ÷S the STL must
        // report a 100 mm span (±50 about the origin).
        const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(100 * S, 100 * S),
            new THREE.MeshBasicMaterial(),
        );
        mesh.userData.stlLayer = 'tray';
        root.add(mesh);
        const stl = sceneToStl(root)!;
        const xs = [...stl.matchAll(/vertex (-?\d+\.\d+) /g)].map((m) =>
            parseFloat(m[1]),
        );
        expect(Math.max(...xs)).toBeCloseTo(50, 3);
        expect(Math.min(...xs)).toBeCloseTo(-50, 3);
    });

    it('applies world transforms (a translated part lands offset in mm)', () => {
        const root = new THREE.Group();
        // A 2 mm plane (±1 mm about its centre) in scene units.
        const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(2 * S, 2 * S),
            new THREE.MeshBasicMaterial(),
        );
        mesh.userData.stlLayer = 'tray';
        mesh.position.set(10 * S, 0, 0); // 10 mm to the right
        root.add(mesh);
        const stl = sceneToStl(root)!;
        const xs = [...stl.matchAll(/vertex (-?\d+\.\d+) /g)].map((m) =>
            parseFloat(m[1]),
        );
        // 2 mm plane (±1 mm) shifted +10 mm → spans 9 … 11 mm.
        expect(Math.max(...xs)).toBeCloseTo(11, 3);
        expect(Math.min(...xs)).toBeCloseTo(9, 3);
    });

    it('returns null for an empty scene', () => {
        expect(sceneToStl(new THREE.Group())).toBeNull();
    });
});
