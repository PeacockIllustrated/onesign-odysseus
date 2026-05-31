'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Edges, Html } from '@react-three/drei';
import * as THREE from 'three';
import type {
    PanelParams,
    PanelDevelopment,
    PanelSplit,
    FlatPath,
    PanelEdge,
    MaterialPiece,
    StandoffPiece,
    PushThroughPiece,
} from '@/lib/visualiser/types';

/**
 * Set by the scene on mount so ExportBar can grab thumbnails. `fn` is the
 * current orbit view (the nice angled shot used on the reference PDF);
 * `faceOn` is a straight-on orthographic shot of the sign face, framed to its
 * bounds — a clean wide rectangle that crops tightly for the backshop banner.
 */
export const sceneCapture: {
    fn: (() => string | null) | null;
    faceOn: (() => string | null) | null;
} = { fn: null, faceOn: null };

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
        sceneCapture.faceOn = () => {
            try {
                const box = new THREE.Box3().setFromObject(scene);
                if (box.isEmpty()) {
                    gl.render(scene, camera);
                    return gl.domElement.toDataURL('image/png');
                }
                const size = box.getSize(new THREE.Vector3());
                const centre = box.getCenter(new THREE.Vector3());
                const aspect =
                    (gl.domElement.width || 1) / (gl.domElement.height || 1);
                // Frame the face (XY) with a little padding, matched to the
                // canvas aspect so nothing stretches.
                const pad = 1.08;
                let halfW = (size.x / 2) * pad;
                let halfH = (size.y / 2) * pad;
                if (halfW / halfH < aspect) halfW = halfH * aspect;
                else halfH = halfW / aspect;
                // Camera straight in front of the face (panel faces +Z).
                const dist = size.z + Math.max(size.x, size.y, 1) + 10;
                const cam = new THREE.OrthographicCamera(
                    -halfW,
                    halfW,
                    halfH,
                    -halfH,
                    0.01,
                    dist * 4,
                );
                cam.position.set(centre.x, centre.y, centre.z + dist);
                cam.up.set(0, 1, 0);
                cam.lookAt(centre.x, centre.y, centre.z);
                cam.updateMatrixWorld();
                cam.updateProjectionMatrix();
                gl.render(scene, cam);
                const url = gl.domElement.toDataURL('image/png');
                gl.render(scene, camera); // restore the operator's view
                return url;
            } catch {
                return null;
            }
        };
        return () => {
            sceneCapture.fn = null;
            sceneCapture.faceOn = null;
        };
    }, [gl, scene, camera]);
    return null;
}

const S = 0.01; // mm → scene units
const HALF_PI = Math.PI / 2;
const DEFAULT_PANEL_COLOR = '#d6d6d6';
const ACCENT = '#4e7e8c'; // brand steel teal — accents on overlay widgets
const EDGE_COLOR = '#111111'; // technical-drawing black strokes
const STANDOFF_STUD_COLOR = '#9aa0a4'; // brushed-metal grey for the studs
// When the operator is actively placing or deleting manual fixings,
// recolour the manual circles so they pop out from the auto-placed
// ones. Emerald = "place" (additive action), red = "delete" — both are
// saturated enough to read against either dark or light letter
// colours, and they match the SvgDropzone pills.
const MANUAL_PLACE_COLOR = '#10b981';
const MANUAL_DELETE_COLOR = '#ef4444';

// Illumination preview. The scene has no real lights (everything is
// meshBasicMaterial, which ignores lighting), so "going dark" means:
// drop the background to near-black and multiply every surface colour
// down toward black. The only things that DON'T darken are the
// emissive elements (the opal backing in keyline mode), which carry
// their own light. NIGHT_FACTOR is how much ambient bounce survives —
// low enough that lit elements dominate, high enough that the dark
// geometry still reads as form rather than a black void.
const NIGHT_BG = '#0a0b0d';
const NIGHT_FACTOR = 0.17;

/** Multiply a hex colour toward black by `factor` (0..1). */
function shadeHex(hex: string, factor: number): string {
    const h = hex.replace('#', '');
    if (h.length !== 6) return hex;
    const ch = (i: number) =>
        Math.max(
            0,
            Math.min(
                255,
                Math.round(parseInt(h.substring(i, i + 2), 16) * factor),
            ),
        )
            .toString(16)
            .padStart(2, '0');
    return `#${ch(0)}${ch(2)}${ch(4)}`;
}

