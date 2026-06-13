'use client';

/**
 * LED layout 3D preview — day ↔ night.
 *
 * NIGHT: the sign lit up — glowing acrylic faces (additive emissive, counters
 * punched out) and additive-haloed LED dots, the neon tool's bloom-faking
 * technique (two additive shells, no postprocessing dependency), over a dusk
 * background, with the wiring dimmed underneath.
 * DAY: the sign off — solid faces, crisp outlines, the runs / drivers / feed
 * shown as the technical overlay.
 *
 * Real-size `toScene` mapping shared with NeonScene; publishes a snapshot fn on
 * `ledCapture` so the client can embed the view in the wiring PDF.
 */

import { useMemo, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Line } from '@react-three/drei';
import * as THREE from 'three';
import type { LedLayoutAnalysis, Pt } from '@/lib/visualiser/led-layout';
import { ledCapture } from '@/lib/visualiser/led-capture';

const FIT = 6;
const DRIVER_HEX = [
    '#4e7e8c',
    '#d4661a',
    '#228b57',
    '#7850aa',
    '#c83c5a',
    '#286eb4',
    '#aa8c1e',
    '#5a646e',
];
const driverHex = (i: number) => DRIVER_HEX[(i - 1 + DRIVER_HEX.length) % DRIVER_HEX.length];

function dedupe(points: Pt[], eps = 1e-4): Pt[] {
    const out: Pt[] = [];
    for (const p of points) {
        const q = out[out.length - 1];
        if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > eps) out.push(p);
    }
    return out;
}

function CaptureBinder() {
    const { gl, scene, camera } = useThree();
    useEffect(() => {
        ledCapture.fn = () => {
            try {
                gl.render(scene, camera);
                return gl.domElement.toDataURL('image/png');
            } catch {
                return null;
            }
        };
        return () => {
            ledCapture.fn = null;
        };
    }, [gl, scene, camera]);
    return null;
}

function ModuleDots({
    positions,
    colors,
    size,
    opacity,
    additive,
}: {
    positions: number[];
    colors: number[];
    size: number;
    opacity: number;
    additive: boolean;
}) {
    const geom = useMemo(() => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        return g;
    }, [positions, colors]);
    return (
        <points geometry={geom}>
            <pointsMaterial
                vertexColors
                size={size}
                sizeAttenuation
                transparent
                opacity={opacity}
                blending={additive ? THREE.AdditiveBlending : THREE.NormalBlending}
                depthWrite={false}
                toneMapped={false}
            />
        </points>
    );
}

