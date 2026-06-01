'use client';

import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Edges } from '@react-three/drei';
import * as THREE from 'three';
import type { NeonElement } from '@/lib/visualiser/neon';

const DEFAULT_NEON = '#46e8ff'; // fallback when the SVG carries no colour
const NEON_TUBE_MM = 5; // ~10 mm dia neon flex; core radius in mm

interface Bbox {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

/** Drop consecutive duplicate points — CatmullRom curves NaN on zero-length spans. */
function dedupe(points: Array<[number, number]>): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (const p of points) {
        const last = out[out.length - 1];
        if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-4) out.push(p);
    }
    return out;
}

/**
 * One neon run: a smooth tube along the path with an additive-blended core +
 * two halo shells, so on the dark scene it reads as a glowing glass tube. No
 * lights / postprocessing — the additive halos fake the bloom.
 */
function NeonRun({
    element,
    toScene,
    radius,
}: {
    element: NeonElement;
    toScene: (x: number, y: number) => [number, number, number];
    radius: number;
}) {
    const color = element.stroke || DEFAULT_NEON;

    const curve = useMemo(() => {
        const pts = dedupe(element.points).map(([x, y]) => {
            const [sx, sy, sz] = toScene(x, y);
            return new THREE.Vector3(sx, sy, sz);
        });
        if (pts.length < 2) return null;
        return new THREE.CatmullRomCurve3(
            pts,
            element.closed,
            'centripetal',
            0.5,
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [element, radius]);

    const geoms = useMemo(() => {
        if (!curve) return null;
        const segs = Math.min(600, Math.max(16, element.points.length * 2));
        const make = (r: number) =>
            new THREE.TubeGeometry(curve, segs, r, 10, element.closed);
        return {
            core: make(radius * 0.85),
            halo1: make(radius * 1.9),
            halo2: make(radius * 3.4),
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [curve, radius]);

    if (!geoms) return null;
    const c = new THREE.Color(color);
    // Hot near-white core gives the glassy filament look.
    const coreColor = c.clone().lerp(new THREE.Color('#ffffff'), 0.7);

    return (
        <group>
            <mesh geometry={geoms.halo2}>
                <meshBasicMaterial
                    color={c}
                    transparent
                    opacity={0.1}
                    blending={THREE.AdditiveBlending}
                    depthWrite={false}
                    toneMapped={false}
                />
            </mesh>
            <mesh geometry={geoms.halo1}>
                <meshBasicMaterial
                    color={c}
                    transparent
                    opacity={0.28}
                    blending={THREE.AdditiveBlending}
                    depthWrite={false}
                    toneMapped={false}
                />
            </mesh>
            <mesh geometry={geoms.core}>
                <meshBasicMaterial
                    color={coreColor}
                    transparent
                    opacity={0.95}
                    blending={THREE.AdditiveBlending}
                    depthWrite={false}
                    toneMapped={false}
                />
            </mesh>
        </group>
    );
}

/** Clear acrylic backboard sized to the artwork + padding. */
function Backboard({
    wScene,
    hScene,
    depth,
}: {
    wScene: number;
    hScene: number;
    depth: number;
}) {
    return (
        <mesh position={[0, 0, -depth / 2 - 0.02]}>
            <boxGeometry args={[wScene, hScene, depth]} />
            <meshBasicMaterial
                color="#bfe9f5"
                transparent
                opacity={0.1}
                depthWrite={false}
                toneMapped={false}
            />
            <Edges color="#9fd6e6" lineWidth={1} />
        </mesh>
    );
}

export default function NeonScene({
    elements,
    bbox,
    backboard,
}: {
    elements: NeonElement[];
    bbox: Bbox;
    backboard: { enabled: boolean; paddingMm: number };
}) {
    const wMm = Math.max(1, bbox.maxX - bbox.minX);
    const hMm = Math.max(1, bbox.maxY - bbox.minY);
    const cx = (bbox.minX + bbox.maxX) / 2;
    const cy = (bbox.minY + bbox.maxY) / 2;
    // Fit the larger dimension to a fixed span; thickness stays proportional
    // to the real artwork via the same scale.
    const S = 6 / Math.max(wMm, hMm);
    // SVG y is downward → negate so the sign stands upright in 3D.
    const toScene = (x: number, y: number): [number, number, number] => [
        (x - cx) * S,
        -(y - cy) * S,
        0,
    ];
    const radius = NEON_TUBE_MM * S;

    const padScene = Math.max(0, backboard.paddingMm) * S;
    const boardW = wMm * S + padScene * 2;
    const boardH = hMm * S + padScene * 2;
    const boardDepth = Math.max(0.04, 4 * S);

    return (
        <Canvas
            camera={{ position: [0, 0, 9], fov: 45 }}
            gl={{ antialias: true }}
            dpr={[1, 2]}
        >
            <color attach="background" args={['#07090d']} />
            {backboard.enabled && (
                <Backboard wScene={boardW} hScene={boardH} depth={boardDepth} />
            )}
            {elements.map((el) => (
                <NeonRun
                    key={el.index}
                    element={el}
                    toScene={toScene}
                    radius={radius}
                />
            ))}
            <OrbitControls enablePan makeDefault />
        </Canvas>
    );
}