/** Display colour for a surface — darkened in the illumination view. */
function displayColor(hex: string, night: boolean): string {
    return night ? shadeHex(hex, NIGHT_FACTOR) : hex;
}

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
        // Up-fold: the lip rotates OPPOSITE to the return so when both
        // are fully folded, the lip ends up parallel to the face plane
        // again, extending past the panel's bottom edge (downward) at
        // z = -D. Inward-fold would have been [a, 0, 0]; outward is
        // [-a, 0, 0].
        lipRot = [-a, 0, 0];
        lipArgs = [W * S, Sg * S];
        lipPlanePos = [0, (-Sg / 2) * S, 0];
    } else if (edge === 'top') {
        groupPos = [0, (H / 2) * S, 0];
        groupRot = [-a, 0, 0];
        planeArgs = [W * S, D * S];
        planePos = [0, (D / 2) * S, 0];
        lipPos = [0, D * S, 0];
        // Up-fold: opposite direction to the return so the lip ends up
        // extending past the panel's top edge (upward) at z = -D.
        lipRot = [a, 0, 0];
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

/**
 * Keep only the fixings whose centroid sits inside `path`. Used to
 * partition global fixings across multiple standoff pieces so the
 * locator stroke / cylinder for each fixing renders on the right
 * letter at the right z.
 */
function filterFixingsInside(
    fixings: FlatPath[],
    path: FlatPath,
): FlatPath[] {
    if (!path.closed || path.points.length < 3) return [];
    const ring = path.points.slice(0, -1) as Array<[number, number]>;
    const out: FlatPath[] = [];
    for (const f of fixings) {
        if (f.points.length < 3) continue;
        let cx = 0;
        let cy = 0;
        for (const [x, y] of f.points) {
            cx += x;
            cy += y;
        }
        cx /= f.points.length;
        cy /= f.points.length;
        if (pointInRing([cx, cy], ring)) out.push(f);
    }
    return out;
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
    night = false,
}: {
    face: { xMm: number; yMm: number; wMm: number; hMm: number };
    fixings: FlatPath[];
    fixingDiameterMm: number;
    faceThicknessMm: number;
    standoffMm: number;
    outlines?: boolean;
    night?: boolean;
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
                            color={displayColor(STANDOFF_STUD_COLOR, night)}
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

/**
 * Click-targets for material-group editing in 3D. Always picks up
 * clicks when `onToggle` is supplied — outside group-edit mode the
 * dispatcher in the parent auto-enters the path's group (or starts a
 * new group with that path selected); inside edit mode it toggles
 * selection. Group-membership is shown as a translucent wash over the
 * whole element AND a stroke around it, so the tag is visible at a
 * glance rather than just hinted at the outline.
 */
function PathHitTarget({
    pathIndex,
    shape,
    outlinePoints,
    inPending,
    groupColor,
    onToggle,
}: {
    pathIndex: number;
    shape: THREE.Shape | null;
    outlinePoints: Float32Array | null;
    inPending: boolean;
    groupColor: string | null;
    onToggle?: (i: number) => void;
}) {
    // ALL hooks must run unconditionally — early-returning before
    // useMemo below changed hook count between renders and crashed the
    // app on next mount of the canvas. Keep hooks at the top.
    const [hovered, setHovered] = useState(false);
    // Sits a hair above the face front so the outline never z-fights
    // with the face mesh or the material pieces.
    const z = 0.7 * S;
    const outlineGeom = useMemo(() => {
        if (!outlinePoints) return null;
        const positions: number[] = [];
        for (let i = 0; i + 5 < outlinePoints.length; i += 3) {
            positions.push(
                outlinePoints[i],
                outlinePoints[i + 1],
                z,
            );
            positions.push(
                outlinePoints[i + 3],
                outlinePoints[i + 4],
                z,
            );
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(positions, 3),
        );
        return g;
    }, [outlinePoints, z]);
    if (!shape || !outlineGeom) return null;
    const hitListens = !!onToggle;
    // Wash colour priority: pending > hovered > group membership.
    const washColor = inPending
        ? '#f97316'
        : hovered && hitListens
          ? '#f97316'
          : groupColor;
    const washOpacity = inPending ? 0.28 : hovered && hitListens ? 0.18 : 0.22;
    return (
        <group>
            {washColor && (
                <mesh position={[0, 0, z]}>
                    <shapeGeometry args={[shape, 48]} />
                    <meshBasicMaterial
                        color={washColor}
                        transparent
                        opacity={washOpacity}
                        depthWrite={false}
                    />
                </mesh>
            )}
            {washColor && (
                <lineSegments
                    geometry={outlineGeom}
                    position={[0, 0, 0.005 * S]}>
                    <lineBasicMaterial
                        color={washColor}
                        transparent
                        opacity={inPending ? 1 : 0.85}
                    />
                </lineSegments>
            )}
            {hitListens && (
                <mesh
                    position={[0, 0, z + 0.01 * S]}
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggle?.(pathIndex);
                    }}
                    onPointerOver={(e) => {
                        e.stopPropagation();
                        document.body.style.cursor = 'pointer';
                        setHovered(true);
                    }}
                    onPointerOut={() => {
                        document.body.style.cursor = '';
                        setHovered(false);
                    }}>
                    <shapeGeometry args={[shape, 32]} />
                    <meshBasicMaterial
                        transparent
                        opacity={0}
                        depthWrite={false}
                    />
                </mesh>
            )}
        </group>
    );
}

/**
 * Mixed-material pieces — paths the operator has removed from the cut
 * and re-classified as vinyl (flat colour on the face) or acrylic
 * (extruded sheet sitting on the face). Each shape is built from its
 * placed + clipped polygon, so apertures and these pieces line up.
 */
