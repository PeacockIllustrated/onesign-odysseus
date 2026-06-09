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

/** Drop consecutive duplicate points — zero-length spans break the tube frames. */
function dedupe(points: Array<[number, number]>): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (const p of points) {
        const last = out[out.length - 1];
        if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-4) out.push(p);
    }
    return out;
}

/**
 * A piecewise-LINEAR curve through the points (parameterised by arc length).
 * Unlike CatmullRom this does NOT round corners — the neon follows the exact
 * flattened outline, so letter shapes stay crisp. The flattener already gives
 * curves enough points to read as smooth.
 */
class PolylineCurve3 extends THREE.Curve<THREE.Vector3> {
    private pts: THREE.Vector3[];
    private cum: number[];
    private total: number;
    constructor(points: THREE.Vector3[], closed: boolean) {
        super();
        const pts = points.slice();
        if (closed && pts.length > 1) pts.push(pts[0].clone());
        this.pts = pts;
        this.cum = [0];
        let total = 0;
        for (let i = 1; i < pts.length; i++) {
            total += pts[i].distanceTo(pts[i - 1]);
            this.cum.push(total);
        }
        this.total = total || 1;
    }
    getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
        const d = Math.min(Math.max(t, 0), 1) * this.total;
        let i = 1;
        while (i < this.cum.length && this.cum[i] < d) i++;
        if (i >= this.pts.length)
            return target.copy(this.pts[this.pts.length - 1]);
        const seg = this.cum[i] - this.cum[i - 1] || 1;
        const lt = (d - this.cum[i - 1]) / seg;
        return target.copy(this.pts[i - 1]).lerp(this.pts[i], lt);
    }
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
    saturation,
}: {
    element: NeonElement;
    toScene: (x: number, y: number) => [number, number, number];
    radius: number;
    saturation: number;
}) {
    const color = element.stroke || DEFAULT_NEON;

    const curve = useMemo(() => {
        const pts = dedupe(element.points).map(([x, y]) => {
            const [sx, sy, sz] = toScene(x, y);
            return new THREE.Vector3(sx, sy, sz);
        });
        if (pts.length < 2) return null;
        return new PolylineCurve3(pts, element.closed);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [element, radius]);

    if (!curve) return null;
    // Dense sampling so sharp corners read crisp (the curve doesn't round them;
    // this just controls how finely the tube is tessellated).
    const segs = Math.min(2000, Math.max(24, element.points.length * 3));

    const c = new THREE.Color(color);
    // Boost (or mute) saturation to pop the colours without touching hue.
    if (saturation !== 1) {
        const hsl = { h: 0, s: 0, l: 0 };
        c.getHSL(hsl);
        c.setHSL(hsl.h, Math.min(1, Math.max(0, hsl.s * saturation)), hsl.l);
    }
    // Hot near-white core gives the glassy filament look.
    const coreColor = c.clone().lerp(new THREE.Color('#ffffff'), 0.7);

    // Tubes are declared as JSX children (NOT new THREE.TubeGeometry passed by
    // prop) so React-Three-Fiber owns them and DISPOSES the old geometry on
    // every rebuild — otherwise each calibration keystroke / reload would orphan
    // tube geometries on the GPU. closed=false: PolylineCurve3 already appends
    // the closing point for closed runs, so this avoids a double seam.
    return (
        <group>
            <mesh>
                <tubeGeometry args={[curve, segs, radius * 3.4, 10, false]} />
                <meshBasicMaterial
                    color={c}
                    transparent
                    opacity={0.1}
                    blending={THREE.AdditiveBlending}
                    depthWrite={false}
                    toneMapped={false}
                />
            </mesh>
            <mesh>
                <tubeGeometry args={[curve, segs, radius * 1.9, 10, false]} />
                <meshBasicMaterial
                    color={c}
                    transparent
                    opacity={0.28}
                    blending={THREE.AdditiveBlending}
                    depthWrite={false}
                    toneMapped={false}
                />
            </mesh>
            <mesh>
                <tubeGeometry args={[curve, segs, radius * 0.85, 10, false]} />
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

/** Clear acrylic backboard sized to the artwork + padding (plain rectangle). */
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

/**
 * Shaped (contour-cut) backboard: the silhouette rings (mm, bbox space) from
 * `buildShapedBackboard`, converted to scene space and extruded into a thin
 * slab sitting just behind the neon. extrudeGeometry is declared as a JSX
 * child (not passed by prop) so React-Three-Fiber owns + disposes it on every
 * rebuild — same reason the tubes are, otherwise dragging the padding slider
 * would orphan a geometry on the GPU each step.
 */
function ShapedBackboard({
    rings,
    toScene,
    depth,
}: {
    rings: Array<Array<[number, number]>>;
    toScene: (x: number, y: number) => [number, number, number];
    depth: number;
}) {
    const shapes = useMemo(() => {
        return rings
            .map((r) => {
                if (r.length < 3) return null;
                const shape = new THREE.Shape();
                r.forEach(([x, y], i) => {
                    const [sx, sy] = toScene(x, y);
                    if (i === 0) shape.moveTo(sx, sy);
                    else shape.lineTo(sx, sy);
                });
                return shape;
            })
            .filter((s): s is THREE.Shape => s !== null);
        // toScene only changes alongside the rings it transforms (both derive
        // from the same calibrated geometry), so keying on rings is enough.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rings]);

    const args = useMemo(
        () =>
            [shapes, { depth, bevelEnabled: false }] as [
                THREE.Shape[],
                THREE.ExtrudeGeometryOptions,
            ],
        [shapes, depth],
    );

    if (shapes.length === 0) return null;

    // Extrude runs 0→+depth in z; push it fully behind the neon (which sits at
    // z≈0) so the slab reads as a backboard, matching the rectangle's offset.
    return (
        <mesh position={[0, 0, -depth - 0.02]}>
            <extrudeGeometry args={args} />
            <meshBasicMaterial
                color="#bfe9f5"
                transparent
                opacity={0.1}
                depthWrite={false}
                toneMapped={false}
                side={THREE.DoubleSide}
            />
            <Edges color="#9fd6e6" lineWidth={1} />
        </mesh>
    );
}

export default function NeonScene({
    elements,
    bbox,
    backboard,
    saturation = 1,
    cableSide,
}: {
    elements: NeonElement[];
    bbox: Bbox;
    backboard: {
        enabled: boolean;
        /** 'rectangle' (bbox + padding) or 'shaped' (contour silhouette). */
        shape?: 'rectangle' | 'shaped';
        paddingMm: number;
        /** Shaped-mode silhouette rings (mm, bbox space) from buildShapedBackboard. */
        shapeRings?: Array<Array<[number, number]>>;
    };
    saturation?: number;
    cableSide?: 'left' | 'right' | 'top' | 'bottom';
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
            {backboard.enabled &&
                (backboard.shape === 'shaped' ? (
                    backboard.shapeRings && backboard.shapeRings.length > 0 ? (
                        <ShapedBackboard
                            rings={backboard.shapeRings}
                            toScene={toScene}
                            depth={boardDepth}
                        />
                    ) : null
                ) : (
                    <Backboard
                        wScene={boardW}
                        hScene={boardH}
                        depth={boardDepth}
                    />
                ))}
            {elements.map((el) => (
                <NeonRun
                    key={el.index}
                    element={el}
                    toScene={toScene}
                    radius={radius}
                    saturation={saturation}
                />
            ))}
            {cableSide &&
                (() => {
                    const midXmm = (bbox.minX + bbox.maxX) / 2;
                    const midYmm = (bbox.minY + bbox.maxY) / 2;
                    const a = {
                        left: [bbox.minX, midYmm],
                        right: [bbox.maxX, midYmm],
                        top: [midXmm, bbox.minY],
                        bottom: [midXmm, bbox.maxY],
                    }[cableSide];
                    const [mx, my] = toScene(a[0], a[1]);
                    return (
                        <mesh position={[mx, my, radius * 3]}>
                            <sphereGeometry
                                args={[Math.max(0.1, radius * 2.4), 16, 16]}
                            />
                            <meshBasicMaterial
                                color="#ff7a1a"
                                toneMapped={false}
                            />
                        </mesh>
                    );
                })()}
            <OrbitControls enablePan makeDefault />
        </Canvas>
    );
}
