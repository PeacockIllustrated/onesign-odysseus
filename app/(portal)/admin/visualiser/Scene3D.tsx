'use client';

import { useEffect, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Edges } from '@react-three/drei';
import * as THREE from 'three';
import type {
    PanelParams,
    PanelDevelopment,
    PanelSplit,
    FlatPath,
} from '@/lib/visualiser/types';

/** Set by the scene on mount so ExportBar can grab a PDF thumbnail. */
export const sceneCapture: { fn: (() => string | null) | null } = { fn: null };

function CaptureBinder() {
    const { gl, scene, camera } = useThree();
    useEffect(() => {
        sceneCapture.fn = () => {
            try {
                gl.render(scene, camera);
                return gl.domElement.toDataURL('image/png');
            } catch {
                return null;
            }
        };
        return () => {
            sceneCapture.fn = null;
        };
    }, [gl, scene, camera]);
    return null;
}

const S = 0.01; // mm → scene units
const PANEL_COLOR = '#d6d6d6'; // flat light grey
const EDGE_COLOR = '#111111'; // technical-drawing black strokes

/** Flat light-grey box with crisp black edge strokes. */
function PanelBox({
    args,
    position,
}: {
    args: [number, number, number];
    position?: [number, number, number];
}) {
    return (
        <mesh position={position}>
            <boxGeometry args={args} />
            <meshBasicMaterial color={PANEL_COLOR} />
            <Edges color={EDGE_COLOR} />
        </mesh>
    );
}

function Panel({
    params,
    development: dev,
    split,
    aperture,
    keyline,
}: {
    params: PanelParams;
    development: PanelDevelopment;
    split: PanelSplit;
    aperture: FlatPath[];
    keyline: FlatPath[];
}) {
    const W = dev.faceNominalWMm;
    const H = dev.faceNominalHMm;
    const T = params.materialThicknessMm;
    const D = params.returnDepthMm;
    const Sg = params.shadowGapMm;
    const r = params.returns;

    // Aperture / keyline as line segments on the face front.
    const face = dev.segments.find((s) => s.role === 'face');
    const overlay = useMemo(() => {
        if (!face) return null;
        const toLocal = (x: number, y: number): [number, number, number] => [
            (x - face.xMm - face.wMm / 2) * S,
            (face.yMm + face.hMm / 2 - y) * S,
            (T / 2 + 1) * S,
        ];
        const build = (paths: FlatPath[]) => {
            const pos: number[] = [];
            for (const p of paths) {
                for (let i = 0; i + 1 < p.points.length; i++) {
                    const a = toLocal(p.points[i][0], p.points[i][1]);
                    const b = toLocal(p.points[i + 1][0], p.points[i + 1][1]);
                    pos.push(...a, ...b);
                }
            }
            const g = new THREE.BufferGeometry();
            g.setAttribute(
                'position',
                new THREE.Float32BufferAttribute(pos, 3),
            );
            return g;
        };
        return { ap: build(aperture), kl: build(keyline) };
    }, [aperture, keyline, face, T]);

    return (
        <group>
            {/* Face */}
            <PanelBox args={[W * S, H * S, T * S]} />

            {/* Returns (fold back, −Z) */}
            {r.bottom && (
                <PanelBox
                    args={[W * S, T * S, D * S]}
                    position={[0, (-H / 2) * S, (-D / 2) * S]}
                />
            )}
            {r.top && (
                <PanelBox
                    args={[W * S, T * S, D * S]}
                    position={[0, (H / 2) * S, (-D / 2) * S]}
                />
            )}
            {r.left && (
                <PanelBox
                    args={[T * S, H * S, D * S]}
                    position={[(-W / 2) * S, 0, (-D / 2) * S]}
                />
            )}
            {r.right && (
                <PanelBox
                    args={[T * S, H * S, D * S]}
                    position={[(W / 2) * S, 0, (-D / 2) * S]}
                />
            )}

            {/* Shadow-gap lips (fold inward at return tip) */}
            {Sg > 0 && r.bottom && (
                <PanelBox
                    args={[W * S, Sg * S, T * S]}
                    position={[0, (-H / 2 + Sg / 2) * S, -D * S]}
                />
            )}
            {Sg > 0 && r.top && (
                <PanelBox
                    args={[W * S, Sg * S, T * S]}
                    position={[0, (H / 2 - Sg / 2) * S, -D * S]}
                />
            )}
            {Sg > 0 && r.left && (
                <PanelBox
                    args={[Sg * S, H * S, T * S]}
                    position={[(-W / 2 + Sg / 2) * S, 0, -D * S]}
                />
            )}
            {Sg > 0 && r.right && (
                <PanelBox
                    args={[Sg * S, H * S, T * S]}
                    position={[(W / 2 - Sg / 2) * S, 0, -D * S]}
                />
            )}

            {/* Seam lines on the face */}
            {split.wasSplit &&
                split.seamXsMm.map((sx, i) => (
                    <mesh
                        key={`seam-${i}`}
                        position={[(sx - W / 2) * S, 0, (T / 2 + 0.5) * S]}
                    >
                        <boxGeometry args={[2 * S, H * S, 0.5 * S]} />
                        <meshBasicMaterial color="#009933" />
                    </mesh>
                ))}

            {/* Aperture + keyline overlays */}
            {overlay && (
                <>
                    <lineSegments geometry={overlay.ap}>
                        <lineBasicMaterial color="#1e5fc8" />
                    </lineSegments>
                    <lineSegments geometry={overlay.kl}>
                        <lineBasicMaterial color="#00aabe" />
                    </lineSegments>
                </>
            )}
        </group>
    );
}

export default function Scene3D(props: {
    params: PanelParams;
    development: PanelDevelopment;
    split: PanelSplit;
    aperture: FlatPath[];
    keyline: FlatPath[];
}) {
    const reach =
        Math.max(
            props.development.faceNominalWMm,
            props.development.faceNominalHMm,
        ) *
        S *
        1.6;

    return (
        <Canvas
            camera={{ position: [reach, reach * 0.7, reach], fov: 45 }}
            gl={{ preserveDrawingBuffer: true, antialias: true }}
            className="h-full w-full"
        >
            <color attach="background" args={['#ffffff']} />
            <CaptureBinder />
            <Panel {...props} />
            <OrbitControls enablePan makeDefault />
        </Canvas>
    );
}