function MaterialPieces({
    face,
    vinyl,
    acrylic,
    solid,
    outlines = true,
    night = false,
}: {
    face: { xMm: number; yMm: number; wMm: number; hMm: number };
    vinyl: MaterialPiece[];
    acrylic: MaterialPiece[];
    solid: MaterialPiece[];
    outlines?: boolean;
    night?: boolean;
}) {
    const toLocal = (q: [number, number]): [number, number] => [
        (q[0] - face.xMm - face.wMm / 2) * S,
        (face.yMm + face.hMm / 2 - q[1]) * S,
    ];
    const compoundShape = (piece: MaterialPiece): THREE.Shape => {
        const shape = new THREE.Shape();
        const outer = piece.path.points.map(toLocal);
        if (outer.length === 0) return shape;
        shape.moveTo(outer[0][0], outer[0][1]);
        for (let i = 1; i < outer.length; i++)
            shape.lineTo(outer[i][0], outer[i][1]);
        if (piece.path.closed) shape.closePath();
        // Nested counters → holes. Outer letter shapes with holes
        // (O / A / e / g etc.) end up as proper donuts in 3D too.
        for (const hole of piece.holes ?? []) {
            const hp = hole.points.map(toLocal);
            if (hp.length < 3) continue;
            const path = new THREE.Path();
            path.moveTo(hp[0][0], hp[0][1]);
            for (let i = 1; i < hp.length; i++)
                path.lineTo(hp[i][0], hp[i][1]);
            if (hole.closed) path.closePath();
            shape.holes.push(path);
        }
        return shape;
    };

    return (
        <group>
            {/* Solid (floating inner counters): paper-thin coloured fill
                that SITS ON the face, painted in the group's colour
                (defaults to the panel colour). These are the "donut
                centres" — the floating bits of letters that aren't
                cut away. Drawn first / lowest so vinyl and acrylic
                pieces layer on top. */}
            {solid.map((piece, i) => (
                <mesh
                    key={`solid-${piece.pathIndex}-${i}`}
                    position={[0, 0, 0.5 * S]}>
                    <shapeGeometry args={[compoundShape(piece), 48]} />
                    <meshBasicMaterial
                        color={displayColor(piece.color, night)}
                        side={THREE.DoubleSide}
                        polygonOffset
                        polygonOffsetFactor={1}
                        polygonOffsetUnits={1}
                    />
                    {outlines && (
                        <Edges color={EDGE_COLOR} lineWidth={1} />
                    )}
                </mesh>
            ))}

            {/* Vinyl: paper-thin coloured fill ~1 mm in front of the face
                (avoids z-fighting with the panel surface). */}
            {vinyl.map((piece, i) => (
                <mesh
                    key={`vinyl-${piece.pathIndex}-${i}`}
                    position={[0, 0, 1 * S]}>
                    <shapeGeometry args={[compoundShape(piece), 48]} />
                    <meshBasicMaterial
                        color={displayColor(piece.color, night)}
                        side={THREE.DoubleSide}
                        polygonOffset
                        polygonOffsetFactor={1}
                        polygonOffsetUnits={1}
                    />
                    {outlines && (
                        <Edges color={EDGE_COLOR} lineWidth={1} />
                    )}
                </mesh>
            ))}

            {/* Acrylic: extruded sheet sitting on the face. Sits at z = 0
                to z = thicknessMm so its back is flush with the panel
                front (face is paper-thin at z = 0). */}
            {acrylic.map((piece, i) => {
                const depth = Math.max(0.1, piece.thicknessMm ?? 5) * S;
                return (
                    <mesh
                        key={`acrylic-${piece.pathIndex}-${i}`}>
                        <extrudeGeometry
                            args={[
                                compoundShape(piece),
                                {
                                    depth,
                                    bevelEnabled: false,
                                    curveSegments: 48,
                                },
                            ]}
                        />
                        <meshBasicMaterial
                            color={displayColor(piece.color, night)}
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

/**
 * Push-through inserts — letters pressed through the panel face from
 * behind. The panel already has the press-fit hole cut at the keyline
 * (slightly larger than the letter outline). Each piece renders as a
 * single compound extrusion: outer letter outline + counter regions as
 * THREE.Path holes through the extrusion.
 *
 * Counters are NOT rendered as separate filled pieces in the preview,
 * even though production cuts them that way. Reason: filling counters
 * with same-coloured acrylic blobs would hide the very thing the
 * operator needs to see — that the R has its counter, the O is a
 * donut, the e has its eye. Showing them as visible holes through the
 * letter makes the design verifiable at a glance. The production PDF
 * still emits both pieces as separate contours so the cutter produces
 * the right parts.
 *
 * Extrusion runs FROM the panel face outward, `protrusionMm` proud of
 * the face. (In production the pieces extend back to the backing
 * board too, but only the proud-of-face part is visible from the
 * front, so we render just that.)
 */
function PushThroughPieces({
    face,
    pieces,
    materialThicknessMm,
    outlines = true,
    night = false,
}: {
    face: { xMm: number; yMm: number; wMm: number; hMm: number };
    pieces: PushThroughPiece[];
    /**
     * Face panel thickness — letters extrude back from the panel face
     * far enough to pass through the panel hole and mount on the
     * backing panel front. Without this, the letter back face sits at
     * the same z as the face plane and z-fights the panel.
     */
    materialThicknessMm: number;
    outlines?: boolean;
    night?: boolean;
}) {
    const builtShapes = useMemo(() => {
        const toLocal = (q: [number, number]): [number, number] => [
            (q[0] - face.xMm - face.wMm / 2) * S,
            (face.yMm + face.hMm / 2 - q[1]) * S,
        ];
        return pieces.map((piece) => {
            const outerLocal = piece.path.points.map(toLocal);
            const outer = new THREE.Shape();
            if (outerLocal.length < 3) {
                return { outer, hasOuter: false };
            }
            outer.moveTo(outerLocal[0][0], outerLocal[0][1]);
            for (let i = 1; i < outerLocal.length; i++) {
                outer.lineTo(outerLocal[i][0], outerLocal[i][1]);
            }
            outer.closePath();
            for (const hole of piece.holes ?? []) {
                const hp = hole.points.map(toLocal);
                if (hp.length < 3) continue;
                const path = new THREE.Path();
                path.moveTo(hp[0][0], hp[0][1]);
                for (let i = 1; i < hp.length; i++) {
                    path.lineTo(hp[i][0], hp[i][1]);
                }
                path.closePath();
                outer.holes.push(path);
            }
            return { outer, hasOuter: true };
        });
    }, [pieces, face.xMm, face.yMm, face.wMm, face.hMm]);

    if (pieces.length === 0) return null;

    return (
        <group>
            {pieces.map((piece, pi) => {
                const built = builtShapes[pi];
                if (!built.hasOuter) return null;
                // Letter passes through the face panel hole. Visual
                // extent ALWAYS spans from the backing panel front
                // (z = -materialThickness) to the protrusion proud of
                // the face (z = +protrusion), regardless of the
                // user's `thicknessMm` — production reality is the
                // letter has to physically reach back to whatever it
                // mounts on. `thicknessMm` is preserved as a spec
                // value for the production PDF.
                const backFaceZ = -materialThicknessMm * S;
                const depthScene =
                    (materialThicknessMm + piece.protrusionMm) * S;
                return (
                    <mesh
                        key={`pt-${piece.pathIndex}-${pi}`}
                        position={[0, 0, backFaceZ]}>
                        <extrudeGeometry
                            args={[
                                built.outer,
                                {
                                    depth: depthScene,
                                    bevelEnabled: false,
                                    curveSegments: 48,
                                },
                            ]}
                        />
                        <meshBasicMaterial
                            color={displayColor(piece.color, night)}
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

/**
 * Opal diffuser backing panel — the white acrylic sheet that sits
 * BEHIND the face panel. Push-through letter pieces (and their
 * counter pieces) are glued to its front; the assembly is then
 * pressed against the back of the face panel from behind. A light
 * source behind the diffuser shines through the panel's keyline
 * holes, illuminating the shoulder between letter outline and
 * keyline edge as a soft halo around each letter.
 *
 * One panel covers the union bbox of every push-through piece on
 * the sign (with padding). Real production usually uses one big
 * opal sheet rather than per-letter cut-outs, and this matches that.
 *
 * Translucent material so the letter pieces glued to its front are
 * still discernible from the front view through the keyline hole —
 * which is exactly what happens with backlit opal acrylic.
 */
function PushThroughBacking({
    face,
    pieces,
    materialThicknessMm,
    outlines = true,
    night = false,
    lit = false,
    glowColor = '#ffffff',
    glowIntensity = 1,
}: {
    face: { xMm: number; yMm: number; wMm: number; hMm: number };
    pieces: PushThroughPiece[];
    /**
     * Face panel thickness — backing sits BEHIND the face panel back
     * (z = -materialThicknessMm), with no overlap. Without this the
     * translucent backing fights the face plane and produces a
     * hatched z-fighting artifact across both surfaces.
     */
    materialThicknessMm: number;
    outlines?: boolean;
    /** Dark illumination view — darken the unlit opal. */
    night?: boolean;
    /** Keyline illumination on — the opal glows (emissive). */
    lit?: boolean;
    glowColor?: string;
    glowIntensity?: number;
}) {
    const layout = useMemo(() => {
        if (pieces.length === 0) return null;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const piece of pieces) {
            for (const [x, y] of piece.path.points) {
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
            for (const hole of piece.holes ?? []) {
                for (const [x, y] of hole.points) {
                    if (x < minX) minX = x;
                    if (y < minY) minY = y;
                    if (x > maxX) maxX = x;
                    if (y > maxY) maxY = y;
                }
            }
        }
        // Tight padding so the backing reads as a panel without
        // extending into territory occupied by standoff fixings,
        // dimensions, or other panel hardware nearby.
        const pad = 12;
        const wMm = maxX - minX + pad * 2;
        const hMm = maxY - minY + pad * 2;
        const cxMm = (minX + maxX) / 2;
        const cyMm = (minY + maxY) / 2;
        return { wMm, hMm, cxMm, cyMm };
    }, [pieces]);

    if (!layout || pieces.length === 0) return null;

    const BACKING_THICKNESS_MM = 5;
    const cx = (layout.cxMm - face.xMm - face.wMm / 2) * S;
    const cy = (face.yMm + face.hMm / 2 - layout.cyMm) * S;
    // Backing front face sits flush against the back of the face panel
    // (z = -materialThicknessMm). Centre Z is half the backing
    // thickness further back.
    const cz =
        (-materialThicknessMm - BACKING_THICKNESS_MM / 2) * S;

    const boxArgs: [number, number, number] = [
        layout.wMm * S,
        layout.hMm * S,
        BACKING_THICKNESS_MM * S,
    ];

    // Lit: opal glows. meshStandardMaterial renders its emissive
    // colour regardless of scene lighting (there are no lights), so a
    // black base + emissive glow reads as a self-lit diffuser. The
    // halo falls out of the existing geometry — the keyline gap in the
    // dark face panel reveals this glowing panel behind. toneMapped is
    // off so a bright colour isn't desaturated by tone mapping. Opaque
    // so the halo ring stays crisp.
    if (lit) {
        return (
            <mesh position={[cx, cy, cz]}>
                <boxGeometry args={boxArgs} />
                <meshStandardMaterial
                    color="#000000"
                    emissive={glowColor}
                    emissiveIntensity={Math.max(0, glowIntensity)}
                    toneMapped={false}
                />
            </mesh>
        );
    }

    return (
        <mesh position={[cx, cy, cz]}>
            <boxGeometry args={boxArgs} />
            <meshBasicMaterial
                // Unlit opal: a dim sheet in the dark view, the usual
                // translucent opal in daylight.
                color={night ? shadeHex('#f5f5f0', 0.28) : '#f5f5f0'}
                transparent={!night}
                opacity={night ? 1 : 0.78}
                polygonOffset
                polygonOffsetFactor={1}
                polygonOffsetUnits={1}
            />
            {outlines && <Edges color={EDGE_COLOR} lineWidth={1} />}
        </mesh>
    );
}

function Path3DHitTargets({
    face,
    placedPathsByIndex,
    pathGroupColors,
    pendingPaths,
    onPathToggle,
}: {
    face: { xMm: number; yMm: number; wMm: number; hMm: number };
    placedPathsByIndex: Array<FlatPath | null>;
    pathGroupColors: Array<string | null>;
    pendingPaths: Set<number>;
    onPathToggle?: (i: number) => void;
}) {
    const toLocal = (q: [number, number]): [number, number] => [
        (q[0] - face.xMm - face.wMm / 2) * S,
        (face.yMm + face.hMm / 2 - q[1]) * S,
    ];
    const targets = useMemo(() => {
        return placedPathsByIndex.map((p) => {
            if (!p || !p.closed || p.points.length < 3) {
                return { shape: null, outline: null };
            }
            const pts = p.points.map(toLocal);
            const shape = new THREE.Shape();
            shape.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++)
                shape.lineTo(pts[i][0], pts[i][1]);
            shape.closePath();
            const flat: number[] = [];
            for (const [x, y] of pts) flat.push(x, y, 0);
            return { shape, outline: new Float32Array(flat) };
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [placedPathsByIndex, face.xMm, face.yMm, face.wMm, face.hMm]);

    return (
        <group>
            {targets.map((t, i) => (
                <PathHitTarget
                    key={`hit3d-${i}`}
                    pathIndex={i}
                    shape={t.shape}
                    outlinePoints={t.outline}
                    inPending={pendingPaths.has(i)}
                    groupColor={pathGroupColors[i] ?? null}
                    onToggle={onPathToggle}
                />
            ))}
        </group>
    );
}

const DIM_LINE_COLOR = '#64748b'; // slate-500 — reads on light + dark

/**
 * Editable dimension label anchored at a 3D point. drei's Html renders
 * a DOM chip that tracks the projected screen position of `position`,
 * so the label stays crisp and clickable while living in scene space
 * next to the geometry it measures. Clicking turns it into a numeric
 * input; Enter / blur commits and propagates the change upstream.
 */
function DimensionEditLabel({
    position,
    label,
    valueMm,
    onCommit,
    addWhenZero,
}: {
    position: [number, number, number];
    label: string;
    valueMm: number;
    onCommit: (v: number) => void;
    /**
     * When the value is zero (feature absent), show a "+ add" pill
     * instead of a measurement. Clicking it commits `defaultMm`, which
     * brings the feature into existence and flips the label to its
     * normal editable state.
     */
    addWhenZero?: { label: string; defaultMm: number };
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(String(Math.round(valueMm)));
    useEffect(() => {
        // Re-seed the draft from the live value whenever we're not
        // actively editing (e.g. the operator changed it elsewhere).
        if (!editing) setDraft(String(Math.round(valueMm)));
    }, [valueMm, editing]);
    const commit = () => {
        const v = parseFloat(draft);
        if (Number.isFinite(v) && v > 0) onCommit(v);
        setEditing(false);
    };

    // Absent feature → a plus affordance to add it.
    if (addWhenZero && valueMm <= 0 && !editing) {
        return (
            <Html position={position} center zIndexRange={[30, 0]}>
                <button
                    type="button"
                    onClick={() => onCommit(addWhenZero.defaultMm)}
                    title={`Add ${addWhenZero.label.toLowerCase()}`}
                    className="flex items-center gap-1 whitespace-nowrap rounded-full border border-dashed border-neutral-300 bg-white/80 px-2 py-0.5 text-[11px] font-medium text-neutral-500 shadow-sm hover:border-neutral-400 hover:text-neutral-700"
                >
                    <Plus size={12} aria-hidden style={{ color: ACCENT }} />
                    {addWhenZero.label}
                </button>
            </Html>
        );
    }

    return (
        <Html position={position} center zIndexRange={[30, 0]}>
            {editing ? (
                <div className="flex items-center gap-1 rounded-full bg-white px-1.5 py-0.5 shadow ring-1 ring-black/10">
                    <input
                        autoFocus
                        type="number"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={commit}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') commit();
                            else if (e.key === 'Escape') setEditing(false);
                        }}
                        className="w-14 rounded bg-transparent text-center text-[11px] font-medium tabular-nums text-neutral-800 focus:outline-none"
                    />
                    <span className="pr-0.5 text-[9px] text-neutral-400">
                        mm
                    </span>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => setEditing(true)}
                    title={`Edit ${label} — click to change`}
                    className="flex items-center gap-1 whitespace-nowrap rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium tabular-nums text-neutral-700 shadow-sm ring-1 ring-black/5 hover:bg-white hover:ring-black/20"
                >
                    <span className="text-neutral-400">{label}</span>
                    {Math.round(valueMm)} mm
                </button>
            )}
        </Html>
    );
}

/**
 * In-scene dimension annotations for the face. Width + height get true
 * dimension lines (extension lines, dimension line, end ticks) along
 * the bottom and left edges. Return depth + shadow gap are callouts —
 * a leader from the relevant edge to an editable label — since they
 * measure perpendicular into the (folded) returns rather than across
 * the face, so a scale dimension line would imply a false length.
 * Every label propagates edits straight back to the panel params; the
 * shadow-gap callout shows a "+ Shadow gap" affordance when absent.
 */
function Dimensions3D({
    W,
    H,
    returnDepthMm,
    hasReturns,
    shadowGapMm,
    onDimensionChange,
}: {
    W: number;
    H: number;
    returnDepthMm: number;
    hasReturns: boolean;
    shadowGapMm: number;
    onDimensionChange?: (
        field: 'width' | 'height' | 'return' | 'shadowGap',
        valueMm: number,
    ) => void;
}) {
    const hw = (W / 2) * S;
    const hh = (H / 2) * S;
    // Offset the dimension lines clear of the face, scaled to the sign
    // so they sit a sensible distance away on both small and large
    // panels.
    const offMm = Math.max(30, Math.max(W, H) * 0.06);
    const off = offMm * S;
    const tick = Math.max(offMm * 0.22, 6) * S;
    const z = 0.4 * S;

    const lineGeom = useMemo(() => {
        const yDim = -hh - off;
        const xDim = -hw - off;
        const seg: number[] = [];
        const push = (
            ax: number,
            ay: number,
            bx: number,
            by: number,
        ) => {
            seg.push(ax, ay, z, bx, by, z);
        };
        // Width (bottom): extension lines, dimension line, end ticks.
        push(-hw, -hh, -hw, yDim - tick);
        push(hw, -hh, hw, yDim - tick);
        push(-hw, yDim, hw, yDim);
        push(-hw - tick, yDim - tick, -hw + tick, yDim + tick);
        push(hw - tick, yDim - tick, hw + tick, yDim + tick);
        // Height (left): extension lines, dimension line, end ticks.
        push(-hw, -hh, xDim - tick, -hh);
        push(-hw, hh, xDim - tick, hh);
        push(xDim, -hh, xDim, hh);
        push(xDim - tick, -hh - tick, xDim + tick, -hh + tick);
        push(xDim - tick, hh - tick, xDim + tick, hh + tick);
        // Shadow-gap callout leader (top edge centre → label) always
        // (the label itself offers to add a gap when there's none);
        // return callout leader (right edge centre → label) when
        // returns exist.
        push(0, hh, 0, hh + off - tick);
        if (hasReturns) push(hw, 0, hw + off - tick, 0);
        const g = new THREE.BufferGeometry();
        g.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(seg, 3),
        );
        return g;
    }, [hw, hh, off, tick, z, hasReturns]);

    return (
        <group>
            <lineSegments geometry={lineGeom}>
                <lineBasicMaterial color={DIM_LINE_COLOR} />
            </lineSegments>
            <DimensionEditLabel
                position={[0, -hh - off, z]}
                label="W"
                valueMm={W}
                onCommit={(v) => onDimensionChange?.('width', v)}
            />
            <DimensionEditLabel
                position={[-hw - off, 0, z]}
                label="H"
                valueMm={H}
                onCommit={(v) => onDimensionChange?.('height', v)}
            />
            {hasReturns && (
                <DimensionEditLabel
                    position={[hw + off, 0, z]}
                    label="Return"
                    valueMm={returnDepthMm}
                    onCommit={(v) => onDimensionChange?.('return', v)}
                />
            )}
            <DimensionEditLabel
                position={[0, hh + off, z]}
                label="Gap"
                valueMm={shadowGapMm}
                onCommit={(v) => onDimensionChange?.('shadowGap', v)}
                addWhenZero={{ label: 'Shadow gap', defaultMm: 15 }}
            />
        </group>
    );
}

function Panel({
    params,
    development: dev,
    split,
    aperture,
    keyline,
    pushThroughKeyline,
    pushThroughIslands,
    autoFixings,
    manualFixings,
    cableHoles,
    reference,
    vinylPieces,
    acrylicPieces,
    solidPieces,
    standoffPieces,
    pushThroughPieces,
    placedPathsByIndex,
    pathGroupColors,
    pendingPaths,
    isEditingGroup,
    onPathToggle,
    fold,
    fixingMode,
    cableMode,
    onFixingClick,
    showOutlines = true,
    showStandoffLetters = true,
    showStandoffLocators = true,
    illuminationView = false,
    illumination,
    showDimensions = false,
    onDimensionChange,
}: {
    params: PanelParams;
    development: PanelDevelopment;
    split: PanelSplit;
    aperture: FlatPath[];
    keyline: FlatPath[];
    pushThroughKeyline: FlatPath[];
    pushThroughIslands: FlatPath[];
    autoFixings: FlatPath[];
    manualFixings: FlatPath[];
    cableHoles: FlatPath[];
    reference: FlatPath[];
    vinylPieces: MaterialPiece[];
    acrylicPieces: MaterialPiece[];
    solidPieces: MaterialPiece[];
    standoffPieces: StandoffPiece[];
    pushThroughPieces: PushThroughPiece[];
    placedPathsByIndex?: Array<FlatPath | null> | null;
    pathGroupColors?: Array<string | null> | null;
    pendingPaths?: Set<number>;
    isEditingGroup?: boolean;
    onPathToggle?: (i: number) => void;
    fold: number;
    fixingMode?: 'off' | 'place' | 'delete';
    cableMode?: 'off' | 'place' | 'delete';
    onFixingClick?: (p: [number, number]) => void;
    showOutlines?: boolean;
    showStandoffLetters?: boolean;
    showStandoffLocators?: boolean;
    illuminationView?: boolean;
    illumination?: PanelParams['illumination'];
    showDimensions?: boolean;
    onDimensionChange?: (
        field: 'width' | 'height' | 'return' | 'shadowGap',
        valueMm: number,
    ) => void;
}) {
    const W = dev.faceNominalWMm;
    const H = dev.faceNominalHMm;
    const T = params.materialThicknessMm;
    const D = params.returnDepthMm;
    const Sg = params.shadowGapMm;
    const r = params.returns;
    const lipEdges = params.shadowGapEdges ?? { top: true, bottom: true };
    // Shadow-gap lips only sit on top + bottom — left/right never get
    // one. Pass Sg per edge so Flap can render the lip exactly where the
    // operator turned it on.
    const sgFor = (edge: PanelEdge): number => {
        if (Sg <= 0) return 0;
        if (edge === 'top' && lipEdges.top) return Sg;
        if (edge === 'bottom' && lipEdges.bottom) return Sg;
        return 0;
    };
    const night = illuminationView;
    const rawPanelColor = params.panelColor ?? DEFAULT_PANEL_COLOR;
    // Surfaces darken in the illumination view; lit elements (the opal
    // backing in keyline mode) carry their own colour and stay bright.
    const panelColor = displayColor(rawPanelColor, night);
    // Keyline illumination — the opal push-through backing glows. Only
    // active when the design has it configured AND there's a backing to
    // light (push-through pieces present) AND we're in the dark view.
    const keylineIllum = illumination?.keyline;
    const keylineLit =
        night &&
        !!keylineIllum?.enabled &&
        pushThroughPieces.length > 0;
    const edges: PanelEdge[] = ['top', 'bottom', 'left', 'right'];
    // Either placement workflow active → canvas captures clicks +
    // shows the crosshair cursor. The parent dispatches to the right
    // handler based on which mode is set.
    const placementActive =
        (fixingMode ?? 'off') !== 'off' || (cableMode ?? 'off') !== 'off';

    const face = dev.segments.find((s) => s.role === 'face');

    // Cut-outs and locator studs treat every fixing the same — they're
    // all holes in the face / studs through it. Manual-vs-auto only
    // matters for the visual circle indicators on the letters.
    const fixings = useMemo(
        () => [...autoFixings, ...manualFixings],
        [autoFixings, manualFixings],
    );

    // Convert every "cut" path from flat-development coords (y-down) into
    // face-local mm × S (face centred at the world origin, y-up). Apertures,
    // stand-off fixings, and push-through keylines all become real holes
    // in the face geometry below — the push-through inserts visibly sit
    // INSIDE the keyline hole, so the hole has to actually be there in the
    // 3D face.
    const holesLocal = useMemo(() => {
        if (!face) return [];
        const toLocal = (p: [number, number]): [number, number] => [
            (p[0] - face.xMm - face.wMm / 2) * S,
            (face.yMm + face.hMm / 2 - p[1]) * S,
        ];
        const out: Array<Array<[number, number]>> = [];
        for (const cut of [
            ...aperture,
            ...pushThroughKeyline,
            ...fixings,
            ...cableHoles,
        ]) {
            const pts = cut.points.map(toLocal);
            if (pts.length >= 3) out.push(pts);
        }
        return out;
    }, [face, aperture, pushThroughKeyline, fixings, cableHoles]);

    // Cable-hole ring overlays — the holes themselves are cut in the
    // face above; a distinct purple ring just in front makes them
    // identifiable as cable routing (vs standoff fixings) and gives a
    // visible target in cable-delete mode.
    const cableRings = useMemo(() => {
        if (!face || cableHoles.length === 0) return null;
        const z = 1.2 * S;
        const pos: number[] = [];
        const segs = 28;
        for (const hole of cableHoles) {
            if (hole.points.length < 3) continue;
            let cx = 0;
            let cy = 0;
            for (const [x, y] of hole.points) {
                cx += x;
                cy += y;
            }
            cx /= hole.points.length;
            cy /= hole.points.length;
            let rad = 0;
            for (const [x, y] of hole.points)
                rad += Math.hypot(x - cx, y - cy);
            rad /= hole.points.length;
            const lx = (cx - face.xMm - face.wMm / 2) * S;
            const ly = (face.yMm + face.hMm / 2 - cy) * S;
            const rs = rad * S;
            for (let i = 0; i < segs; i++) {
                const t0 = (i / segs) * Math.PI * 2;
                const t1 = ((i + 1) / segs) * Math.PI * 2;
                pos.push(lx + Math.cos(t0) * rs, ly + Math.sin(t0) * rs, z);
                pos.push(lx + Math.cos(t1) * rs, ly + Math.sin(t1) * rs, z);
            }
        }
        if (pos.length === 0) return null;
        const g = new THREE.BufferGeometry();
        g.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(pos, 3),
        );
        return g;
    }, [face, cableHoles]);

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

    // Retained counter islands — panel metal kept inside each counter
    // (G / e / g), ringed by the keyline gap. Rendered as a paper-thin
    // panel-coloured shape at the face plane so it OCCLUDES the glowing
    // backing behind it; only the keyline gap around the island (out to
    // the acrylic counter edge) stays open and glows. Without this the
    // whole counter reads as a solid blob of light.
    const islandShapes = useMemo(() => {
        if (!face || pushThroughIslands.length === 0) return [];
        const toLocal = (q: [number, number]): [number, number] => [
            (q[0] - face.xMm - face.wMm / 2) * S,
            (face.yMm + face.hMm / 2 - q[1]) * S,
        ];
        const out: THREE.Shape[] = [];
        for (const island of pushThroughIslands) {
            if (!island.closed || island.points.length < 3) continue;
            const pts = island.points.map(toLocal);
            const shape = new THREE.Shape();
            shape.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++)
                shape.lineTo(pts[i][0], pts[i][1]);
            shape.closePath();
            out.push(shape);
        }
        return out;
    }, [face, pushThroughIslands]);

    return (
        <group>
            {/* Face — a single sheet with real cut-outs for every aperture /
                stand-off fixing. No back plate (there isn't one in
                production), and what you see here is what the cutter cuts. */}
            {/* Vinyl + acrylic pieces sit on the face front. They render
                in aperture mode only — VisualiserClient passes empty
                arrays in standoff mode. */}
            {face &&
                (vinylPieces.length > 0 ||
                    acrylicPieces.length > 0 ||
                    solidPieces.length > 0) && (
                    <MaterialPieces
                        face={face}
                        vinyl={vinylPieces}
                        acrylic={acrylicPieces}
                        solid={solidPieces}
                        outlines={showOutlines}
                        night={night}
                    />
                )}

            {/* Click-to-select hit targets — one transparent mesh per
                imported path. Outside edit mode they only contribute
                their group-membership outline; in edit mode they pick
                up clicks and hovers so the operator can select paths
                directly from the 3D view. */}
            {face && placedPathsByIndex && (
                <Path3DHitTargets
                    face={face}
                    placedPathsByIndex={placedPathsByIndex}
                    pathGroupColors={pathGroupColors ?? []}
                    pendingPaths={pendingPaths ?? new Set()}
                    onPathToggle={onPathToggle}
                />
            )}

            <FacePlane
                W={W}
                H={H}
                color={panelColor}
                holesLocal={holesLocal}
                outlines={showOutlines}
                cursorCrosshair={placementActive}
                onClick={
                    placementActive && face && onFixingClick
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

            {/* Push-through assembly. Two parts, rendered back-to-
                front in the z-stack:
                  1. Opal diffuser backing panel behind the face — the
                     surface that letter pieces (+ counters) mount on,
                     and the light-source diffuser visible through the
                     keyline shoulder.
                  2. The letter pieces themselves, extending forward
                     through the keyline hole. */}
            {face && pushThroughPieces.length > 0 && (
                <>
                    <PushThroughBacking
                        face={face}
                        pieces={pushThroughPieces}
                        materialThicknessMm={T}
                        outlines={showOutlines}
                        night={night}
                        lit={keylineLit}
                        glowColor={keylineIllum?.color ?? '#ffffff'}
                        glowIntensity={keylineIllum?.intensity ?? 1}
                    />
                    <PushThroughPieces
                        face={face}
                        pieces={pushThroughPieces}
                        materialThicknessMm={T}
                        outlines={showOutlines}
                        night={night}
                    />
                    {/* Retained metal counter islands — sit at the face
                        plane in the panel colour, occluding the glow so
                        only the keyline gap around them lights up. */}
                    {islandShapes.map((shape, i) => (
                        <mesh
                            key={`pt-island-${i}`}
                            position={[0, 0, 0.5 * S]}>
                            <shapeGeometry args={[shape, 48]} />
                            <meshBasicMaterial
                                color={panelColor}
                                side={THREE.DoubleSide}
                                polygonOffset
                                polygonOffsetFactor={1}
                                polygonOffsetUnits={1}
                            />
                            {showOutlines && (
                                <Edges color={EDGE_COLOR} lineWidth={1} />
                            )}
                        </mesh>
                    ))}
                </>
            )}

            {/* Stand-off pieces — each material group with material =
                'standoff' renders as its own batch of extruded letters
                mounted with studs at the group's own distance, thickness
                and colour. A sign can mix multiple standoff groups, and
                even mix standoff with vinyl / acrylic / cut on the same
                panel. */}
            {face && standoffPieces.length > 0 && (
                <>
                    {showStandoffLocators &&
                        standoffPieces.map((piece) => {
                            const pieceFixings = filterFixingsInside(
                                fixings,
                                piece.path,
                            );
                            return (
                                <StandoffLocators
                                    key={`loc-${piece.pathIndex}`}
                                    face={face}
                                    fixings={pieceFixings}
                                    fixingDiameterMm={
                                        params.fixingDiameterMm ?? 10
                                    }
                                    faceThicknessMm={T}
                                    standoffMm={piece.standoffDistanceMm}
                                    outlines={showOutlines}
                                    night={night}
                                />
                            );
                        })}
                    {showStandoffLetters &&
                        standoffPieces.map((piece) => {
                            const pieceAuto = filterFixingsInside(
                                autoFixings,
                                piece.path,
                            );
                            const pieceManual = filterFixingsInside(
                                manualFixings,
                                piece.path,
                            );
                            const refPaths = [
                                piece.path,
                                ...(piece.holes ?? []),
                            ];
                            return (
                                <StandoffLettering
                                    key={`letter-${piece.pathIndex}`}
                                    face={face}
                                    reference={refPaths}
                                    autoFixings={pieceAuto}
                                    manualFixings={pieceManual}
                                    thicknessMm={piece.thicknessMm}
                                    standoffMm={piece.standoffDistanceMm}
                                    faceThicknessMm={T}
                                    color={displayColor(piece.color, night)}
                                    outlines={showOutlines}
                                    fixingMode={fixingMode}
                                    onFixingClick={onFixingClick}
                                />
                            );
                        })}
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
                        Sg={sgFor(e)}
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
                        <meshBasicMaterial
                            color={displayColor('#009933', night)}
                        />
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
                        <lineBasicMaterial
                            color={displayColor('#9ca3af', night)}
                        />
                    </lineSegments>
                    <lineSegments geometry={overlay.kl}>
                        <lineBasicMaterial
                            color={displayColor('#00aabe', night)}
                        />
                    </lineSegments>
                </>
            )}

            {/* Cable-hole rings — distinct purple (red while deleting)
                so they read as cable routing, not standoff fixings. */}
            {cableRings && (
                <lineSegments geometry={cableRings}>
                    <lineBasicMaterial
                        color={cableMode === 'delete' ? '#dc2626' : '#7c3aed'}
                    />
                </lineSegments>
            )}

            {/* Editable dimension annotations in scene space — width
                below the face, height up the left, each propagating
                edits straight to the panel params. */}
            {showDimensions && (
                <Dimensions3D
                    W={W}
                    H={H}
                    returnDepthMm={D}
                    hasReturns={r.top || r.bottom || r.left || r.right}
                    shadowGapMm={Sg}
                    onDimensionChange={onDimensionChange}
                />
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
    pushThroughKeyline?: FlatPath[];
    pushThroughIslands?: FlatPath[];
    autoFixings?: FlatPath[];
    manualFixings?: FlatPath[];
    cableHoles?: FlatPath[];
    reference?: FlatPath[];
    vinylPieces?: MaterialPiece[];
    acrylicPieces?: MaterialPiece[];
    solidPieces?: MaterialPiece[];
    standoffPieces?: StandoffPiece[];
    pushThroughPieces?: PushThroughPiece[];
    placedPathsByIndex?: Array<FlatPath | null> | null;
    pathGroupColors?: Array<string | null> | null;
    pendingPaths?: Set<number>;
    isEditingGroup?: boolean;
    onPathToggle?: (i: number) => void;
    /** 0 = flat (unfolded in 3D), 1 = folded. Default folded. */
    fold?: number;
    /** Active fixing edit mode: 'place' drops, 'delete' removes. */
    fixingMode?: 'off' | 'place' | 'delete';
    /** Active cable-hole edit mode: 'place' drops, 'delete' removes. */
    cableMode?: 'off' | 'place' | 'delete';
    onFixingClick?: (p: [number, number]) => void;
    showOutlines?: boolean;
    showStandoffLetters?: boolean;
    showStandoffLocators?: boolean;
    /** Dark illumination preview — darkens the scene + lights configured glow. */
    illuminationView?: boolean;
    illumination?: PanelParams['illumination'];
    /** Editable in-scene dimension annotations (width / height / return / gap). */
    showDimensions?: boolean;
    onDimensionChange?: (
        field: 'width' | 'height' | 'return' | 'shadowGap',
        valueMm: number,
    ) => void;
}) {
    const fold = props.fold ?? 1;
    const autoFixings = props.autoFixings ?? [];
    const manualFixings = props.manualFixings ?? [];
    const cableHoles = props.cableHoles ?? [];
    const reference = props.reference ?? [];
    const vinylPieces = props.vinylPieces ?? [];
    const acrylicPieces = props.acrylicPieces ?? [];
    const solidPieces = props.solidPieces ?? [];
    const standoffPieces = props.standoffPieces ?? [];
    const pushThroughKeyline = props.pushThroughKeyline ?? [];
    const pushThroughIslands = props.pushThroughIslands ?? [];
    const pushThroughPieces = props.pushThroughPieces ?? [];
    const showOutlines = props.showOutlines ?? true;
    const showStandoffLetters = props.showStandoffLetters ?? true;
    const showStandoffLocators = props.showStandoffLocators ?? true;
    const illuminationView = props.illuminationView ?? false;

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
            <color
                attach="background"
                args={[illuminationView ? NIGHT_BG : '#ffffff']}
            />
            <CaptureBinder />
            <Panel
                {...props}
                autoFixings={autoFixings}
                manualFixings={manualFixings}
                cableHoles={cableHoles}
                reference={reference}
                vinylPieces={vinylPieces}
                acrylicPieces={acrylicPieces}
                solidPieces={solidPieces}
                standoffPieces={standoffPieces}
                pushThroughKeyline={pushThroughKeyline}
                pushThroughIslands={pushThroughIslands}
                pushThroughPieces={pushThroughPieces}
                placedPathsByIndex={props.placedPathsByIndex ?? null}
                pathGroupColors={props.pathGroupColors ?? null}
                pendingPaths={props.pendingPaths}
                isEditingGroup={props.isEditingGroup}
                onPathToggle={props.onPathToggle}
                fold={fold}
                fixingMode={props.fixingMode}
                cableMode={props.cableMode}
                onFixingClick={props.onFixingClick}
                showOutlines={showOutlines}
                showStandoffLetters={showStandoffLetters}
                showStandoffLocators={showStandoffLocators}
            />
            <OrbitControls enablePan makeDefault />
        </Canvas>
    );
}
