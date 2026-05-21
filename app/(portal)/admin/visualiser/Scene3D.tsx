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
const DEFAULT_PANEL_COLOR = '#d6d6d6';
const EDGE_COLOR = '#111111'; // technical-drawing black strokes

/**
 * A single sheet-metal plane with crisp black edges. Double-sided material so
 * the back of the metal is visible — but there's only one surface, no extra
 * back plate (which isn't there in production either).
 */
function PanelPlane({
    args,
    position,
    color,
}: {
    args: [number, number];
    position?: [number, number, number];
    color: string;
}) {
    return (
        <mesh position={position}>
            <planeGeometry args={args} />
            {/* polygonOffset pushes the fill slightly away from the camera
                in depth, so the Edges lines always sit "in front" of it —
                regardless of whether the camera is looking at the front
                of the panel or orbited around to the back. Without this,
                the back-facing fill (DoubleSide) lands at the same depth
                as the edges and paints over them when viewed from behind. */}
            <meshBasicMaterial
                color={color}
                side={THREE.DoubleSide}
                polygonOffset
                polygonOffsetFactor={1}
                polygonOffsetUnits={1}
            />
            {/* lineWidth > 1 makes drei swap to LineMaterial under the
                hood, which renders proper antialiased line geometry
                (gl.LINES is always 1px aliased on most GPUs). 1.5 reads
                crisp on both retina and standard screens. */}
            <Edges color={EDGE_COLOR} lineWidth={1.5} />
        </mesh>
    );
}

/**
 * The face panel as a flat shape with real cut-outs for every aperture
 * polygon / stand-off fixing hole — so the 3D shows what will actually be
 * cut on the panel, not just a coloured outline.
 */
