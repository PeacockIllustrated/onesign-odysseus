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
    onClick,
    cursorCrosshair,
}: {
    W: number; // mm
    H: number; // mm
    color: string;
    /** Holes in face-local mm coords (face centred at origin, y-up). */
    holesLocal: Array<Array<[number, number]>>;
    /** Click handler receives the hit point in scene-local mm × S. */
    onClick?: (sceneX: number, sceneY: number) => void;
    cursorCrosshair?: boolean;
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
        <mesh
            onClick={
                onClick
                    ? (e) => {
                          e.stopPropagation();
                          onClick(e.point.x, e.point.y);
                      }
                    : undefined
            }
            onPointerOver={
                cursorCrosshair
                    ? (e) => {
                          e.stopPropagation();
                          document.body.style.cursor = 'crosshair';
                      }
                    : undefined
            }
            onPointerOut={
                cursorCrosshair
                    ? () => {
                          document.body.style.cursor = '';
                      }
                    : undefined
            }>
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

/** Even-odd ray cast — same as the placement-side helper, inlined. */
function pointInRing(
    p: [number, number],
    ring: Array<[number, number]>,
): boolean {
    let inside = false;
    let j = ring.length - 1;
    for (let i = 0; i < ring.length; i++) {
        const xi = ring[i][0];
        const yi = ring[i][1];
        const xj = ring[j][0];
        const yj = ring[j][1];
        if (
            yi > p[1] !== yj > p[1] &&
            p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi || 1e-12) + xi
        ) {
            inside = !inside;
        }
        j = i;
    }
    return inside;
}

/**
 * Stand-off lettering — extrude each letter (outer + nested counter holes)
 * by the letter thickness and mount it in front of the panel face. The
 * panel keeps its fixing holes; the lettering sits proud of the face by
 * `standoffMm`, so the 3D shows the assembled sign rather than just an
 * outline overlay.
 */