export default function LedLayoutScene({
    analysis,
    night,
}: {
    analysis: LedLayoutAnalysis;
    night: boolean;
}) {
    const bb = analysis.bbox;
    const wMm = Math.max(1, bb.maxX - bb.minX);
    const hMm = Math.max(1, bb.maxY - bb.minY);
    const cx = (bb.minX + bb.maxX) / 2;
    const cy = (bb.minY + bb.maxY) / 2;
    const S = FIT / Math.max(wMm, hMm);
    const toScene = (x: number, y: number): [number, number, number] => [(x - cx) * S, -(y - cy) * S, 0];

    // Letter faces (outer minus counters) as flat shapes for the lit acrylic.
    const faceShapes = useMemo(() => {
        const shapes: THREE.Shape[] = [];
        for (const l of analysis.letters) {
            const ring = dedupe(l.points);
            if (ring.length < 3) continue;
            const shape = new THREE.Shape();
            ring.forEach(([x, y], i) => {
                const sx = (x - cx) * S;
                const sy = -(y - cy) * S;
                if (i === 0) shape.moveTo(sx, sy);
                else shape.lineTo(sx, sy);
            });
            shape.closePath();
            for (const h of l.holes) {
                const hr = dedupe(h);
                if (hr.length < 3) continue;
                const path = new THREE.Path();
                hr.forEach(([x, y], i) => {
                    const sx = (x - cx) * S;
                    const sy = -(y - cy) * S;
                    if (i === 0) path.moveTo(sx, sy);
                    else path.lineTo(sx, sy);
                });
                path.closePath();
                shape.holes.push(path);
            }
            shapes.push(shape);
        }
        return shapes;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [analysis]);

    const { positions, colors } = useMemo(() => {
        const pos: number[] = [];
        const col: number[] = [];
        for (const run of analysis.runs) {
            const c = new THREE.Color(driverHex(run.driverIndex));
            for (const m of run.modules) {
                pos.push((m[0] - cx) * S, -(m[1] - cy) * S, 0.03);
                col.push(c.r, c.g, c.b);
            }
        }
        return { positions: pos, colors: col };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [analysis]);

    const dotSize = Math.max(0.05, FIT * 0.014);

    return (
        <Canvas
            camera={{ position: [0, 0, 9], fov: 42 }}
            dpr={[1, 2]}
            gl={{ preserveDrawingBuffer: true, antialias: true }}
            className="h-full w-full"
        >
            <color attach="background" args={[night ? '#0e131b' : '#ccd4da']} />
            <CaptureBinder />

            {/* Lit / off acrylic faces */}
            {faceShapes.length > 0 && (
                <mesh position={[0, 0, -0.02]}>
                    <shapeGeometry args={[faceShapes]} />
                    {night ? (
                        <meshBasicMaterial
                            color="#fff2d6"
                            transparent
                            opacity={0.55}
                            blending={THREE.AdditiveBlending}
                            depthWrite={false}
                            toneMapped={false}
                            side={THREE.DoubleSide}
                        />
                    ) : (
                        <meshBasicMaterial color="#eef1f3" side={THREE.DoubleSide} />
                    )}
                </mesh>
            )}

            {/* Letter outlines */}
            {analysis.letters.map((l) => (
                <Line
                    key={`l${l.index}`}
                    points={[...l.points.map((p) => toScene(p[0], p[1])), toScene(l.points[0][0], l.points[0][1])]}
                    color={night ? '#7a6a48' : '#3a4754'}
                    lineWidth={1}
                />
            ))}

            {/* Runs (technical overlay; dimmed at night) */}
            {analysis.runs.map((run) =>
                run.modules.length > 1 ? (
                    <Line
                        key={`r${run.index}`}
                        points={run.modules.map((m) => toScene(m[0], m[1]))}
                        color={driverHex(run.driverIndex)}
                        lineWidth={1.5}
                        transparent
                        opacity={night ? 0.35 : 1}
                    />
                ) : null,
            )}

            {/* Mains feed */}
            {analysis.drivers.map((d) => (
                <Line
                    key={`f${d.index}`}
                    points={[
                        toScene(analysis.cableEntry[0], analysis.cableEntry[1]),
                        toScene(d.position[0], d.position[1]),
                    ]}
                    color="#d4661a"
                    lineWidth={1}
                    dashed
                    dashSize={0.09}
                    gapSize={0.06}
                    transparent
                    opacity={night ? 0.4 : 1}
                />
            ))}

            {/* LED dots — glowing halo + core at night, plain markers by day */}
            {positions.length > 0 &&
                (night ? (
                    <>
                        <ModuleDots positions={positions} colors={colors} size={dotSize * 3.2} opacity={0.18} additive />
                        <ModuleDots positions={positions} colors={colors} size={dotSize} opacity={0.95} additive />
                    </>
                ) : (
                    <ModuleDots positions={positions} colors={colors} size={dotSize * 0.8} opacity={0.95} additive={false} />
                ))}

            {/* Driver boxes */}
            {analysis.drivers.map((d) => {
                const [x, y] = toScene(d.position[0], d.position[1]);
                return (
                    <mesh key={`d${d.index}`} position={[x, y, 0.1]}>
                        <boxGeometry args={[0.24, 0.15, 0.06]} />
                        <meshBasicMaterial color={driverHex(d.index)} toneMapped={false} transparent opacity={night ? 0.7 : 1} />
                    </mesh>
                );
            })}

            <OrbitControls makeDefault enablePan />
        </Canvas>
    );
}
