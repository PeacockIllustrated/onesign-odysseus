'use client';

import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import { Plus } from 'lucide-react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
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
    ExtraFacePiece,
    PanelRenderBundle,
} from '@/lib/visualiser/types';
import type { ResolvedMount } from '@/lib/visualiser/projecting';

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

/**
 * Smoothly fly the camera + orbit target to a goal whenever `focusKey` changes
 * (e.g. switching into the projecting-sign editor), then RELEASE so the
 * operator can orbit freely. We detect the key change during render with a
 * stored-prev ref (no setState-in-effect), arm the animation, and lerp in
 * useFrame until close enough.
 */
function CameraFocus({
    focusKey,
    goalPos,
    goalLook,
}: {
    focusKey: string;
    goalPos: [number, number, number];
    goalLook: [number, number, number];
}) {
    const { camera, controls } = useThree() as unknown as {
        camera: THREE.Camera;
        controls: { target: THREE.Vector3; update: () => void } | null;
    };
    const prevKey = useRef<string | null>(null);
    // A finite (frame-counted) tween so the animation ALWAYS terminates and
    // the renderer goes idle afterwards (a never-ending lerp would peg the
    // canvas). `frame` counts up to DURATION; <0 means inactive.
    const DURATION = 36;
    const frame = useRef(-1);
    const startPos = useRef(new THREE.Vector3());
    const startLook = useRef(new THREE.Vector3());
    const goalPosV = useRef(new THREE.Vector3());
    const goalLookV = useRef(new THREE.Vector3());
    // Arm on key change (first mount does not animate — keeps the initial view).
    useEffect(() => {
        if (prevKey.current !== null && prevKey.current !== focusKey) {
            startPos.current.copy(camera.position);
            startLook.current.copy(
                controls?.target ?? new THREE.Vector3(0, 0, 0),
            );
            goalPosV.current.set(goalPos[0], goalPos[1], goalPos[2]);
            goalLookV.current.set(goalLook[0], goalLook[1], goalLook[2]);
            frame.current = 0;
        }
        prevKey.current = focusKey;
        // eslint-disable-next-line react-hooks/exhaustive-deps -- arm only on focus change
    }, [focusKey]);
    useFrame(() => {
        if (frame.current < 0) return; // idle — leave manual orbit alone
        frame.current += 1;
        const t = Math.min(1, frame.current / DURATION);
        const e = 1 - Math.pow(1 - t, 3); // easeOutCubic
        // eslint-disable-next-line react-hooks/immutability -- imperative three.js camera tween
        camera.position.lerpVectors(startPos.current, goalPosV.current, e);
        if (controls?.target) {
            // eslint-disable-next-line react-hooks/immutability -- imperative three.js orbit tween
            controls.target.lerpVectors(startLook.current, goalLookV.current, e);
            controls.update();
        }
        if (t >= 1) frame.current = -1; // done — release to manual orbit
    });
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

// Illumination preview. The scene is UNLIT (everything is meshBasicMaterial,
// which ignores scene lights), so we can't add a real ambientLight — instead
// "ambient" is simulated by how much of each surface's albedo survives in the
// dark view (NIGHT_AMBIENT, a 0..1 multiply). Self-lit elements (the opal
// keyline backing) carry their own light via emissive meshStandardMaterial and
// are NOT dimmed, so they pop by contrast against the dimmed-but-visible
// surfaces.
//
// NIGHT_AMBIENT is the key dial: too low (the old 0.17) and panels/acrylics go
// black so you only see the glow; high enough (~0.5) and material colours still
// read at night while emissive illumination still clearly dominates. The
// background is lifted off pure black to a dusk blue-grey so dim surfaces
// separate from the void rather than disappearing into it. This is the base
// layer; per-illumination-type glows build on top of it.
const NIGHT_BG = '#0e131b'; // dusk blue-grey, not a pure-black void
const NIGHT_AMBIENT = 0.5; // fraction of albedo kept in the dark view

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

/** Display colour for a surface — dimmed to the night ambient in the dark view. */
function displayColor(hex: string, night: boolean): string {
    return night ? shadeHex(hex, NIGHT_AMBIENT) : hex;
}

/* ------------------------------------------------------------------ *
 * Exploded assembly view
 *
 * A single 0..1 `explodeT` fans the panel's layer stack apart along the
 * assembly axis (Z). Each layer group is wrapped in <ExplodeGroup> with a
 * signed `rank` — back layers negative, front layers positive — so its
 * target offset is `t * spacing * rank`: rank 0 (the face) never moves and
 * everything else separates symmetrically around it. A single <ExplodeDriver>
 * damps one shared scalar toward the target each frame (frame-rate
 * independent), so toggling explodeT 0↔1 eases automatically and scrubbing
 * the slider feels live. `prefers-reduced-motion` snaps instead of damping.
 * ------------------------------------------------------------------ */
const ExplodeCtx = createContext<{ current: number } | null>(null);

function ExplodeDriver({
    target,
    reduced,
    tRef,
}: {
    target: number;
    reduced: boolean;
    tRef: { current: number };
}) {
    useFrame((_, dt) => {
        if (reduced) {
            tRef.current = target;
            return;
        }
        // Critically-damped approach — lambda ~7 settles in ~0.4s, reading as
        // a premium ease-out rather than a linear slide. Snap once within
        // epsilon so the scene can go idle instead of micro-easing forever.
        const next = THREE.MathUtils.damp(tRef.current, target, 7, dt);
        tRef.current = Math.abs(next - target) < 0.0005 ? target : next;
    });
    return null;
}

/** Provide a damped explode scalar to descendant <ExplodeGroup>s + Flaps. */
function ExplodeProvider({
    target,
    reduced,
    children,
}: {
    target: number;
    reduced: boolean;
    children: ReactNode;
}) {
    const tRef = useRef(target);
    return (
        <ExplodeCtx.Provider value={tRef}>
            <ExplodeDriver target={target} reduced={reduced} tRef={tRef} />
            {children}
        </ExplodeCtx.Provider>
    );
}

/**
 * Wrap a layer group so it slides along Z by `t * spacing * rank` when the
 * assembly explodes. Outside an <ExplodeProvider> (e.g. the projecting
 * composite) it's an inert pass-through group resting at its home position.
 */
function ExplodeGroup({
    rank,
    spacing,
    children,
}: {
    rank: number;
    spacing: number;
    children: ReactNode;
}) {
    const tRef = useContext(ExplodeCtx);
    const ref = useRef<THREE.Group>(null);
    useFrame(() => {
        if (ref.current) {
            ref.current.position.z = (tRef?.current ?? 0) * spacing * rank;
        }
    });
    return <group ref={ref}>{children}</group>;
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
    faceShape = 'square',
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
    /** Outline of the face — a rectangle (default) or an ellipse/disc. */
    faceShape?: 'square' | 'circle';
}) {
    const shape = useMemo(() => {
        const s = new THREE.Shape();
        const hw = (W * S) / 2;
        const hh = (H * S) / 2;
        if (faceShape === 'circle') {
            // Ellipse fitting W×H (a true circle when W === H). 64 segments
            // so the disc edge reads smooth.
            s.absellipse(0, 0, hw, hh, 0, Math.PI * 2, false, 0);
        } else {
            s.moveTo(-hw, -hh);
            s.lineTo(hw, -hh);
            s.lineTo(hw, hh);
            s.lineTo(-hw, hh);
            s.lineTo(-hw, -hh);
        }
        for (const pts of holesLocal) {
            if (pts.length < 3) continue;
            const h = new THREE.Path();
            h.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++) h.lineTo(pts[i][0], pts[i][1]);
            h.closePath();
            s.holes.push(h);
        }
        return s;
    }, [W, H, holesLocal, faceShape]);

    return (
        <mesh
            onClick={
                onClick
                    ? (e) => {
                          e.stopPropagation();
                          // Convert the world hit point into the face's LOCAL
                          // frame so placement is correct even when the panel is
                          // mounted rotated (the in-situ projecting sign).
                          const local = e.object.worldToLocal(e.point.clone());
                          onClick(local.x, local.y);
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

    // Exploded-view unfold: as the assembly explodes (t→1) the returns hinge
    // back toward flat, so the tray visibly opens out — a real "teardown"
    // read. Driven per-frame off the shared explode scalar; with no provider
    // (t=0) the angle equals the static folded rotation, so non-exploded
    // scenes are untouched. The sign/axis per edge mirror the static tuples
    // below (return + its shadow-gap lip rotate on the same axis).
    const tRef = useContext(ExplodeCtx);
    const groupRef = useRef<THREE.Group>(null);
    const lipRef = useRef<THREE.Group>(null);
    const rotAxis: 'x' | 'y' = edge === 'top' || edge === 'bottom' ? 'x' : 'y';
    const returnSign = edge === 'bottom' || edge === 'right' ? 1 : -1;
    const lipSign = edge === 'top' || edge === 'right' ? 1 : -1;
    useFrame(() => {
        const t = tRef?.current ?? 0;
        const ang = fold * (1 - t) * HALF_PI;
        if (groupRef.current) {
            groupRef.current.rotation.set(
                rotAxis === 'x' ? returnSign * ang : 0,
                rotAxis === 'y' ? returnSign * ang : 0,
                0,
            );
        }
        if (lipRef.current) {
            lipRef.current.rotation.set(
                rotAxis === 'x' ? lipSign * ang : 0,
                rotAxis === 'y' ? lipSign * ang : 0,
                0,
            );
        }
    });

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
        <group ref={groupRef} position={groupPos} rotation={groupRot}>
            <PanelPlane
                args={planeArgs}
                position={planePos}
                color={color}
                outlines={outlines}
            />
            {hasLip && (
                <group ref={lipRef} position={lipPos} rotation={lipRot}>
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
    showFixings = true,
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
    /** Show the fixing-position rings on the letter face (the stand-off
     *  fixing highlighters). Stays on while placing/deleting fixings so
     *  the operator always has a target. */
    showFixings?: boolean;
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
        // Sit a hair behind the letter's BACK face (local z = 0). The studs
        // attach to the back, so the fixing rings belong there — not clipping
        // through to the visible front surface of the stood-off letter.
        const z = -0.3 * S;
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
            {autoStrokes && (showFixings || fixingActive) && (
                // Auto-placed fixings — picked by the algorithm. Painted
                // in a colour that contrasts with the letter, so the
                // installer reads them clearly. Hidden via the "Fixings"
                // display toggle, but forced on while placing/deleting.
                <lineSegments geometry={autoStrokes}>
                    <lineBasicMaterial color={contrastTo(color)} />
                </lineSegments>
            )}
            {manualStrokes && (showFixings || fixingActive) && (
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
 * Fixing-hole positions marked on the panel FACE — a bright ring + centre dot
 * at each stud location, sitting just proud of the front so the installer can
 * see where the fixings land from the face side. Annotation-only (depth test
 * off so it reads over the sign); toggled from the Display tray, default off.
 */
function FaceFixingMarkers({
    face,
    fixings,
    diameterMm,
    night,
}: {
    face: { xMm: number; yMm: number; wMm: number; hMm: number };
    fixings: FlatPath[];
    diameterMm: number;
    night?: boolean;
}) {
    if (fixings.length === 0) return null;
    const color = night ? '#ffd166' : '#e11d48';
    const r = (diameterMm / 2) * S;
    const z = 0.8 * S; // just proud of the panel front (z = 0)
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
                    <group key={i} position={[lx, ly, z]}>
                        <mesh>
                            <ringGeometry args={[r * 0.78, r, 28]} />
                            <meshBasicMaterial
                                color={color}
                                side={THREE.DoubleSide}
                                transparent
                                opacity={0.95}
                                depthTest={false}
                            />
                        </mesh>
                        <mesh>
                            <circleGeometry args={[r * 0.22, 16]} />
                            <meshBasicMaterial
                                color={color}
                                side={THREE.DoubleSide}
                                depthTest={false}
                            />
                        </mesh>
                    </group>
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
    vinylPrintDataUrl,
    outlines = true,
    night = false,
}: {
    face: { xMm: number; yMm: number; wMm: number; hMm: number };
    vinyl: MaterialPiece[];
    acrylic: MaterialPiece[];
    solid: MaterialPiece[];
    /** Full-colour vinyl print — a face-sized PNG (colours + gradients) masked
     *  to the printed-vinyl shapes. Painted as one plane over the face. */
    vinylPrintDataUrl?: string | null;
    outlines?: boolean;
    night?: boolean;
}) {
    // Printed full-colour vinyl is shown as ONE textured plane the size of the
    // face (the raster IS the face, so default plane UVs map 1:1 — no UV math).
    // Until the async raster is ready, those pieces fall back to flat meshes.
    const vinylTex = useImageTexture(vinylPrintDataUrl);
    const showPrint = !!vinylTex && vinyl.some((p) => p.fullColor);
    const flatVinyl = showPrint ? vinyl.filter((p) => !p.fullColor) : vinyl;
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

            {/* Printed full-colour vinyl — one masked image plane ~1 mm proud
                of the face, showing the artwork's true colours + gradients.
                Transparent everywhere except the printed vinyl shapes. */}
            {showPrint && vinylTex && (
                <mesh position={[0, 0, 1 * S]}>
                    <planeGeometry args={[face.wMm * S, face.hMm * S]} />
                    <meshBasicMaterial
                        map={vinylTex}
                        transparent
                        opacity={night ? 0.6 : 1}
                        depthWrite={false}
                        side={THREE.DoubleSide}
                        polygonOffset
                        polygonOffsetFactor={1}
                        polygonOffsetUnits={1}
                    />
                </mesh>
            )}

            {/* Solid-colour cut vinyl: paper-thin flat fill ~1 mm in front of
                the face (avoids z-fighting with the panel surface). */}
            {flatVinyl.map((piece, i) => (
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
 * Extra metal faces (brass / …) laminated on the FRONT of letters. Same shape
 * as the underlying letter (outer outline + counters as holes), cut from sheet
 * metal. It sits at the letter's front (`frontZMm`: push-through letters stand
 * proud of the panel; flat cut/backlit sit on the face) and extrudes proud by
 * its sheet thickness. Flat `meshBasicMaterial` like the other pieces — the
 * scene is unlit (a metal shader would render black), so the metal reads from
 * its colour.
 */
function ExtraFacePieces({
    face,
    pieces,
    outlines = true,
    night = false,
}: {
    face: { xMm: number; yMm: number; wMm: number; hMm: number };
    pieces: ExtraFacePiece[];
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
                // Back of the face = the letter's front; extrude proud by the
                // sheet thickness.
                const backZ = piece.frontZMm * S;
                const depthScene = Math.max(0.1, piece.thicknessMm) * S;
                return (
                    <mesh
                        key={`face-${piece.pathIndex}-${pi}`}
                        position={[0, 0, backZ]}>
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
 * Backlit apertures — the cut shape is backed by an opal diffuser lit from
 * behind, so the solid cut glows. Each piece is rendered as a flat shape
 * (with its counters as holes) sitting just behind the face: in daylight it's
 * plain opal seen through the cut; in the dark/illumination view it glows in
 * the element's own colour + intensity (emissive, unaffected by scene
 * darkening). The physical opal back panel is the same construction as the
 * keyline-illumination backing — see PushThroughBacking — and is emitted on
 * the production PDF; here the lit shape itself conveys the effect.
 */
function BacklightGlow({
    face,
    pieces,
    night = false,
}: {
    face: { xMm: number; yMm: number; wMm: number; hMm: number };
    pieces: MaterialPiece[];
    night?: boolean;
}) {
    const toLocal = (q: [number, number]): [number, number] => [
        (q[0] - face.xMm - face.wMm / 2) * S,
        (face.yMm + face.hMm / 2 - q[1]) * S,
    ];
    const shapes = useMemo(() => {
        return pieces
            .map((piece) => {
                const outer = piece.path.points.map(toLocal);
                if (outer.length < 3) return null;
                const shape = new THREE.Shape();
                shape.moveTo(outer[0][0], outer[0][1]);
                for (let i = 1; i < outer.length; i++)
                    shape.lineTo(outer[i][0], outer[i][1]);
                if (piece.path.closed) shape.closePath();
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
                return {
                    shape,
                    color: piece.color,
                    intensity: piece.glowIntensity ?? 1,
                    key: piece.pathIndex,
                };
            })
            .filter((s): s is NonNullable<typeof s> => s !== null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pieces, face]);

    return (
        <group>
            {shapes.map((s, i) => (
                // ~1 mm behind the face front, so it reads through the cut.
                <mesh key={`bl-${s.key}-${i}`} position={[0, 0, -1 * S]}>
                    <shapeGeometry args={[s.shape, 48]} />
                    {night ? (
                        <meshStandardMaterial
                            color="#000000"
                            emissive={s.color}
                            emissiveIntensity={Math.max(0, s.intensity)}
                            toneMapped={false}
                            side={THREE.DoubleSide}
                        />
                    ) : (
                        <meshBasicMaterial
                            color="#f5f5f0"
                            side={THREE.DoubleSide}
                        />
                    )}
                </mesh>
            ))}
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
// Padding around each backing sheet (mm). Doubles as the merge tolerance
// when splitting: pieces whose padded sheets would touch/overlap regroup
// onto one sheet, so genuinely-close pieces don't get pointlessly separate
// panels while isolated pieces (across a stood-off gap) split apart.
const BACKING_PAD_MM = 12;

function PushThroughBacking({
    face,
    pieces,
    backlightPieces = [],
    materialThicknessMm,
    splitToSave = false,
    outlines = true,
    night = false,
    lit = false,
    glowColor = '#ffffff',
    glowIntensity = 1,
}: {
    face: { xMm: number; yMm: number; wMm: number; hMm: number };
    pieces: PushThroughPiece[];
    /** Backlit apertures share the same physical opal sheet — included in
     *  the panel's span so one sheet covers both keyline + backlit work. */
    backlightPieces?: MaterialPiece[];
    /**
     * Face panel thickness — backing sits BEHIND the face panel back
     * (z = -materialThicknessMm), with no overlap. Without this the
     * translucent backing fights the face plane and produces a
     * hatched z-fighting artifact across both surfaces.
     */
    materialThicknessMm: number;
    /**
     * Save material: emit a separate sheet per cluster of pieces instead of
     * one sheet spanning them all. Close pieces regroup onto one sheet; the
     * gaps between far-apart pieces carry no opal.
     */
    splitToSave?: boolean;
    outlines?: boolean;
    /** Dark illumination view — darken the unlit opal. */
    night?: boolean;
    /** Keyline illumination on — the opal glows (emissive). */
    lit?: boolean;
    glowColor?: string;
    glowIntensity?: number;
}) {
    const layouts = useMemo(() => {
        // Every piece glued to the opal — keyline push-through inserts AND
        // backlit apertures share the same physical sheet(s).
        const spanning: Array<{ path: FlatPath; holes?: FlatPath[] }> = [
            ...pieces,
            ...backlightPieces,
        ];
        if (spanning.length === 0) return [];

        type Box = { minX: number; minY: number; maxX: number; maxY: number };
        const boxes: Box[] = spanning.map((piece) => {
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            const eat = (pts: Array<[number, number]>) => {
                for (const [x, y] of pts) {
                    if (x < minX) minX = x;
                    if (y < minY) minY = y;
                    if (x > maxX) maxX = x;
                    if (y > maxY) maxY = y;
                }
            };
            eat(piece.path.points);
            for (const hole of piece.holes ?? []) eat(hole.points);
            return { minX, minY, maxX, maxY };
        });

        // Union-find: one cluster when not saving material; otherwise merge
        // only pieces whose padded sheets would overlap (close together).
        const n = boxes.length;
        const parent = Array.from({ length: n }, (_, i) => i);
        const find = (a: number): number => {
            while (parent[a] !== a) {
                parent[a] = parent[parent[a]];
                a = parent[a];
            }
            return a;
        };
        const unite = (a: number, b: number) => {
            const ra = find(a);
            const rb = find(b);
            if (ra !== rb) parent[ra] = rb;
        };
        const p = BACKING_PAD_MM;
        if (splitToSave) {
            for (let i = 0; i < n; i++) {
                for (let j = i + 1; j < n; j++) {
                    const a = boxes[i];
                    const b = boxes[j];
                    const nearX =
                        a.minX - p <= b.maxX + p && b.minX - p <= a.maxX + p;
                    const nearY =
                        a.minY - p <= b.maxY + p && b.minY - p <= a.maxY + p;
                    if (nearX && nearY) unite(i, j);
                }
            }
        } else {
            for (let i = 1; i < n; i++) unite(0, i);
        }

        const clusters = new Map<number, Box>();
        for (let i = 0; i < n; i++) {
            const r = find(i);
            const b = boxes[i];
            const c = clusters.get(r);
            if (!c) clusters.set(r, { ...b });
            else {
                c.minX = Math.min(c.minX, b.minX);
                c.minY = Math.min(c.minY, b.minY);
                c.maxX = Math.max(c.maxX, b.maxX);
                c.maxY = Math.max(c.maxY, b.maxY);
            }
        }
        return [...clusters.values()].map((c) => ({
            wMm: c.maxX - c.minX + p * 2,
            hMm: c.maxY - c.minY + p * 2,
            cxMm: (c.minX + c.maxX) / 2,
            cyMm: (c.minY + c.maxY) / 2,
        }));
    }, [pieces, backlightPieces, splitToSave]);

    if (layouts.length === 0) return null;

    const BACKING_THICKNESS_MM = 5;
    // Backing front face sits flush against the back of the face panel
    // (z = -materialThicknessMm). Centre Z is half the backing thickness
    // further back.
    const cz = (-materialThicknessMm - BACKING_THICKNESS_MM / 2) * S;

    return (
        <group>
            {layouts.map((layout, idx) => {
                const cx = (layout.cxMm - face.xMm - face.wMm / 2) * S;
                const cy = (face.yMm + face.hMm / 2 - layout.cyMm) * S;
                const boxArgs: [number, number, number] = [
                    layout.wMm * S,
                    layout.hMm * S,
                    BACKING_THICKNESS_MM * S,
                ];
                // Lit: opal glows. meshStandardMaterial renders its emissive
                // colour regardless of scene lighting, so a black base +
                // emissive reads as a self-lit diffuser; the halo falls out of
                // the keyline gap in the dark face panel. toneMapped off so a
                // bright colour isn't desaturated.
                return lit ? (
                    <mesh key={idx} position={[cx, cy, cz]}>
                        <boxGeometry args={boxArgs} />
                        <meshStandardMaterial
                            color="#000000"
                            emissive={glowColor}
                            emissiveIntensity={Math.max(0, glowIntensity)}
                            toneMapped={false}
                        />
                    </mesh>
                ) : (
                    <mesh key={idx} position={[cx, cy, cz]}>
                        <boxGeometry args={boxArgs} />
                        <meshBasicMaterial
                            // Unlit opal: a dim sheet in the dark view, the
                            // usual translucent opal in daylight.
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
            })}
        </group>
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
                <div className="flex items-center gap-1 rounded-full bg-white px-1.5 py-0.5 shadow ring-1 ring-[var(--accent)]/10">
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
                    className="flex items-center gap-1 whitespace-nowrap rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium tabular-nums text-neutral-700 shadow-sm ring-1 ring-[var(--accent)]/5 hover:bg-white hover:ring-[var(--accent)]/20"
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
    backlightPieces,
    extraFacePieces = [],
    vinylPrintDataUrl,
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
    showFaceFixings = false,
    annotations = true,
    illuminationView = false,
    illumination,
    showDimensions = false,
    onDimensionChange,
    enclosed = false,
    faceShape = 'square',
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
    /** Backlit apertures — glow through the cut in the illumination view. */
    backlightPieces?: MaterialPiece[];
    /** Extra metal faces (brass/…) laminated on the front of letters. */
    extraFacePieces?: ExtraFacePiece[];
    /** Full-colour vinyl print PNG (face-sized, masked to the vinyl shapes). */
    vinylPrintDataUrl?: string | null;
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
    showFaceFixings?: boolean;
    /**
     * Master switch for the non-physical overlay marks — the keyline/reference
     * register lines, cable-hole rings and seam markers. Off (the approval
     * pack's "Annotation" toggle) leaves only how the sign actually looks
     * installed. Edges + fixing markers are gated upstream via showOutlines /
     * showStandoffLocators, which the caller turns off in step with this.
     */
    annotations?: boolean;
    illuminationView?: boolean;
    illumination?: PanelParams['illumination'];
    showDimensions?: boolean;
    onDimensionChange?: (
        field: 'width' | 'height' | 'return' | 'shadowGap',
        valueMm: number,
    ) => void;
    /**
     * Close the back of the tray with a panel at z = -returnDepth, so the
     * sign reads as a fully enclosed box (used for projecting signs, which
     * are sealed boxes rather than open-backed fascia trays).
     */
    enclosed?: boolean;
    /**
     * Face/box silhouette. 'square' = the rectangular folded tray (fascia +
     * square projecting signs); 'circle' = a round disc — elliptical face +
     * back and a cylindrical rim instead of the four flat returns.
     */
    faceShape?: 'square' | 'circle';
}) {
    const W = dev.faceNominalWMm;
    const H = dev.faceNominalHMm;
    const T = params.materialThicknessMm;
    const D = params.returnDepthMm;
    const Sg = params.shadowGapMm;
    // Per-rank gap for the exploded view, scaled to the sign so the
    // separation always reads at the framed camera distance: ~12% of the
    // largest face dimension, clamped so tiny panels still separate and huge
    // ones don't fly off-screen. Ranks span -2..+2, so the full spread is ~4×.
    const explodeSpacing = Math.min(
        Math.max(Math.max(W, H) * S * 0.12, 0.4),
        2.4,
    );
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
    // Backlit apertures light their shared opal sheet whenever the dark view
    // is on — they're always-lit by definition (no separate enable). The one
    // shared backing glows if EITHER illumination source is active; when both
    // run it takes the keyline colour and the per-aperture BacklightGlow paints
    // each backlit cut its own colour on top.
    const backlitLit = night && (backlightPieces?.length ?? 0) > 0;
    const backingLit = keylineLit || backlitLit;
    const backingGlowColor = keylineLit
        ? (keylineIllum?.color ?? '#ffffff')
        : '#fff4e0';
    const backingGlowIntensity = keylineLit
        ? (keylineIllum?.intensity ?? 1)
        : 1;
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

    // Retained counters of backlit compounds (the eye of an 'e', the bowl of
    // a 'B'). The face is aperture-cut to the outer outline only, so without
    // these the lit sheet would shine straight through the counter; here they
    // sit at the face plane in the panel colour and read as solid sign.
    const backlightIslandShapes = useMemo(() => {
        if (!face || (backlightPieces?.length ?? 0) === 0) return [];
        const toLocal = (q: [number, number]): [number, number] => [
            (q[0] - face.xMm - face.wMm / 2) * S,
            (face.yMm + face.hMm / 2 - q[1]) * S,
        ];
        const out: THREE.Shape[] = [];
        for (const piece of backlightPieces ?? []) {
            for (const hole of piece.holes ?? []) {
                if (!hole.closed || hole.points.length < 3) continue;
                const pts = hole.points.map(toLocal);
                const shape = new THREE.Shape();
                shape.moveTo(pts[0][0], pts[0][1]);
                for (let i = 1; i < pts.length; i++)
                    shape.lineTo(pts[i][0], pts[i][1]);
                shape.closePath();
                out.push(shape);
            }
        }
        return out;
    }, [face, backlightPieces]);

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
                    <ExplodeGroup rank={1} spacing={explodeSpacing}>
                        <MaterialPieces
                            face={face}
                            vinyl={vinylPieces}
                            acrylic={acrylicPieces}
                            solid={solidPieces}
                            vinylPrintDataUrl={vinylPrintDataUrl}
                            outlines={showOutlines}
                            night={night}
                        />
                    </ExplodeGroup>
                )}

            {/* Backlit apertures glow through the cut (opal behind, lit). */}
            {face && (backlightPieces?.length ?? 0) > 0 && (
                <ExplodeGroup rank={-1} spacing={explodeSpacing}>
                    <BacklightGlow
                        face={face}
                        pieces={backlightPieces ?? []}
                        night={night}
                    />
                </ExplodeGroup>
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
                faceShape={faceShape}
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

            {/* Closed back — seals the tray into a box (projecting signs). The
                returns fold back to z = -D, so the back panel sits there.
                Circle signs get a matching disc back. */}
            {enclosed &&
                (faceShape === 'circle' ? (
                    <mesh
                        position={[0, 0, -D * S]}
                        scale={[1, W > 0 ? H / W : 1, 1]}
                    >
                        <circleGeometry args={[(W * S) / 2, 64]} />
                        <meshBasicMaterial
                            color={panelColor}
                            side={THREE.DoubleSide}
                        />
                        {showOutlines && (
                            <Edges color={EDGE_COLOR} lineWidth={1} />
                        )}
                    </mesh>
                ) : (
                    <mesh position={[0, 0, -D * S]}>
                        <planeGeometry args={[W * S, H * S]} />
                        <meshBasicMaterial
                            color={panelColor}
                            side={THREE.DoubleSide}
                        />
                        {showOutlines && (
                            <Edges color={EDGE_COLOR} lineWidth={1} />
                        )}
                    </mesh>
                ))}

            {/* Shared opal diffuser backing — ONE sheet behind the face that
                spans every piece glued to it: keyline push-through inserts AND
                backlit apertures. It's the lit diffuser visible through both
                the keyline shoulder and the backlit cut, so when a sign mixes
                the two they sensibly share the same panel. Glows in the dark
                view when keyline illumination is on or backlit pieces exist.
                Explodes back as the deepest layer (rank -2). */}
            {face &&
                (pushThroughPieces.length > 0 ||
                    (backlightPieces?.length ?? 0) > 0) && (
                    <ExplodeGroup rank={-2} spacing={explodeSpacing}>
                        <PushThroughBacking
                            face={face}
                            pieces={pushThroughPieces}
                            backlightPieces={backlightPieces ?? []}
                            materialThicknessMm={T}
                            splitToSave={params.splitBacking ?? false}
                            outlines={showOutlines}
                            night={night}
                            lit={backingLit}
                            glowColor={backingGlowColor}
                            glowIntensity={backingGlowIntensity}
                        />
                    </ExplodeGroup>
                )}

            {/* Push-through inserts (letters pressed through the keyline hole)
                plus their retained counter islands. Move with the backing as
                one behind-the-face sub-assembly (rank -2). */}
            {face && pushThroughPieces.length > 0 && (
                <ExplodeGroup rank={-2} spacing={explodeSpacing}>
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
                </ExplodeGroup>
            )}

            {/* Extra metal faces (brass/…) laminated on the front of letters —
                sit at each piece's own front-Z, so they ride on the push-through
                opal or the flat backlit cut they face. */}
            {face && extraFacePieces.length > 0 && (
                <ExtraFacePieces
                    face={face}
                    pieces={extraFacePieces}
                    outlines={showOutlines}
                    night={night}
                />
            )}

            {/* Backlit retained counter islands — the inner counters stay on
                the sign (panel-coloured) glued to the lit sheet, occluding the
                glow so only the aperture itself lights up. No keyline offset,
                no re-inserted acrylic — the cut artwork sits straight on the
                opal, exactly like the keyline halo minus the shoulder. */}
            {face && backlightIslandShapes.length > 0 && (
                <>
                    {backlightIslandShapes.map((shape, i) => (
                        <mesh
                            key={`bl-island-${i}`}
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
                    {/* Studs explode to their own intermediate rank (1), the
                        letters to rank 2 — so the physical fixing separates
                        from BOTH the panel and the letters and reads as its own
                        layer in the exploded view. Assembled (explodeT = 0) is
                        unchanged: each ExplodeGroup is identity at t = 0. */}
                    <ExplodeGroup rank={1} spacing={explodeSpacing}>
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
                    </ExplodeGroup>
                    <ExplodeGroup rank={2} spacing={explodeSpacing}>
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
                                        showFixings={showStandoffLocators}
                                        fixingMode={fixingMode}
                                        onFixingClick={onFixingClick}
                                    />
                                );
                            })}
                    </ExplodeGroup>
                </>
            )}

            {/* Fixing-hole positions marked on the panel FACE so an installer
                can see where the studs land from the front. Pinned to the face
                (deliberately NOT inside an ExplodeGroup), annotation-only,
                toggled from the Display tray. */}
            {showFaceFixings && face && (
                <FaceFixingMarkers
                    face={face}
                    fixings={[...autoFixings, ...manualFixings]}
                    diameterMm={params.fixingDiameterMm ?? 10}
                    night={night}
                />
            )}

            {/* Returns. Square signs fold four flat flaps; a circle sign has a
                continuous cylindrical rim (the box depth) instead. */}
            {faceShape === 'circle'
                ? D > 0 && (
                      <mesh
                          position={[0, 0, (-D * S) / 2]}
                          rotation={[HALF_PI, 0, 0]}
                          scale={[1, 1, W > 0 ? H / W : 1]}
                      >
                          {/* Open-ended cylinder: axis along Z (depth) after the
                              X-rotation; radius = W/2, scaled to H/W on the
                              vertical so it matches an elliptical face. */}
                          <cylinderGeometry
                              args={[(W * S) / 2, (W * S) / 2, D * S, 64, 1, true]}
                          />
                          <meshBasicMaterial
                              color={panelColor}
                              side={THREE.DoubleSide}
                          />
                          {showOutlines && (
                              <Edges color={EDGE_COLOR} lineWidth={1} />
                          )}
                      </mesh>
                  )
                : edges.map((e) =>
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
            {annotations &&
                split.wasSplit &&
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
                Apertures and fixings are real holes in the face above.
                Pure annotation, so hidden when annotations are off. */}
            {annotations && overlay && (
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
                so they read as cable routing, not standoff fixings.
                Annotation overlay, hidden when annotations are off. */}
            {annotations && cableRings && (
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


/**
 * The projecting (square) sign rendered as a REAL folded tray — the same
 * construction as the fascia (face + returns), just small — mounted on the
 * fascia FACE and rotated so it projects straight out perpendicular toward the
 * street (its width = the protrusion, its returns = the box depth). This is the
 * "sits like that, not flat" arrangement from the shopfront top-view. The
 * fascia is at the origin (face +Z); this is positioned at the mount point.
 */
/** Rasterise an SVG string to a texture (memoised, disposed on change). */
function useSvgTexture(svg: string | null | undefined): THREE.Texture | null {
    const tex = useMemo(() => {
        if (!svg) return null;
        const url =
            'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        const t = new THREE.TextureLoader().load(url);
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
    }, [svg]);
    useEffect(() => () => tex?.dispose(), [tex]);
    return tex;
}

/** Load a ready image data URL (e.g. the printed-vinyl PNG) as a texture
 *  (memoised, disposed on change). Unlike useSvgTexture the URL is used
 *  as-is — no SVG wrapping. */
function useImageTexture(
    url: string | null | undefined,
): THREE.Texture | null {
    const tex = useMemo(() => {
        if (!url) return null;
        const t = new THREE.TextureLoader().load(url);
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
    }, [url]);
    useEffect(() => () => tex?.dispose(), [tex]);
    return tex;
}

function ProjectingMounted({
    fascia,
    params,
    development,
    split,
    mount,
    night,
    showOutlines,
    artworkSvg,
    backBundle,
    faceShape = 'square',
    children,
}: {
    fascia: PanelParams;
    params: PanelParams;
    development: PanelDevelopment;
    split: PanelSplit;
    mount: ResolvedMount;
    night: boolean;
    showOutlines: boolean;
    artworkSvg?: string | null;
    faceShape?: 'square' | 'circle';
    /**
     * The sign's full design, used to render a MIRRORED copy on the back face
     * when the sign is double-sided — so the design reads from both sides. The
     * front (children) is rendered open-backed (enclosed=false) so the two
     * trays meet as one closed box.
     */
    backBundle?: PanelRenderBundle | null;
    /**
     * When provided (the sign is the one being edited), render this full Panel
     * IN PLACE instead of the lightweight tray+texture — so editing never
     * repositions the sign; it stays mounted in situ and we only shift focus.
     */
    children?: React.ReactNode;
}) {
    const Wf = fascia.panelWidthMm * S;
    const Hf = fascia.panelHeightMm * S;
    const Wp = params.panelWidthMm * S; // protrusion off the face (+Z)
    const Hp = params.panelHeightMm * S; // vertical
    const ax = -Wf / 2 + mount.offsetXMm * S; // attach X on the face
    const ayTop = Hf / 2 - mount.offsetYMm * S; // sign top
    const artworkTex = useSvgTexture(artworkSvg);
    const Dp = Math.max(params.returnDepthMm, 25) * S; // box depth
    const artW = development.faceNominalWMm * S;
    const artH = development.faceNominalHMm * S;

    return (
        // Rotate -90° about Y: the tray's width runs out along +Z (protrusion),
        // its face reads from the side (−X), returns fold back toward the wall.
        // Positioned only by the mount (Position-across / Height controls) — no
        // drag, so it never moves unless you change those values.
        <group
            rotation={[0, -HALF_PI, 0]}
            position={[ax, ayTop - Hp / 2, mount.offsetZMm * S + Wp / 2]}
        >
            {children ?? (
                <>
                    <Panel
                        params={params}
                        development={development}
                        split={split}
                        fold={1}
                        aperture={[]}
                        keyline={[]}
                        pushThroughKeyline={[]}
                        pushThroughIslands={[]}
                        autoFixings={[]}
                        manualFixings={[]}
                        cableHoles={[]}
                        reference={[]}
                        vinylPieces={[]}
                        acrylicPieces={[]}
                        solidPieces={[]}
                        standoffPieces={[]}
                        pushThroughPieces={[]}
                        placedPathsByIndex={null}
                        pathGroupColors={null}
                        showOutlines={showOutlines}
                        showStandoffLetters={false}
                        showStandoffLocators={false}
                        illuminationView={night}
                        illumination={params.illumination}
                        showDimensions={false}
                        enclosed
                        faceShape={faceShape}
                    />
                    {/* The projecting sign's design, shown on its face(s) so it
                        reads in the composite while you edit the main panel. */}
                    {artworkTex && (
                        <>
                            <mesh position={[0, 0, 0.8 * S]}>
                                <planeGeometry args={[artW, artH]} />
                                <meshBasicMaterial
                                    map={artworkTex}
                                    transparent
                                    opacity={night ? 0.6 : 1}
                                />
                            </mesh>
                            {mount.doubleSided && (
                                <mesh
                                    position={[0, 0, -Dp - 0.8 * S]}
                                    rotation={[0, Math.PI, 0]}
                                >
                                    <planeGeometry args={[artW, artH]} />
                                    <meshBasicMaterial
                                        map={artworkTex}
                                        transparent
                                        opacity={night ? 0.6 : 1}
                                    />
                                </mesh>
                            )}
                        </>
                    )}
                </>
            )}

            {/* Double-sided: a mirrored copy of the full design on the back
                face (rotated 180° about Y so it reads correctly from behind),
                offset back by the box depth. Non-interactive. */}
            {mount.doubleSided && backBundle && (
                <group rotation={[0, Math.PI, 0]} position={[0, 0, -Dp]}>
                    <BundlePanel
                        params={params}
                        bundle={backBundle}
                        night={night}
                        showOutlines={showOutlines}
                        faceShape={faceShape}
                    />
                </group>
            )}
        </group>
    );
}

/**
 * Render a panel's full design from a cached bundle — non-interactive (no
 * editing overlays). Used to draw the NON-active sign so both signs show their
 * real material-group geometry (apertures, acrylic, vinyl, standoff, push-
 * through) at once, identical to how they look when being edited.
 */
function BundlePanel({
    params,
    bundle,
    night,
    showOutlines,
    enclosed = false,
    faceShape = 'square',
}: {
    params: PanelParams;
    bundle: PanelRenderBundle;
    night: boolean;
    showOutlines: boolean;
    enclosed?: boolean;
    faceShape?: 'square' | 'circle';
}) {
    return (
        <Panel
            params={params}
            development={bundle.development}
            split={bundle.split}
            aperture={bundle.aperture}
            keyline={bundle.keyline}
            pushThroughKeyline={bundle.pushThroughKeyline}
            pushThroughIslands={bundle.pushThroughIslands}
            autoFixings={bundle.autoFixings}
            manualFixings={bundle.manualFixings}
            cableHoles={bundle.cableHoles}
            reference={bundle.reference}
            vinylPieces={bundle.vinylPieces}
            acrylicPieces={bundle.acrylicPieces}
            solidPieces={bundle.solidPieces}
            standoffPieces={bundle.standoffPieces}
            pushThroughPieces={bundle.pushThroughPieces}
            backlightPieces={bundle.backlightPieces}
            vinylPrintDataUrl={bundle.vinylPrintDataUrl}
            fold={1}
            showOutlines={showOutlines}
            showStandoffLetters
            showStandoffLocators
            illuminationView={night}
            illumination={params.illumination}
            placedPathsByIndex={null}
            pathGroupColors={null}
            showDimensions={false}
            enclosed={enclosed}
            faceShape={faceShape}
        />
    );
}

/**
 * The fascia shown as a faded backdrop at the origin while the projecting sign
 * is being edited — so the main panel stays visible (in situ) but recedes.
 */
function FadedFascia({
    params,
    development,
    artworkSvg,
}: {
    params: PanelParams;
    development: PanelDevelopment;
    artworkSvg?: string | null;
}) {
    const tex = useSvgTexture(artworkSvg);
    const w = development.faceNominalWMm * S;
    const h = development.faceNominalHMm * S;
    return (
        <group>
            <mesh>
                <planeGeometry args={[w, h]} />
                <meshBasicMaterial
                    color={params.panelColor ?? DEFAULT_PANEL_COLOR}
                    transparent
                    opacity={0.22}
                    side={THREE.DoubleSide}
                />
                <Edges color={EDGE_COLOR} lineWidth={1} />
            </mesh>
            {tex && (
                <mesh position={[0, 0, 0.5 * S]}>
                    <planeGeometry args={[w, h]} />
                    <meshBasicMaterial map={tex} transparent opacity={0.3} />
                </mesh>
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
    /** Backlit apertures — glow through the cut in the illumination view. */
    backlightPieces?: MaterialPiece[];
    /** Extra metal faces (brass/…) laminated on the front of letters. */
    extraFacePieces?: ExtraFacePiece[];
    /** Full-colour vinyl print PNG — face-sized, masked to the vinyl shapes. */
    vinylPrintDataUrl?: string | null;
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
    /** Mark fixing-hole positions on the panel face (stood-off lettering). */
    showFaceFixings?: boolean;
    /**
     * Master switch for non-physical annotation marks (edges, fixing markers,
     * keyline/reference register lines, cable rings, seams). Default on. The
     * approval pack's "Annotation" toggle drives this off so the client sees
     * only how the sign looks installed.
     */
    annotations?: boolean;
    /** Dark illumination preview — darkens the scene + lights configured glow. */
    illuminationView?: boolean;
    illumination?: PanelParams['illumination'];
    /** Editable in-scene dimension annotations (width / height / return / gap). */
    showDimensions?: boolean;
    onDimensionChange?: (
        field: 'width' | 'height' | 'return' | 'shadowGap',
        valueMm: number,
    ) => void;
    /**
     * The OTHER panel in a projecting-sign design, shown as a positioned ghost
     * slab (footprint + colour) so both signs read together in real space.
     * `isBlade` true ⇒ the active panel is the fascia and this ghost is the
     * blade; false ⇒ the active panel is the blade and this ghost is the
     * fascia it mounts to.
     */
    secondaryPanel?: {
        params: PanelParams;
        development: PanelDevelopment;
        split: PanelSplit;
        artworkSvg?: string | null;
        /** Cached full-design geometry for the secondary sign, if it has any. */
        bundle?: PanelRenderBundle | null;
        isBlade: boolean;
    } | null;
    mount?: ResolvedMount;
    /** 0 = assembled, 1 = fully exploded — fans the layer stack along Z. */
    explodeT?: number;
    /** Honour prefers-reduced-motion: snap the explode instead of easing it. */
    reducedMotion?: boolean;
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
    const backlightPieces = props.backlightPieces ?? [];
    const pushThroughKeyline = props.pushThroughKeyline ?? [];
    const pushThroughIslands = props.pushThroughIslands ?? [];
    const pushThroughPieces = props.pushThroughPieces ?? [];
    const extraFacePieces = props.extraFacePieces ?? [];
    // The "Annotation" master switch. Off strips every non-physical mark so the
    // sign reads exactly as installed: no edge wireframes, fixing markers,
    // register lines, cable rings or seams. Edges + fixing markers ride on
    // showOutlines / showStandoffLocators; the overlay lines on `annotations`
    // itself (threaded into Panel).
    const annotations = props.annotations ?? true;
    const showOutlines = (props.showOutlines ?? true) && annotations;
    const showStandoffLetters = props.showStandoffLetters ?? true;
    const showStandoffLocators = (props.showStandoffLocators ?? true) && annotations;
    const illuminationView = props.illuminationView ?? false;
    const explodeT = props.explodeT ?? 0;
    const reducedMotion = props.reducedMotion ?? false;

    // A projecting-sign design renders BOTH panels in fixed in-situ positions —
    // the fascia at the origin, the projecting sign mounted perpendicular off
    // its face — and NEVER repositions them on tab change. Switching tabs only
    // moves the camera focus + fades the non-edited panel. The projecting tab
    // is shown only on the folded view (the unfold view stays a flat blank).
    const secondary = props.secondaryPanel ?? null;
    const mount = props.mount;
    const folded = fold >= 0.5;
    const showProjecting = !!(secondary && mount && folded);
    const activeIsProjecting = !!(secondary && !secondary.isBlade);

    // Resolve fascia vs projecting regardless of which one is being edited.
    const fasciaParams =
        activeIsProjecting && secondary ? secondary.params : props.params;
    const fasciaDev =
        activeIsProjecting && secondary
            ? secondary.development
            : props.development;
    const projParams = activeIsProjecting
        ? props.params
        : (secondary?.params ?? null);
    const projDev = activeIsProjecting
        ? props.development
        : (secondary?.development ?? null);
    const projSplit = activeIsProjecting
        ? props.split
        : (secondary?.split ?? null);

    // The projecting sign's in-situ centre (mounted on the fascia face).
    const Wf = fasciaParams.panelWidthMm * S;
    const Hf = fasciaParams.panelHeightMm * S;
    const Wp = (projParams?.panelWidthMm ?? 0) * S;
    const Hp = (projParams?.panelHeightMm ?? 0) * S;
    const axCentre = -Wf / 2 + (mount?.offsetXMm ?? 0) * S;
    const ayTop = Hf / 2 - (mount?.offsetYMm ?? 0) * S;
    const projCentre: [number, number, number] = [
        axCentre,
        ayTop - Hp / 2,
        Wp / 2,
    ];

    // Frame the whole composite (fascia + projecting protrusion).
    const reach =
        Math.max(
            fasciaDev.totalFlatWMm,
            fasciaDev.totalFlatHMm,
            showProjecting && projParams
                ? projParams.panelWidthMm + fasciaParams.panelWidthMm * 0.5
                : 0,
        ) *
        S *
        1.5;

    // Camera: frame the whole composite on the main tab; fly tight to the
    // projecting sign IN PLACE when editing it (never moving the sign itself).
    const focusKey = activeIsProjecting ? 'projecting' : 'main';
    const focusReach = activeIsProjecting
        ? Math.max(
              projParams?.panelWidthMm ?? 500,
              projParams?.panelHeightMm ?? 500,
          ) *
          S *
          2.6
        : reach;
    const goalLook: [number, number, number] = activeIsProjecting
        ? projCentre
        : [0, 0, 0];
    const goalPos: [number, number, number] = [
        goalLook[0] + focusReach,
        goalLook[1] + focusReach * 0.65,
        goalLook[2] + focusReach,
    ];

    // The active panel's design as a bundle — used to mirror it onto the back
    // face when the active panel is a double-sided projecting sign.
    const activeBundle: PanelRenderBundle = {
        development: props.development,
        split: props.split,
        aperture: props.aperture,
        keyline: props.keyline,
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
        backlightPieces,
        // Extra-face render lands in the next slice; empty keeps the bundle
        // type satisfied for the back-face mirror.
        extraFacePieces: [],
        vinylPrintDataUrl: props.vinylPrintDataUrl,
    };

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
            <CameraFocus
                focusKey={focusKey}
                goalPos={goalPos}
                goalLook={goalLook}
            />

            {/* One explode rig wraps the whole composite so the fascia AND the
                projecting sign (and a double-sided sign's back face) all fan
                apart together off the same damped scalar — every Panel below
                consumes the shared context; outside it they rest assembled. */}
            <ExplodeProvider target={explodeT} reduced={reducedMotion}>

            {/* Fascia at the origin — the full editable panel when it's the
                focus; otherwise its full design from the cached bundle (so it
                still shows its real artwork while the projecting sign is
                edited), falling back to a faded backdrop if not yet cached. */}
            {activeIsProjecting ? (
                secondary?.bundle ? (
                    <BundlePanel
                        params={fasciaParams}
                        bundle={secondary.bundle}
                        night={illuminationView}
                        showOutlines={showOutlines}
                    />
                ) : (
                    <FadedFascia
                        params={fasciaParams}
                        development={fasciaDev}
                        artworkSvg={secondary?.artworkSvg}
                    />
                )
            ) : (
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
                    extraFacePieces={extraFacePieces}
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
                    showFaceFixings={(props.showFaceFixings ?? false) && annotations}
                    annotations={annotations}
                />
            )}

            {/* Projecting sign — ALWAYS mounted perpendicular in situ; never
                repositioned. When it's the focus it's the full editable Panel;
                otherwise a lightweight tray + design texture (or a disc). */}
            {showProjecting && mount && projParams && projDev && projSplit && (
                activeIsProjecting ? (
                    <ProjectingMounted
                        fascia={fasciaParams}
                        params={projParams}
                        development={projDev}
                        split={projSplit}
                        mount={mount}
                        night={illuminationView}
                        showOutlines={showOutlines}
                        backBundle={activeBundle}
                        faceShape={mount.shape}
                    >
                        {/* Full editing parity with the fascia — path picking,
                            material groups, fixings, outlines, effects and
                            dimensions all work in situ. FacePlane converts clicks
                            into face-local coords, so placement is correct even
                            though the sign is mounted rotated. Open-backed when
                            double-sided so the mirrored back design forms the box. */}
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
                            extraFacePieces={extraFacePieces}
                            placedPathsByIndex={props.placedPathsByIndex ?? null}
                            pathGroupColors={props.pathGroupColors ?? null}
                            pendingPaths={props.pendingPaths}
                            isEditingGroup={props.isEditingGroup}
                            onPathToggle={props.onPathToggle}
                            fold={1}
                            fixingMode={props.fixingMode}
                            cableMode={props.cableMode}
                            onFixingClick={props.onFixingClick}
                            showOutlines={showOutlines}
                            showStandoffLetters={showStandoffLetters}
                            showStandoffLocators={showStandoffLocators}
                            illuminationView={illuminationView}
                            illumination={props.illumination}
                            showDimensions={props.showDimensions}
                            onDimensionChange={props.onDimensionChange}
                            enclosed={!mount.doubleSided}
                            faceShape={mount.shape}
                        />
                    </ProjectingMounted>
                ) : secondary?.bundle ? (
                    // Non-active projecting sign with its full design from the
                    // cached bundle — identical material groups/apertures to
                    // when it's being edited (square box or round disc), just
                    // non-interactive.
                    <ProjectingMounted
                        fascia={fasciaParams}
                        params={projParams}
                        development={projDev}
                        split={projSplit}
                        mount={mount}
                        night={illuminationView}
                        showOutlines={showOutlines}
                        backBundle={secondary.bundle}
                        faceShape={mount.shape}
                    >
                        <BundlePanel
                            params={projParams}
                            bundle={secondary.bundle}
                            night={illuminationView}
                            showOutlines={showOutlines}
                            enclosed={!mount.doubleSided}
                            faceShape={mount.shape}
                        />
                    </ProjectingMounted>
                ) : (
                    // Not yet cached (never visited the projecting tab) →
                    // lightweight tray/disc + design texture.
                    <ProjectingMounted
                        fascia={fasciaParams}
                        params={projParams}
                        development={projDev}
                        split={projSplit}
                        mount={mount}
                        night={illuminationView}
                        showOutlines={showOutlines}
                        artworkSvg={secondary?.artworkSvg}
                        faceShape={mount.shape}
                    />
                )
            )}

            </ExplodeProvider>

            <OrbitControls enablePan makeDefault />
        </Canvas>
    );
}
