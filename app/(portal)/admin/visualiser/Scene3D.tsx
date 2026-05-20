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
    PanelEdge,
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
const HALF_PI = Math.PI / 2;
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

/**
 * A return flap hinged on its fold line. `fold` ∈ [0,1]: 0 = flat (coplanar
 * with the face → the flat development laid out in 3D), 1 = folded 90° back.
 * A shadow-gap lip is a nested flap that hinges at the return tip.
 */
function Flap({
    edge,
    W,
    H,
    D,
    T,
    Sg,
    fold,
}: {
    edge: PanelEdge;
    W: number;
    H: number;
    D: number;
    T: number;
    Sg: number;
    fold: number;
}) {
    const a = fold * HALF_PI;
    const hasLip = Sg > 0;

    let groupPos: [number, number, number];
    let groupRot: [number, number, number];
    let boxArgs: [number, number, number];
    let boxPos: [number, number, number];
    let lipPos: [number, number, number] = [0, 0, 0];
    let lipRot: [number, number, number] = [0, 0, 0];
    let lipArgs: [number, number, number] = [0, 0, 0];
    let lipBoxPos: [number, number, number] = [0, 0, 0];

    if (edge === 'bottom') {
        groupPos = [0, (-H / 2) * S, 0];
        groupRot = [a, 0, 0];
        boxArgs = [W * S, D * S, T * S];
        boxPos = [0, (-D / 2) * S, 0];
        lipPos = [0, -D * S, 0];
        lipRot = [a, 0, 0];
        lipArgs = [W * S, Sg * S, T * S];
        lipBoxPos = [0, (-Sg / 2) * S, 0];
    } else if (edge === 'top') {
        groupPos = [0, (H / 2) * S, 0];
        groupRot = [-a, 0, 0];
        boxArgs = [W * S, D * S, T * S];
        boxPos = [0, (D / 2) * S, 0];
        lipPos = [0, D * S, 0];
        lipRot = [-a, 0, 0];
        lipArgs = [W * S, Sg * S, T * S];
        lipBoxPos = [0, (Sg / 2) * S, 0];
    } else if (edge === 'left') {
        groupPos = [(-W / 2) * S, 0, 0];
        groupRot = [0, -a, 0];
        boxArgs = [D * S, H * S, T * S];
        boxPos = [(-D / 2) * S, 0, 0];
        lipPos = [-D * S, 0, 0];
        lipRot = [0, -a, 0];
        lipArgs = [Sg * S, H * S, T * S];
        lipBoxPos = [(-Sg / 2) * S, 0, 0];
    } else {
        groupPos = [(W / 2) * S, 0, 0];
        groupRot = [0, a, 0];
        boxArgs = [D * S, H * S, T * S];
        boxPos = [(D / 2) * S, 0, 0];
        lipPos = [D * S, 0, 0];
        lipRot = [0, a, 0];
        lipArgs = [Sg * S, H * S, T * S];
        lipBoxPos = [(Sg / 2) * S, 0, 0];
    }

    return (
        <group position={groupPos} rotation={groupRot}>
            <PanelBox args={boxArgs} position={boxPos} />
            {hasLip && (
                <group position={lipPos} rotation={lipRot}>
                    <PanelBox args={lipArgs} position={lipBoxPos} />
                </group>
            )}
        </group>
    );
}

function Panel({
    params,
    development: dev,
    split,
    aperture,
    keyline,
    fixings,
    reference,
    fold,
}: {
    params: PanelParams;
    development: PanelDevelopment;
    split: PanelSplit;
    aperture: FlatPath[];
    keyline: FlatPath[];
    fixings: FlatPath[];
    reference: FlatPath[];
    fold: number;
}) {
    const W = dev.faceNominalWMm;
    const H = dev.faceNominalHMm;
    const T = params.materialThicknessMm;
    const D = params.returnDepthMm;
    const Sg = params.shadowGapMm;
    const r = params.returns;
    const edges: PanelEdge[] = ['top', 'bottom', 'left', 'right'];

    // Aperture / keyline as line segments on the face front (the cut never
    // moves — it's in the face, unaffected by folding).
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
        return {
            ap: build(aperture),
            kl: build(keyline),
            fx: build(fixings),
            ref: build(reference),
        };
    }, [aperture, keyline, fixings, reference, face, T]);

    return (
        <group>
            {/* Face */}
            <PanelBox args={[W * S, H * S, T * S]} />

            {/* Hinged return flaps (+ optional shadow-gap lips) */}
            {edges.map((e) =>
                r[e] ? (
                    <Flap
                        key={e}
                        edge={e}
                        W={W}
                        H={H}
                        D={D}
                        T={T}
                        Sg={Sg}
                        fold={fold}
                    />
                ) : null,
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

            {/* Reference letter outline (standoff mode, not cut) — drawn
                faintly under the cut features. */}
            {overlay && (
                <>
                    <lineSegments geometry={overlay.ref}>
                        <lineBasicMaterial color="#9ca3af" />
                    </lineSegments>
                    <lineSegments geometry={overlay.ap}>
                        <lineBasicMaterial color="#1e5fc8" />
                    </lineSegments>
                    <lineSegments geometry={overlay.kl}>
                        <lineBasicMaterial color="#00aabe" />
                    </lineSegments>
                    <lineSegments geometry={overlay.fx}>
                        <lineBasicMaterial color="#1e5fc8" />
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
    fixings?: FlatPath[];
    reference?: FlatPath[];
    /** 0 = flat (unfolded in 3D), 1 = folded. Default folded. */
    fold?: number;
}) {
    const fold = props.fold ?? 1;
    const fixings = props.fixings ?? [];
    const reference = props.reference ?? [];
    // Frame the flat blank so both folded and unfolded states stay in view.
    const reach =
        Math.max(
            props.development.totalFlatWMm,
            props.development.totalFlatHMm,
        ) *
        S *
        1.5;

    return (
        <Canvas
            camera={{ position: [reach, reach * 0.7, reach], fov: 45 }}
            gl={{ preserveDrawingBuffer: true, antialias: true }}
            className="h-full w-full"
        >
            <color attach="background" args={['#ffffff']} />
            <CaptureBinder />
            <Panel {...props} fixings={fixings} reference={reference} fold={fold} />
            <OrbitControls enablePan makeDefault />
        </Canvas>
    );
}