function StandoffLettering({
    face,
    reference,
    fixings,
    thicknessMm,
    standoffMm,
    faceThicknessMm,
    color,
}: {
    face: { xMm: number; yMm: number; wMm: number; hMm: number };
    reference: FlatPath[];
    fixings: FlatPath[];
    thicknessMm: number;
    standoffMm: number;
    faceThicknessMm: number;
    color: string;
}) {
    const shapes = useMemo(() => {
        const closed = reference.filter(
            (p) => p.closed && p.points.length > 3,
        );
        if (closed.length === 0) return [];

        const toLocal = (p: [number, number]): [number, number] => [
            (p[0] - face.xMm - face.wMm / 2) * S,
            (face.yMm + face.hMm / 2 - p[1]) * S,
        ];

        // Each ring's containment depth — even = outer, odd = hole.
        const rings = closed.map((p) =>
            p.points.slice(0, -1) as Array<[number, number]>,
        );
        const depth = rings.map((r, i) => {
            const probe = r[0];
            let d = 0;
            for (let j = 0; j < rings.length; j++) {
                if (i === j) continue;
                if (pointInRing(probe, rings[j])) d++;
            }
            return d;
        });

        const out: THREE.Shape[] = [];
        for (let i = 0; i < rings.length; i++) {
            if (depth[i] % 2 !== 0) continue; // skip holes — picked up below
            const local = rings[i].map(toLocal);
            const shape = new THREE.Shape();
            shape.moveTo(local[0][0], local[0][1]);
            for (let k = 1; k < local.length; k++) {
                shape.lineTo(local[k][0], local[k][1]);
            }
            shape.closePath();
            // Direct child holes — odd-depth rings whose first point lies
            // inside this outer (and not inside another tighter outer).
            for (let j = 0; j < rings.length; j++) {
                if (i === j || depth[j] % 2 === 0) continue;
                if (!pointInRing(rings[j][0], rings[i])) continue;
                // Skip if some intermediate outer wraps this hole more
                // tightly (handles deeply nested compound paths).
                let nested = false;
                for (let m = 0; m < rings.length; m++) {
                    if (m === i || m === j || depth[m] % 2 !== 0) continue;
                    if (
                        pointInRing(rings[j][0], rings[m]) &&
                        pointInRing(rings[m][0], rings[i])
                    ) {
                        nested = true;
                        break;
                    }
                }
                if (nested) continue;
                const lh = rings[j].map(toLocal);
                const h = new THREE.Path();
                h.moveTo(lh[0][0], lh[0][1]);
                for (let k = 1; k < lh.length; k++) {
                    h.lineTo(lh[k][0], lh[k][1]);
                }
                h.closePath();
                shape.holes.push(h);
            }
            out.push(shape);
        }
        return out;
    }, [face, reference]);

    // Front of the panel sits at z = +faceT/2 (panel is centred at z=0
    // with thickness faceT). The lettering sits standoffMm in front,
    // extruded outward by thicknessMm.
    const baseZ = (faceThicknessMm / 2 + standoffMm) * S;
    const depthScene = thicknessMm * S;

    // Stroke each fixing circle onto the front face of the extruded
    // lettering so the installer can see where the studs land — and so
    // we have a visible target when adding more in place-fixing mode.
    const fixingStrokes = useMemo(() => {
        if (fixings.length === 0) return null;
        const positions: number[] = [];
        const segs = 32;
        // Sit a hair above the front face (z = depth) to avoid z-fight.
        const z = depthScene + 0.3 * S;
        for (const f of fixings) {
            const pts = f.points;
            if (pts.length < 3) continue;
            let cx = 0,
                cy = 0;
            for (const q of pts) {
                cx += q[0];
                cy += q[1];
            }
            cx /= pts.length;
            cy /= pts.length;
            let r = 0;
            for (const q of pts) r += Math.hypot(q[0] - cx, q[1] - cy);
            r /= pts.length;
            const lx = (cx - face.xMm - face.wMm / 2) * S;
            const ly = (face.yMm + face.hMm / 2 - cy) * S;
            const rs = r * S;
            for (let i = 0; i < segs; i++) {
                const t0 = (i / segs) * Math.PI * 2;
                const t1 = ((i + 1) / segs) * Math.PI * 2;
                positions.push(
                    lx + Math.cos(t0) * rs,
                    ly + Math.sin(t0) * rs,
                    z,
                );
                positions.push(
                    lx + Math.cos(t1) * rs,
                    ly + Math.sin(t1) * rs,
                    z,
                );
            }
        }
        if (positions.length === 0) return null;
        const g = new THREE.BufferGeometry();
        g.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(positions, 3),
        );
        return g;
    }, [fixings, face, depthScene]);

    if (shapes.length === 0) return null;

    return (
        <group position={[0, 0, baseZ]}>
            {shapes.map((shape, i) => (
                <mesh key={i}>
                    <extrudeGeometry
                        args={[
                            shape,
                            {
                                depth: depthScene,
                                bevelEnabled: false,
                                curveSegments: 48,
                            },
                        ]}
                    />
                    <meshBasicMaterial
                        color={color}
                        side={THREE.DoubleSide}
                        polygonOffset
                        polygonOffsetFactor={1}
                        polygonOffsetUnits={1}
                    />
                    <Edges color={EDGE_COLOR} lineWidth={1.5} />
                </mesh>
            ))}
            {fixingStrokes && (
                <lineSegments geometry={fixingStrokes}>
                    <lineBasicMaterial color={EDGE_COLOR} />
                </lineSegments>
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
    placeFixingMode,
    onPlaceFixing,
}: {
    params: PanelParams;
    development: PanelDevelopment;
    split: PanelSplit;
    aperture: FlatPath[];
    keyline: FlatPath[];
    fixings: FlatPath[];
    reference: FlatPath[];
    fold: number;
    placeFixingMode?: boolean;
    onPlaceFixing?: (p: [number, number]) => void;
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
                cursorCrosshair={placeFixingMode}
                onClick={
                    placeFixingMode && face && onPlaceFixing
                        ? (sceneX, sceneY) => {
                              // Scene units are mm × S. The face mesh is
                              // centred at world origin, so convert back to
                              // flat-development coords (y-down).
                              const devX =
                                  face.xMm + face.wMm / 2 + sceneX / S;
                              const devY =
                                  face.yMm + face.hMm / 2 - sceneY / S;
                              onPlaceFixing([devX, devY]);
                          }
                        : undefined
                }
            />

            {/* Stand-off lettering — when in standoff mode, the reference
                paths become 3D extruded letter pieces mounted in front of
                the panel by `standoffDistanceMm`, with their own thickness
                and colour. */}
            {(params.apertureMode ?? 'aperture') === 'standoff' &&
                reference.length > 0 &&
                face && (
                    <StandoffLettering
                        face={face}
                        reference={reference}
                        fixings={fixings}
                        thicknessMm={params.letterThicknessMm ?? 5}
                        standoffMm={params.standoffDistanceMm ?? 25}
                        faceThicknessMm={T}
                        color={params.letterColor ?? '#1a1f23'}
                    />
                )}

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
    /** When true, clicks on the panel face drop a manual fixing. */
    placeFixingMode?: boolean;
    onPlaceFixing?: (p: [number, number]) => void;
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
            <Panel
                {...props}
                fixings={fixings}
                reference={reference}
                fold={fold}
                placeFixingMode={props.placeFixingMode}
                onPlaceFixing={props.onPlaceFixing}
            />
            <OrbitControls enablePan makeDefault />
        </Canvas>
    );
}
