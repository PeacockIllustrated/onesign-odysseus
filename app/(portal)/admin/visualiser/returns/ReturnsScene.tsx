'use client';

/**
 * Built-up letter 3D preview.
 *
 * Reuses the visualiser's geometry approach (THREE.Shape → extrudeGeometry,
 * exactly like the panel FacePlane / neon ShapedBackboard): each letter face is
 * a shape with its counters as holes, extruded by the return depth. The extrude
 * gives us the whole built-up letter for free — the front cap reads as the
 * painted FACE, the side walls as the bent RETURNS — so the operator sees the
 * real depth, not just a flat outline. Real-size `toScene` mapping is shared
 * with NeonScene; lighting + a brass/painted PBR material make the metal read.
 *
 * Mounted only in the 3D view (dynamic, ssr:false). While mounted it publishes
 * a snapshot fn on `returnsCapture` so the client can drop the live view onto
 * the cut-sheet PDF — same trick as the panel visualiser's `sceneCapture`.
 */

import { useMemo, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Edges, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import type { ReturnFaceGroup, Pt } from '@/lib/visualiser/returns';
import { finishSpec, type FaceFinish } from '@/lib/visualiser/returns-finish';
import { returnsCapture } from '@/lib/visualiser/returns-capture';

type Bbox = { minX: number; minY: number; maxX: number; maxY: number };

/** Fit the larger artwork dimension into this many scene units. */
const FIT = 6;

/** Drop the repeated closing point + consecutive coincident points (extrude
 *  chokes on zero-length edges). */
function dedupe(points: Pt[], eps = 1e-4): Pt[] {
    const out: Pt[] = [];
    for (const p of points) {
        const q = out[out.length - 1];
        if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > eps) out.push(p);
    }
    while (
        out.length > 1 &&
        Math.hypot(
            out[0][0] - out[out.length - 1][0],
            out[0][1] - out[out.length - 1][1],
        ) <= eps
    ) {
        out.pop();
    }
    return out;
}

/** Publishes a PNG-snapshot fn while mounted (orbit view, for the PDF). */
function CaptureBinder() {
    const { gl, scene, camera } = useThree();
    useEffect(() => {
        returnsCapture.fn = () => {
            try {
                gl.render(scene, camera);
                return gl.domElement.toDataURL('image/png');
            } catch {
                return null;
            }
        };
        return () => {
            returnsCapture.fn = null;
        };
    }, [gl, scene, camera]);
    return null;
}

function BuiltUpLetters({
    groups,
    toScene,
    depthScene,
    finish,
}: {
    groups: ReturnFaceGroup[];
    toScene: (x: number, y: number) => [number, number];
    depthScene: number;
    finish: FaceFinish;
}) {
    const spec = finishSpec(finish);

    const shapes = useMemo(() => {
        const out: THREE.Shape[] = [];
        for (const g of groups) {
            const ring = dedupe(g.outer.points);
            if (ring.length < 3) continue;
            const shape = new THREE.Shape();
            ring.forEach(([x, y], i) => {
                const [sx, sy] = toScene(x, y);
                if (i === 0) shape.moveTo(sx, sy);
                else shape.lineTo(sx, sy);
            });
            shape.closePath();
            for (const hole of g.holes) {
                const hr = dedupe(hole.points);
                if (hr.length < 3) continue;
                const path = new THREE.Path();
                hr.forEach(([x, y], i) => {
                    const [sx, sy] = toScene(x, y);
                    if (i === 0) path.moveTo(sx, sy);
                    else path.lineTo(sx, sy);
                });
                path.closePath();
                shape.holes.push(path);
            }
            out.push(shape);
        }
        return out;
        // toScene only changes with the calibrated geometry it transforms.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [groups, depthScene]);

    const args = useMemo(
        () =>
            [shapes, { depth: depthScene, bevelEnabled: false, steps: 1 }] as [
                THREE.Shape[],
                THREE.ExtrudeGeometryOptions,
            ],
        [shapes, depthScene],
    );

    if (shapes.length === 0) return null;

    // Centre the extrude on z=0 so it orbits nicely. ExtrudeGeometry emits two
    // material groups: 0 = front/back caps (the FACE), 1 = side walls (the
    // RETURNS) — so the face and the returns colour independently.
    return (
        <mesh position={[0, 0, -depthScene / 2]}>
            <extrudeGeometry args={args} />
            <meshStandardMaterial
                attach="material-0"
                color={spec.face}
                metalness={spec.metalness}
                roughness={spec.roughness}
            />
            <meshStandardMaterial
                attach="material-1"
                color={spec.ret}
                metalness={spec.metalness}
                roughness={Math.min(1, spec.roughness + 0.1)}
            />
            <Edges threshold={22} color={spec.edge} />
        </mesh>
    );
}

export default function ReturnsScene({
    groups,
    bbox,
    returnDepthMm,
    finish,
}: {
    groups: ReturnFaceGroup[];
    bbox: Bbox;
    returnDepthMm: number;
    finish: FaceFinish;
}) {
    const wMm = Math.max(1, bbox.maxX - bbox.minX);
    const hMm = Math.max(1, bbox.maxY - bbox.minY);
    const cx = (bbox.minX + bbox.maxX) / 2;
    const cy = (bbox.minY + bbox.maxY) / 2;
    const S = FIT / Math.max(wMm, hMm);
    // SVG y is downward → negate so the letters stand upright in 3D.
    const toScene = (x: number, y: number): [number, number] => [
        (x - cx) * S,
        -(y - cy) * S,
    ];
    const depthScene = Math.max(0.004, returnDepthMm * S);
    // Ground sits just under the lowest point (largest SVG y) of the letters.
    const groundY = -((bbox.maxY - cy) * S) - depthScene / 2 - 0.02;

    return (
        <Canvas
            camera={{ position: [FIT * 0.2, FIT * 0.22, FIT * 1.4], fov: 38 }}
            dpr={[1, 2]}
            gl={{ preserveDrawingBuffer: true, antialias: true }}
            className="h-full w-full"
        >
            <color attach="background" args={['#eef1f3']} />
            <CaptureBinder />
            <hemisphereLight args={['#ffffff', '#aab2b8', 0.9]} />
            <ambientLight intensity={0.25} />
            <directionalLight position={[4, 6, 6]} intensity={1.7} />
            <directionalLight position={[-5, 2, -3]} intensity={0.45} />
            <directionalLight position={[0, -3, 4]} intensity={0.22} />

            <BuiltUpLetters
                groups={groups}
                toScene={toScene}
                depthScene={depthScene}
                finish={finish}
            />

            <ContactShadows
                position={[0, groundY, 0]}
                scale={FIT * 2.4}
                blur={2.6}
                opacity={0.34}
                far={FIT}
                resolution={1024}
            />
            <OrbitControls makeDefault enablePan />
        </Canvas>
    );
}
