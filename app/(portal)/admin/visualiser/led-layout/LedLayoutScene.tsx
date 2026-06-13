'use client';

/**
 * LED layout 3D preview — the lit version of the wiring drawing.
 *
 * Letters as faint outlines, every LED module as an additive-glowing dot
 * coloured by its driver, the runs traced through them, driver boxes placed
 * central to their runs, and the amber mains feed routed from the entry point.
 * Same real-size `toScene` mapping + glow approach as NeonScene; publishes a
 * snapshot fn on `ledCapture` so the client can embed the view in the PDF.
 */

import { useMemo, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Line } from '@react-three/drei';
import * as THREE from 'three';
import type { LedLayoutAnalysis } from '@/lib/visualiser/led-layout';
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

function ModuleDots({ positions, colors, size }: { positions: number[]; colors: number[]; size: number }) {
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
                opacity={0.95}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
                toneMapped={false}
            />
        </points>
    );
}

export default function LedLayoutScene({ analysis }: { analysis: LedLayoutAnalysis }) {
    const bb = analysis.bbox;
    const wMm = Math.max(1, bb.maxX - bb.minX);
    const hMm = Math.max(1, bb.maxY - bb.minY);
    const cx = (bb.minX + bb.maxX) / 2;
    const cy = (bb.minY + bb.maxY) / 2;
    const S = FIT / Math.max(wMm, hMm);
    const toScene = (x: number, y: number): [number, number, number] => [(x - cx) * S, -(y - cy) * S, 0];

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
            <color attach="background" args={['#0e131b']} />
            <CaptureBinder />

            {analysis.letters.map((l) => (
                <Line
                    key={`l${l.index}`}
                    points={[
                        ...l.points.map((p) => toScene(p[0], p[1])),
                        toScene(l.points[0][0], l.points[0][1]),
                    ]}
                    color="#3a4754"
                    lineWidth={1}
                />
            ))}

            {analysis.runs.map((run) =>
                run.modules.length > 1 ? (
                    <Line
                        key={`r${run.index}`}
                        points={run.modules.map((m) => toScene(m[0], m[1]))}
                        color={driverHex(run.driverIndex)}
                        lineWidth={1.5}
                    />
                ) : null,
            )}

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
                />
            ))}

            {positions.length > 0 && <ModuleDots positions={positions} colors={colors} size={dotSize} />}

            {analysis.drivers.map((d) => {
                const [x, y] = toScene(d.position[0], d.position[1]);
                return (
                    <mesh key={`d${d.index}`} position={[x, y, 0.1]}>
                        <boxGeometry args={[0.24, 0.15, 0.06]} />
                        <meshBasicMaterial color={driverHex(d.index)} toneMapped={false} />
                    </mesh>
                );
            })}

            {(() => {
                const [x, y] = toScene(analysis.cableEntry[0], analysis.cableEntry[1]);
                return (
                    <mesh position={[x, y, 0.12]}>
                        <sphereGeometry args={[0.08, 16, 16]} />
                        <meshBasicMaterial color="#ff7a1a" toneMapped={false} />
                    </mesh>
                );
            })()}

            <OrbitControls makeDefault enablePan />
        </Canvas>
    );
}
