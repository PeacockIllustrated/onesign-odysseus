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
const STANDOFF_STUD_COLOR = '#9aa0a4'; // brushed-metal grey for the studs
// When the operator is actively placing or deleting manual fixings,
// recolour the manual circles so they pop out from the auto-placed
// ones. Emerald = "place" (additive action), red = "delete" — both are
// saturated enough to read against either dark or light letter
// colours, and they match the SvgDropzone pills.
const MANUAL_PLACE_COLOR = '#10b981';
const MANUAL_DELETE_COLOR = '#ef4444';

/** Pick black or white based on the perceptual luminance of `hex`. */
function contrastTo(hex: string): string {
    const h = hex.replace('#', '');
    if (h.length !== 6) return '#ffffff';
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    const L = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return L < 0.55 ? '#ffffff' : '#111111';
}

/**
 * A flat sheet-metal plane with crisp black edges. Paper-thin on purpose —
 * giving each face / return real material thickness exposes the four corner
 * junctions where two returns would meet, which need proper miter / notch
 * joinery to look clean. The flat representation reads as one continuous
 * folded sheet and avoids those artefacts.
 */
function PanelPlane({
    args,
    position,
    color,
    outlines = true,
}: {
    args: [number, number];
    position?: [number, number, number];
    color: string;
    outlines?: boolean;
}) {
    return (
        <mesh position={position}>
            <planeGeometry args={args} />
            <meshBasicMaterial
                color={color}
                side={THREE.DoubleSide}
                polygonOffset
                polygonOffsetFactor={1}
                polygonOffsetUnits={1}
            />
            {outlines && <Edges color={EDGE_COLOR} lineWidth={1.5} />}
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
    outlines = true,
}: {
    W: number; // mm
    H: number; // mm
    color: string;
    /** Holes in face-local mm coords (face centred at origin, y-up). */
    holesLocal: Array<Array<[number, number]>>;
    /** Click handler receives the hit point in scene-local mm × S. */
    onClick?: (sceneX: number, sceneY: number) => void;
    cursorCrosshair?: boolean;
    outlines?: boolean;
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
            <shapeGeometry args={[shape, 48]} />
            <meshBasicMaterial
                color={color}
                side={THREE.DoubleSide}
                polygonOffset
                polygonOffsetFactor={1}
                polygonOffsetUnits={1}
            />
            {outlines && <Edges color={EDGE_COLOR} lineWidth={1.5} />}
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
    outlines = true,
}: {
    edge: PanelEdge;
    W: number;
    H: number;
    D: number;
    Sg: number;
    fold: number;
    color: string;
    outlines?: boolean;
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
            <PanelPlane
                args={planeArgs}
                position={planePos}
                color={color}
                outlines={outlines}
            />
            {hasLip && (
                <group position={lipPos} rotation={lipRot}>
                    <PanelPlane
                        args={lipArgs}
                        position={lipPlanePos}
                        color={color}
                        outlines={outlines}
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
    autoFixings,
    manualFixings,
    thicknessMm,
    standoffMm,
    faceThicknessMm,
    color,
    outlines = true,
    fixingMode = 'off',
    onFixingClick,
}: {
    face: { xMm: number; yMm: number; wMm: number; hMm: number };
    reference: FlatPath[];
    autoFixings: FlatPath[];
    manualFixings: FlatPath[];
    thicknessMm: number;
    standoffMm: number;
    faceThicknessMm: number;
    color: string;
    outlines?: boolean;
    fixingMode?: 'off' | 'place' | 'delete';
    onFixingClick?: (p: [number, number]) => void;
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

    // Front of the panel sits at z = 0 (face extrudes inward to z = -T).
    // The lettering's back sits standoffMm in front of the face, extruded
    // outward by thicknessMm. faceThicknessMm is kept for API stability
    // but no longer affects positioning.
    void faceThicknessMm;
    const baseZ = standoffMm * S;
    const depthScene = thicknessMm * S;

    // Stroke each fixing circle onto the front face of the extruded
    // lettering so the installer can see where the studs land — and so
    // we have a visible target when adding more in place-fixing mode.
    // Auto + manual are built as separate geometries so they can be
    // recoloured independently when the operator is in place/delete mode.
    const buildStrokes = (paths: FlatPath[]): THREE.BufferGeometry | null => {
        if (paths.length === 0) return null;
        const positions: number[] = [];
        const segs = 32;
        // Sit a hair above the front face (z = depth) to avoid z-fight.
        const z = depthScene + 0.3 * S;
        for (const f of paths) {
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
    };
    const autoStrokes = useMemo(
        () => buildStrokes(autoFixings),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [autoFixings, face, depthScene],
    );
    const manualStrokes = useMemo(
        () => buildStrokes(manualFixings),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [manualFixings, face, depthScene],
    );
    const manualColor =
        fixingMode === 'place'
            ? MANUAL_PLACE_COLOR
            : fixingMode === 'delete'
              ? MANUAL_DELETE_COLOR
              : contrastTo(color);

    if (shapes.length === 0) return null;

    // Click-to-place on the letter itself: r3f's raycaster reports the
    // front-most hit first, and stopPropagation here halts it before the
    // panel handler underneath gets a turn. So clicking a letter that
    // sits over an aperture lands the fixing on the letter (closer to
    // camera), not on whatever is behind it.
    const fixingActive = fixingMode !== 'off';
    const letterClick =
        fixingActive && onFixingClick
            ? (e: {
                  stopPropagation: () => void;
                  point: { x: number; y: number };
              }) => {
                  e.stopPropagation();
                  const devX = face.xMm + face.wMm / 2 + e.point.x / S;
                  const devY = face.yMm + face.hMm / 2 - e.point.y / S;
                  onFixingClick([devX, devY]);
              }
            : undefined;
    const letterPointerOver = fixingActive
        ? (e: { stopPropagation: () => void }) => {
              e.stopPropagation();
              document.body.style.cursor = 'crosshair';
          }
        : undefined;
    const letterPointerOut = fixingActive
        ? () => {
              document.body.style.cursor = '';
          }
        : undefined;

    return (
        <group position={[0, 0, baseZ]}>
            {shapes.map((shape, i) => (
                <mesh
                    key={i}
                    onClick={letterClick}
                    onPointerOver={letterPointerOver}
                    onPointerOut={letterPointerOut}>
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
                    {outlines && (
                        <Edges color={EDGE_COLOR} lineWidth={1.5} />
                    )}
                </mesh>
            ))}
            {autoStrokes && (
                // Auto-placed fixings — picked by the algorithm. Painted
                // in a colour that contrasts with the letter, so the
                // installer reads them clearly.
                <lineSegments geometry={autoStrokes}>
                    <lineBasicMaterial color={contrastTo(color)} />
                </lineSegments>
            )}
            {manualStrokes && (
                // Manually-placed fixings. When the operator is in
                // place or delete mode, these recolour (green to add,
                // red to delete) so the user knows which circles they
                // own and can target them precisely.
                <lineSegments geometry={manualStrokes}>
                    <lineBasicMaterial color={manualColor} />
                </lineSegments>
            )}
        </group>
    );
}

/**
 * The physical stand-off locators — short metal cylinders that bridge the
 * gap between the panel face and the back of the extruded lettering, one
 * per fixing position. Diameter is slightly smaller than the fixing hole
 * so the operator can see the locator going through the cut-out cleanly.
 */
function StandoffLocators({
    face,
    fixings,
    fixingDiameterMm,
    faceThicknessMm,
    standoffMm,
    outlines = true,
}: {
    face: { xMm: number; yMm: number; wMm: number; hMm: number };
    fixings: FlatPath[];
    fixingDiameterMm: number;
    faceThicknessMm: number;
    standoffMm: number;
    outlines?: boolean;
}) {
    if (fixings.length === 0 || standoffMm <= 0) return null;
    // Slight clearance so the stud reads as something inside the hole,
    // not the hole itself painted in a different colour. Face front is at
    // z = 0, so studs span 0..standoff in front of the panel.
    void faceThicknessMm;
    const radius = (fixingDiameterMm / 2) * 0.7 * S;
    const length = standoffMm * S;
    const zCenter = (standoffMm / 2) * S;
    return (
        <group>
            {fixings.map((f, i) => {
                if (f.points.length < 3) return null;
                let cx = 0;
                let cy = 0;
                for (const q of f.points) {
                    cx += q[0];
                    cy += q[1];
                }
                cx /= f.points.length;
                cy /= f.points.length;
                const lx = (cx - face.xMm - face.wMm / 2) * S;
                const ly = (face.yMm + face.hMm / 2 - cy) * S;
                return (
                    <mesh
                        key={i}
                        position={[lx, ly, zCenter]}
                        rotation={[HALF_PI, 0, 0]}>
                        <cylinderGeometry
                            args={[radius, radius, length, 20]}
                        />
                        <meshBasicMaterial
                            color={STANDOFF_STUD_COLOR}
                            polygonOffset
                            polygonOffsetFactor={1}
                            polygonOffsetUnits={1}
                        />
                        {outlines && (
                            <Edges color={EDGE_COLOR} lineWidth={1.5} />
                        )}
                    </mesh>
                );
            })}
        </group>
    );
}

function Panel({
    params,
    development: dev,
    split,
    aperture,
    keyline,
    autoFixings,
    manualFixings,
    reference,
    fold,
    fixingMode,
    onFixingClick,
    showOutlines = true,
    showStandoffLetters = true,
    showStandoffLocators = true,
}: {
    params: PanelParams;
    development: PanelDevelopment;
    split: PanelSplit;
    aperture: FlatPath[];
    keyline: FlatPath[];
    autoFixings: FlatPath[];
    manualFixings: FlatPath[];
    reference: FlatPath[];
    fold: number;
    fixingMode?: 'off' | 'place' | 'delete';
    onFixingClick?: (p: [number, number]) => void;
    showOutlines?: boolean;
    showStandoffLetters?: boolean;
    showStandoffLocators?: boolean;
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

    // Cut-outs and locator studs treat every fixing the same — they're
    // all holes in the face / studs through it. Manual-vs-auto only
    // matters for the visual circle indicators on the letters.
    const fixings = useMemo(
        () => [...autoFixings, ...manualFixings],
        [autoFixings, manualFixings],
    );

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
        // Front of the face is at z = 0; sit overlays ~1 mm in front so
        // they read as crisp lines without z-fighting against the cap.
        const z = 1 * S;
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
                outlines={showOutlines}
                cursorCrosshair={(fixingMode ?? 'off') !== 'off'}
                onClick={
                    (fixingMode ?? 'off') !== 'off' && face && onFixingClick
                        ? (sceneX, sceneY) => {
                              // Scene units are mm × S. The face mesh is
                              // centred at world origin, so convert back to
                              // flat-development coords (y-down).
                              const devX =
                                  face.xMm + face.wMm / 2 + sceneX / S;
                              const devY =
                                  face.yMm + face.hMm / 2 - sceneY / S;
                              onFixingClick([devX, devY]);
                          }
                        : undefined
                }
            />

            {/* Stand-off lettering — when in standoff mode, the reference
                paths become 3D extruded letter pieces mounted in front of
                the panel by `standoffDistanceMm`, with their own thickness
                and colour. Locator studs bridge the gap so the connection
                between panel and lettering reads physically. */}
            {(params.apertureMode ?? 'aperture') === 'standoff' &&
                reference.length > 0 &&
                face && (
                    <>
                        {showStandoffLocators && (
                            <StandoffLocators
                                face={face}
                                fixings={fixings}
                                fixingDiameterMm={
                                    params.fixingDiameterMm ?? 10
                                }
                                faceThicknessMm={T}
                                standoffMm={params.standoffDistanceMm ?? 25}
                                outlines={showOutlines}
                            />
                        )}
                        {showStandoffLetters && (
                            <StandoffLettering
                                face={face}
                                reference={reference}
                                autoFixings={autoFixings}
                                manualFixings={manualFixings}
                                thicknessMm={params.letterThicknessMm ?? 5}
                                standoffMm={params.standoffDistanceMm ?? 25}
                                faceThicknessMm={T}
                                color={params.letterColor ?? '#1a1f23'}
                                outlines={showOutlines}
                                fixingMode={fixingMode}
                                onFixingClick={onFixingClick}
                            />
                        )}
                    </>
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
                        outlines={showOutlines}
                    />
                ) : null,
            )}

            {/* Seam lines on the face */}
            {split.wasSplit &&
                split.seamXsMm.map((sx, i) => (
                    <mesh
                        key={`seam-${i}`}
                        position={[(sx - W / 2) * S, 0, 0.5 * S]}
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
                    {/* Reference outline always shows in standoff mode —
                        the "Letters" toggle only hides the extruded 3D
                        lettering, not the footprint on the panel face. */}
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
    autoFixings?: FlatPath[];
    manualFixings?: FlatPath[];
    reference?: FlatPath[];
    /** 0 = flat (unfolded in 3D), 1 = folded. Default folded. */
    fold?: number;
    /** Active fixing edit mode: 'place' drops, 'delete' removes. */
    fixingMode?: 'off' | 'place' | 'delete';
    onFixingClick?: (p: [number, number]) => void;
    showOutlines?: boolean;
    showStandoffLetters?: boolean;
    showStandoffLocators?: boolean;
}) {
    const fold = props.fold ?? 1;
    const autoFixings = props.autoFixings ?? [];
    const manualFixings = props.manualFixings ?? [];
    const reference = props.reference ?? [];
    const showOutlines = props.showOutlines ?? true;
    const showStandoffLetters = props.showStandoffLetters ?? true;
    const showStandoffLocators = props.showStandoffLocators ?? true;
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
                autoFixings={autoFixings}
                manualFixings={manualFixings}
                reference={reference}
                fold={fold}
                fixingMode={props.fixingMode}
                onFixingClick={props.onFixingClick}
                showOutlines={showOutlines}
                showStandoffLetters={showStandoffLetters}
                showStandoffLocators={showStandoffLocators}
            />
            <OrbitControls enablePan makeDefault />
        </Canvas>
    );
}