function FacePlane({
    W,
    H,
    color,
    holesLocal,
}: {
    W: number; // mm
    H: number; // mm
    color: string;
    /** Holes in face-local mm coords (face centred at origin, y-up). */
    holesLocal: Array<Array<[number, number]>>;
}) {
    const shape = useMemo(() => {
        const s = new THREE.Shape();
        const hw = (W * S) / 2;
        const hh = (H * S) / 2;
        s.moveTo(-hw, -hh);
        s.lineTo(hw, -hh);
        s.lineTo(hw, hh);
        s.lineTo(-hw, hh);
        s.lineTo(-hw, -hh);
        for (const pts of holesLocal) {
            if (pts.length < 3) continue;
            const h = new THREE.Path();
            h.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++) h.lineTo(pts[i][0], pts[i][1]);
            h.closePath();
            s.holes.push(h);
        }
        return s;
    }, [W, H, holesLocal]);

    return (
        <mesh>
            {/* curveSegments = 48 (hero/close-up typography preset). In
                our pipeline SVG curves are pre-flattened at parse time
                (lib/visualiser/svg-import.ts FLATNESS_TOL), so this is
                defensive — kept in case any future code feeds a real
                bezier into the Shape via bezierCurveTo. */}
            <shapeGeometry args={[shape, 48]} />
            {/* polygonOffset pushes the fill slightly away from the camera
                in depth, so the Edges lines always sit "in front" of it —
                regardless of whether the camera is looking at the front
                of the panel or orbited around to the back. Without this,
                the back-facing fill (DoubleSide) lands at the same depth
                as the edges and paints over them when viewed from behind. */}
            <meshBasicMaterial
                color={color}
                side={THREE.DoubleSide}
                polygonOffset
                polygonOffsetFactor={1}
                polygonOffsetUnits={1}
            />
            {/* lineWidth > 1 makes drei swap to LineMaterial under the
                hood, which renders proper antialiased line geometry
                (gl.LINES is always 1px aliased on most GPUs). 1.5 reads
                crisp on both retina and standard screens. */}
            <Edges color={EDGE_COLOR} lineWidth={1.5} />
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
    Sg,
    fold,
    color,
}: {
    edge: PanelEdge;
    W: number;
    H: number;
    D: number;
    Sg: number;
    fold: number;
    color: string;
}) {
    const a = fold * HALF_PI;
    const hasLip = Sg > 0;

    let groupPos: [number, number, number];
    let groupRot: [number, number, number];
    let planeArgs: [number, number];
    let planePos: [number, number, number];
    let lipPos: [number, number, number] = [0, 0, 0];
    let lipRot: [number, number, number] = [0, 0, 0];
    let lipArgs: [number, number] = [0, 0];
    let lipPlanePos: [number, number, number] = [0, 0, 0];

    if (edge === 'bottom') {
        groupPos = [0, (-H / 2) * S, 0];
        groupRot = [a, 0, 0];
        planeArgs = [W * S, D * S];
        planePos = [0, (-D / 2) * S, 0];
        lipPos = [0, -D * S, 0];
        lipRot = [a, 0, 0];
        lipArgs = [W * S, Sg * S];
        lipPlanePos = [0, (-Sg / 2) * S, 0];
    } else if (edge === 'top') {
        groupPos = [0, (H / 2) * S, 0];
        groupRot = [-a, 0, 0];
        planeArgs = [W * S, D * S];
        planePos = [0, (D / 2) * S, 0];
        lipPos = [0, D * S, 0];
        lipRot = [-a, 0, 0];
        lipArgs = [W * S, Sg * S];
        lipPlanePos = [0, (Sg / 2) * S, 0];
    } else if (edge === 'left') {
        groupPos = [(-W / 2) * S, 0, 0];
        groupRot = [0, -a, 0];
        planeArgs = [D * S, H * S];
        planePos = [(-D / 2) * S, 0, 0];
        lipPos = [-D * S, 0, 0];
        lipRot = [0, -a, 0];
        lipArgs = [Sg * S, H * S];
        lipPlanePos = [(-Sg / 2) * S, 0, 0];
    } else {
        groupPos = [(W / 2) * S, 0, 0];
        groupRot = [0, a, 0];
        planeArgs = [D * S, H * S];
        planePos = [(D / 2) * S, 0, 0];
        lipPos = [D * S, 0, 0];
        lipRot = [0, a, 0];
        lipArgs = [Sg * S, H * S];
        lipPlanePos = [(Sg / 2) * S, 0, 0];
    }

    return (
        <group position={groupPos} rotation={groupRot}>
            <PanelPlane args={planeArgs} position={planePos} color={color} />
            {hasLip && (
                <group position={lipPos} rotation={lipRot}>
                    <PanelPlane
                        args={lipArgs}
                        position={lipPlanePos}
                        color={color}
                    />
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
    const panelColor = params.panelColor ?? DEFAULT_PANEL_COLOR;
    const edges: PanelEdge[] = ['top', 'bottom', 'left', 'right'];

    const face = dev.segments.find((s) => s.role === 'face');

    // Convert every "cut" path from flat-development coords (y-down) into
    // face-local mm × S (face centred at the world origin, y-up). Apertures
    // and stand-off fixings become real holes in the face geometry below.
    const holesLocal = useMemo(() => {
        if (!face) return [];
        const toLocal = (p: [number, number]): [number, number] => [
            (p[0] - face.xMm - face.wMm / 2) * S,
            (face.yMm + face.hMm / 2 - p[1]) * S,
        ];
        const out: Array<Array<[number, number]>> = [];
        for (const cut of [...aperture, ...fixings]) {
            const pts = cut.points.map(toLocal);
            if (pts.length >= 3) out.push(pts);
        }
        return out;
    }, [face, aperture, fixings]);

    // Reference (lettering outline, NOT cut) and keyline (register line, NOT
    // cut) ride on top of the face as thin line overlays.
    const overlay = useMemo(() => {
        if (!face) return null;
        const z = (T / 2 + 1) * S;
        const toLocal = (x: number, y: number): [number, number, number] => [
            (x - face.xMm - face.wMm / 2) * S,
            (face.yMm + face.hMm / 2 - y) * S,
            z,
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
        return { kl: build(keyline), ref: build(reference) };
    }, [face, keyline, reference, T]);

    return (
        <group>
            {/* Face — a single sheet with real cut-outs for every aperture /
                stand-off fixing. No back plate (there isn't one in
                production), and what you see here is what the cutter cuts. */}
            <FacePlane
                W={W}
                H={H}
                color={panelColor}
                holesLocal={holesLocal}
            />

            {/* Hinged return flaps (+ optional shadow-gap lips) */}
            {edges.map((e) =>
                r[e] ? (
                    <Flap
                        key={e}
                        edge={e}
                        W={W}
                        H={H}
                        D={D}
                        Sg={Sg}
                        fold={fold}
                        color={panelColor}
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

            {/* Reference lettering outline (standoff mode, NOT cut) and
                keyline (register, NOT cut) — drawn as thin overlays.
                Apertures and fixings are real holes in the face above. */}
            {overlay && (
                <>
                    <lineSegments geometry={overlay.ref}>
                        <lineBasicMaterial color="#9ca3af" />
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
            // dpr [1, 2] = retina/HiDPI rendering up to 2x. r3f defaults to
            // 1x without this, which makes hole boundaries + black edge
            // strokes look stair-stepped on phones / retina screens even
            // when the underlying polyline is dense.
            dpr={[1, 2]}
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
