'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    buildDevelopment,
    placeAperture,
    placementTransform,
    clipApertureToFace,
    placeFixings,
    buildSectionedExport,
    clipApertureToSection,
    circlePoly,
} from '@/lib/visualiser/geometry';
import { splitPanels } from '@/lib/visualiser/split';
import { buildKeyline, mergeKeyline, importSvg } from '@/lib/visualiser/svg-import';
import { composeLayers } from '@/lib/visualiser/compose';
import {
    rasterizeFaceArtwork,
    type PlacedArtwork,
    type MaskShape,
} from '@/lib/visualiser/image';
import {
    PanelParamsSchema,
    DEFAULT_PLACEMENT,
    type PanelParams,
    type ImportedSvg,
    type FlatPath,
    type FaceRectMm,
    type MaterialPiece,
    type StandoffPiece,
    type PushThroughPiece,
    type ExtraFacePiece,
    type PanelRenderBundle,
    type PanelPdfData,
} from '@/lib/visualiser/types';
import { FACE_MATERIALS } from '@/lib/visualiser/extra-face';

type Effective =
    | { kind: 'cut' }
    | { kind: 'solid' }
    | { kind: 'vinyl'; color: string; fullColor: boolean }
    | { kind: 'backlight'; color: string; glowIntensity: number }
    | { kind: 'acrylic'; color: string; thicknessMm: number }
    | {
          kind: 'standoff';
          color: string;
          thicknessMm: number;
          standoffDistanceMm: number;
      }
    | {
          kind: 'pushthrough';
          color: string;
          thicknessMm: number;
          keylineOffsetMm: number;
          protrusionMm: number;
      }
    | { kind: 'inherited' };

const EMPTY_CLIP = { paths: [] as FlatPath[], wasClipped: false, anyOutside: false };

/**
 * The pure panel geometry pipeline — development → placed artwork → material
 * pieces → keyline / push-through → section export → render bundle + PDF data.
 *
 * This is the SAME derivation the visualiser runs for the panel being edited.
 * It is factored out so it can run for BOTH panels of a two-item design (the
 * fascia AND the projecting sign) on every render — so a loaded design shows
 * its projecting sign fully (3D + PDF) immediately, without first selecting the
 * projecting tab to populate a cache. Pass `params = null` to get an inert
 * result (used for the secondary slot when there is no projecting sign).
 *
 * It depends only on `params` + the uploaded SVG — never on interactive editor
 * state (selection, edit mode, view toggles) — so the result is identical
 * whichever panel is active. Interactive overlays (group highlight, pending
 * picks, view-layer filtering) stay in VisualiserClient, layered on top of
 * these outputs.
 */
export function usePanelDerivation(
    params: PanelParams | null,
    storeImported: ImportedSvg | null,
    /**
     * Raw uploaded SVG string (colours + gradients intact) for the LEGACY
     * single-upload case (no artwork layers). Only used to build the
     * full-colour vinyl print; ignored when artwork layers are present (those
     * carry their own raw SVGs). Optional — omit and printed vinyl simply
     * falls back to its flat colour for single-upload designs.
     */
    rawSvgSource: string | null = null,
) {
    const valid = useMemo(
        () => (params ? PanelParamsSchema.safeParse(params) : null),
        [params],
    );

    // Geometry-only key — excludes the (potentially large) artwork-layer SVG
    // strings so adding / moving a layer doesn't needlessly rebuild the
    // panel development.
    const paramsGeomKey = useMemo(
        () =>
            params ? JSON.stringify({ ...params, artworkLayers: undefined }) : '',
        [params],
    );

    const development = useMemo(() => {
        if (!params || !valid?.success) return null;
        return buildDevelopment(params);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paramsGeomKey, valid?.success]);

    const artworkLayers = params?.artworkLayers ?? [];
    const composite = useMemo(() => {
        if (!params || artworkLayers.length === 0) return null;
        return composeLayers(
            artworkLayers,
            params.panelWidthMm,
            params.panelHeightMm,
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        JSON.stringify(artworkLayers),
        params?.panelWidthMm,
        params?.panelHeightMm,
    ]);
    const imported = composite ?? storeImported;

    const split = useMemo(
        () =>
            params
                ? splitPanels(
                      params.panelWidthMm,
                      undefined,
                      params.centrePanelOverrideMm ?? undefined,
                  )
                : null,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [params?.panelWidthMm, params?.centrePanelOverrideMm],
    );

    const placement = params?.aperturePlacement ?? DEFAULT_PLACEMENT;

    const placedClip = useMemo(() => {
        if (!development || !imported) return EMPTY_CLIP;
        const placed = placeAperture(
            development,
            imported.paths,
            imported.bbox,
            placement,
        );
        return clipApertureToFace(development, placed);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [development, imported, JSON.stringify(placement)]);

    const placedClipByIndex = useMemo<Array<FlatPath | null>>(() => {
        if (!development || !imported) return [];
        const imp = imported;
        return imp.paths.map((path) => {
            const placed = placeAperture(development, [path], imp.bbox, placement);
            const clipped = clipApertureToFace(development, placed);
            return clipped.paths[0] ?? null;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [development, imported, JSON.stringify(placement)]);

    const groupByPath = useMemo(() => {
        const map = new Map<
            number,
            NonNullable<PanelParams['materialGroups']>[number]
        >();
        for (const g of params?.materialGroups ?? []) {
            for (const i of g.pathIndices) map.set(i, g);
        }
        return map;
    }, [params?.materialGroups]);

    const parentByIndex = useMemo(() => {
        const result: Array<number | null> = [];
        const polyArea = (pts: Array<[number, number]>): number => {
            let a = 0;
            for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
                a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
            }
            return Math.abs(a) / 2;
        };
        const containsPoint = (
            ring: Array<[number, number]>,
            p: [number, number],
        ): boolean => {
            let inside = false;
            for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
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
            }
            return inside;
        };
        const areas: number[] = [];
        const centroids: Array<[number, number] | null> = [];
        for (const p of placedClipByIndex) {
            if (!p || !p.closed || p.points.length < 3) {
                areas.push(0);
                centroids.push(null);
                continue;
            }
            areas.push(polyArea(p.points));
            let cx = 0;
            let cy = 0;
            for (const [x, y] of p.points) {
                cx += x;
                cy += y;
            }
            centroids.push([cx / p.points.length, cy / p.points.length]);
        }
        for (let i = 0; i < placedClipByIndex.length; i++) {
            const c = centroids[i];
            if (!c) {
                result.push(null);
                continue;
            }
            const myArea = areas[i];
            let parent: number | null = null;
            let parentArea = Infinity;
            for (let j = 0; j < placedClipByIndex.length; j++) {
                if (i === j) continue;
                const other = placedClipByIndex[j];
                if (!other || !other.closed || other.points.length < 3) continue;
                if (areas[j] <= myArea) continue;
                if (!containsPoint(other.points, c)) continue;
                if (areas[j] < parentArea) {
                    parent = j;
                    parentArea = areas[j];
                }
            }
            result.push(parent);
        }
        return result;
    }, [placedClipByIndex]);

    const isDescendantOf = (i: number, root: number): boolean => {
        let cursor = parentByIndex[i];
        let depth = 0;
        while (cursor !== null && depth < 256) {
            if (cursor === root) return true;
            cursor = parentByIndex[cursor];
            depth++;
        }
        return false;
    };
    const isNested = (i: number): boolean =>
        parentByIndex[i] !== null && parentByIndex[i] !== undefined;

    const mode = params?.apertureMode ?? 'aperture';
    const fixingDiameter =
        params?.fixingDiameterMm ??
        (params?.fixingRadiusMm ? params.fixingRadiusMm * 2 : 10);
    const defaultUngroupedKind: 'cut' | 'standoff' | 'vinyl' =
        mode === 'standoff' ? 'standoff' : mode === 'vinyl' ? 'vinyl' : 'cut';
    const globalLetterThickness = params?.letterThicknessMm ?? 5;
    const globalStandoffDistance = params?.standoffDistanceMm ?? 25;
    const globalLetterColor = params?.letterColor ?? '#1a1f23';

    const effectiveMaterials = useMemo<Effective[]>(() => {
        return placedClipByIndex.map((_, i) => {
            const own = groupByPath.get(i);
            if (isNested(i)) return { kind: 'inherited' };
            if (own) {
                if (own.material === 'cut') return { kind: 'cut' };
                if (own.material === 'solid') return { kind: 'solid' };
                if (own.material === 'vinyl')
                    // Printed full-colour is the default for vinyl ("upgrade in
                    // place"); a group opts back to flat solid colour by
                    // setting printFullColor = false.
                    return {
                        kind: 'vinyl',
                        color: own.color,
                        fullColor: own.printFullColor !== false,
                    };
                if (own.material === 'acrylic')
                    return {
                        kind: 'acrylic',
                        color: own.color,
                        thicknessMm: own.thicknessMm ?? 5,
                    };
                if (own.material === 'standoff')
                    return {
                        kind: 'standoff',
                        color: own.color,
                        thicknessMm: own.thicknessMm ?? globalLetterThickness,
                        standoffDistanceMm:
                            own.standoffDistanceMm ?? globalStandoffDistance,
                    };
                if (own.material === 'pushthrough')
                    return {
                        kind: 'pushthrough',
                        color: own.color,
                        thicknessMm: own.thicknessMm ?? 5,
                        keylineOffsetMm: own.keylineOffsetMm ?? 1.5,
                        protrusionMm: own.protrusionMm ?? 5,
                    };
                if (own.material === 'backlight')
                    return {
                        kind: 'backlight',
                        color: own.color,
                        glowIntensity: own.glowIntensity ?? 1,
                    };
            }
            if (defaultUngroupedKind === 'standoff') {
                return {
                    kind: 'standoff',
                    color: globalLetterColor,
                    thicknessMm: globalLetterThickness,
                    standoffDistanceMm: globalStandoffDistance,
                };
            }
            if (defaultUngroupedKind === 'vinyl') {
                // Whole-artwork printed vinyl — full colour, not cut. The flat
                // `color` is only a fallback for when the raster isn't ready.
                return {
                    kind: 'vinyl',
                    color: params?.panelColor ?? '#cccccc',
                    fullColor: true,
                };
            }
            return { kind: 'cut' };
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        placedClipByIndex,
        groupByPath,
        parentByIndex,
        defaultUngroupedKind,
        globalLetterColor,
        globalLetterThickness,
        globalStandoffDistance,
        params?.panelColor,
    ]);

    const holesByIndex = useMemo(() => {
        return placedClipByIndex.map((path, i) => {
            if (!path) return [] as FlatPath[];
            const out: FlatPath[] = [];
            for (let j = 0; j < placedClipByIndex.length; j++) {
                if (j === i) continue;
                const hp = placedClipByIndex[j];
                if (!hp || !hp.closed) continue;
                if (isDescendantOf(j, i)) out.push(hp);
            }
            return out;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [placedClipByIndex, parentByIndex]);

    const aperture = useMemo(() => {
        const out: FlatPath[] = [];
        for (let i = 0; i < placedClipByIndex.length; i++) {
            const p = placedClipByIndex[i];
            if (!p) continue;
            // Backlit shapes are cut from the panel exactly like apertures —
            // the difference is the lit opal behind. So both kinds become face
            // holes / panel cuts.
            const k = effectiveMaterials[i]?.kind;
            if (k !== 'cut' && k !== 'backlight') continue;
            out.push(p);
        }
        return out;
    }, [placedClipByIndex, effectiveMaterials]);

    const backlightPieces = useMemo<MaterialPiece[]>(() => {
        const out: MaterialPiece[] = [];
        for (let i = 0; i < placedClipByIndex.length; i++) {
            const path = placedClipByIndex[i];
            if (!path) continue;
            const eff = effectiveMaterials[i];
            if (eff?.kind !== 'backlight') continue;
            out.push({
                pathIndex: i,
                path,
                holes: holesByIndex[i],
                color: eff.color,
                glowIntensity: eff.glowIntensity,
            });
        }
        return out;
    }, [placedClipByIndex, effectiveMaterials, holesByIndex]);

    const materialPieces = useMemo(() => {
        const vinyl: MaterialPiece[] = [];
        const acrylic: MaterialPiece[] = [];
        const solid: MaterialPiece[] = [];
        const panelColor = params?.panelColor ?? '#d6d6d6';
        for (let i = 0; i < placedClipByIndex.length; i++) {
            const path = placedClipByIndex[i];
            if (!path) continue;
            const eff = effectiveMaterials[i];
            if (eff.kind === 'vinyl') {
                vinyl.push({
                    pathIndex: i,
                    path,
                    holes: holesByIndex[i],
                    color: eff.color,
                    fullColor: eff.fullColor,
                });
            } else if (eff.kind === 'acrylic') {
                acrylic.push({
                    pathIndex: i,
                    path,
                    holes: holesByIndex[i],
                    color: eff.color,
                    thicknessMm: eff.thicknessMm,
                });
            } else if (eff.kind === 'solid') {
                const groupEntry = groupByPath.get(i);
                solid.push({
                    pathIndex: i,
                    path,
                    holes: holesByIndex[i],
                    color: groupEntry?.color ?? panelColor,
                });
            }
        }
        return { vinyl, acrylic, solid };
    }, [
        placedClipByIndex,
        effectiveMaterials,
        holesByIndex,
        groupByPath,
        params?.panelColor,
    ]);

    const pushThroughPieces = useMemo<PushThroughPiece[]>(() => {
        const out: PushThroughPiece[] = [];
        for (let i = 0; i < placedClipByIndex.length; i++) {
            const path = placedClipByIndex[i];
            if (!path) continue;
            const eff = effectiveMaterials[i];
            if (eff?.kind !== 'pushthrough') continue;
            out.push({
                pathIndex: i,
                path,
                holes: holesByIndex[i],
                color: eff.color,
                thicknessMm: eff.thicknessMm,
                keylineOffsetMm: eff.keylineOffsetMm,
                protrusionMm: eff.protrusionMm,
            });
        }
        return out;
    }, [placedClipByIndex, effectiveMaterials, holesByIndex]);

    const standoffPieces = useMemo<StandoffPiece[]>(() => {
        const out: StandoffPiece[] = [];
        for (let i = 0; i < placedClipByIndex.length; i++) {
            const path = placedClipByIndex[i];
            if (!path) continue;
            const eff = effectiveMaterials[i];
            if (eff?.kind !== 'standoff') continue;
            out.push({
                pathIndex: i,
                path,
                holes: holesByIndex[i],
                color: eff.color,
                thicknessMm: eff.thicknessMm,
                standoffDistanceMm: eff.standoffDistanceMm,
            });
        }
        return out;
    }, [placedClipByIndex, effectiveMaterials, holesByIndex]);

    // Extra metal faces (brass / …): a group can opt to laminate a metal face
    // over its letters. The face is coincident with the underlying letter
    // (same outline + counters), so it's cut from the same geometry — only the
    // material/colour/thickness and its front-Z (push-through letters sit proud
    // of the panel; flat cut/backlit sit on the face) differ. Same outline ⇒
    // it nests exactly like an acrylic face on export.
    const extraFacePieces = useMemo<ExtraFacePiece[]>(() => {
        const out: ExtraFacePiece[] = [];
        for (let i = 0; i < placedClipByIndex.length; i++) {
            const path = placedClipByIndex[i];
            if (!path) continue;
            const face = groupByPath.get(i)?.extraFace;
            if (!face) continue;
            const eff = effectiveMaterials[i];
            const kind = eff?.kind;
            // A face only makes sense on a letter that sits on the panel: a
            // cut/backlit hole or a push-through letter. (Counters resolve to
            // 'inherited' and are skipped — they ride along as `holes`.)
            if (kind !== 'cut' && kind !== 'backlight' && kind !== 'pushthrough') {
                continue;
            }
            const spec = FACE_MATERIALS[face.material];
            const holes = holesByIndex[i];
            out.push({
                pathIndex: i,
                path,
                holes: holes && holes.length > 0 ? holes : undefined,
                material: face.material,
                color: spec.color,
                thicknessMm:
                    face.thicknessMm > 0
                        ? face.thicknessMm
                        : spec.defaultThicknessMm,
                frontZMm:
                    eff && eff.kind === 'pushthrough' ? eff.protrusionMm : 0,
            });
        }
        return out;
    }, [placedClipByIndex, effectiveMaterials, holesByIndex, groupByPath]);

    const reference = useMemo(() => {
        const out: FlatPath[] = [];
        for (let i = 0; i < placedClipByIndex.length; i++) {
            const p = placedClipByIndex[i];
            if (!p) continue;
            if (effectiveMaterials[i]?.kind !== 'standoff') continue;
            out.push(p);
            for (const h of holesByIndex[i] ?? []) {
                if (h && h.closed) out.push(h);
            }
        }
        return out;
    }, [placedClipByIndex, effectiveMaterials, holesByIndex]);

    const fixingDensity = params?.fixingDensity ?? 1;

    const autoFixings = useMemo(() => {
        if (!development || reference.length === 0) return [];
        const raw = placeFixings(reference, fixingDiameter, undefined, fixingDensity);
        return clipApertureToFace(development, raw).paths;
    }, [development, reference, fixingDiameter, fixingDensity]);

    const placementXf = useMemo(() => {
        if (!development || !imported) return null;
        return placementTransform(development, imported.bbox, placement);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [development, imported, JSON.stringify(placement)]);

    // The flat face rectangle (flat-development mm) — the frame the full-colour
    // vinyl raster is rendered into, and the rect consumers drop it onto.
    const faceRectMm = useMemo<FaceRectMm | null>(() => {
        const face = development?.segments.find((s) => s.role === 'face');
        return face
            ? { x: face.xMm, y: face.yMm, w: face.wMm, h: face.hMm }
            : null;
    }, [development]);

    // Inputs for the printed-vinyl raster: the raw (colourful) artwork placed
    // into face-top-left mm, plus the vinyl shapes to mask it to. Built sync;
    // the actual rasterise (canvas) runs in the effect below. Null when there's
    // no printed vinyl, so the raster work is skipped entirely for cut-only or
    // solid-vinyl designs.
    const vinylPrintInputs = useMemo<{
        layers: PlacedArtwork[];
        mask: MaskShape[];
    } | null>(() => {
        if (!development || !faceRectMm || !placementXf || !imported)
            return null;
        const fcPieces = materialPieces.vinyl.filter((p) => p.fullColor);
        if (fcPieces.length === 0) return null;

        const s = placement.scale || 1;
        const placed: PlacedArtwork[] = [];
        const layers = params?.artworkLayers ?? [];
        if (layers.length > 0) {
            // Composite: each layer's raw SVG, placed by its own (x,y,scale)
            // in face-frame mm, then through the placement transform to flat.
            for (const l of layers) {
                let bbox: PlacedArtwork['viewBox'];
                try {
                    bbox = importSvg(l.svgSource).bbox;
                } catch {
                    bbox = undefined;
                }
                const [fx, fy] = placementXf.toFlat([l.xMm, l.yMm]);
                placed.push({
                    svg: l.svgSource,
                    viewBox: bbox,
                    xMm: fx - faceRectMm.x,
                    yMm: fy - faceRectMm.y,
                    wMm: l.wMm * l.scale * s,
                    hMm: l.hMm * l.scale * s,
                });
            }
        } else if (rawSvgSource) {
            // Legacy single upload: the whole raw SVG, placed by the global
            // aperture placement (align / scale / nudge).
            const b = imported.bbox;
            const [fx, fy] = placementXf.toFlat([b.x, b.y]);
            placed.push({
                svg: rawSvgSource,
                viewBox: b,
                xMm: fx - faceRectMm.x,
                yMm: fy - faceRectMm.y,
                wMm: b.w * s,
                hMm: b.h * s,
            });
        } else {
            return null; // no colour source available → fall back to flat
        }

        const mask: MaskShape[] = fcPieces.map((p) => ({
            outer: p.path.points.map(
                ([x, y]) => [x - faceRectMm.x, y - faceRectMm.y] as [number, number],
            ),
            holes: (p.holes ?? []).map((h) =>
                h.points.map(
                    ([x, y]) =>
                        [x - faceRectMm.x, y - faceRectMm.y] as [number, number],
                ),
            ),
        }));
        return { layers: placed, mask };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        development,
        faceRectMm,
        placementXf,
        imported,
        materialPieces.vinyl,
        JSON.stringify(params?.artworkLayers),
        rawSvgSource,
        JSON.stringify(placement),
    ]);

    // Rasterise the placed colour artwork to a face-sized PNG (canvas, async),
    // masked to the printed-vinyl shapes. Consumers paint this one image onto
    // the face — 3D texture, 2D <image>, PDF addImage — so gradients/colours
    // show everywhere and the vinyl polygons stay as the contour cut line.
    const [vinylPrintDataUrl, setVinylPrintDataUrl] = useState<string | null>(
        null,
    );
    useEffect(() => {
        let cancelled = false;
        if (!vinylPrintInputs || !faceRectMm) {
            setVinylPrintDataUrl(null);
            return;
        }
        rasterizeFaceArtwork(
            vinylPrintInputs.layers,
            faceRectMm.w,
            faceRectMm.h,
            { mask: vinylPrintInputs.mask },
        ).then((url) => {
            if (!cancelled) setVinylPrintDataUrl(url);
        });
        return () => {
            cancelled = true;
        };
    }, [vinylPrintInputs, faceRectMm]);

    // --- Printed FACE VINYL ---------------------------------------------------
    // A separate print SVG laminated on a letter group's faces. Mirrors the
    // vinyl-print pipeline, but the source is the group's `faceVinyl.svgSource`
    // (a second upload, same proportions as the letters) and the mask is the
    // group's OWN letters — so the print lands exactly on the letters. The print
    // is auto-aligned to the group's letter bounding box. All face-vinyl groups
    // rasterise into one combined face image (each print is scoped to its own
    // letters' area, so they don't bleed).
    const faceVinylPieces = useMemo<MaterialPiece[]>(() => {
        const out: MaterialPiece[] = [];
        for (const g of params?.materialGroups ?? []) {
            if (!g.faceVinyl?.svgSource) continue;
            for (const i of g.pathIndices) {
                const p = placedClipByIndex[i];
                if (!p) continue;
                const kind = effectiveMaterials[i]?.kind;
                if (kind !== 'cut' && kind !== 'backlight' && kind !== 'pushthrough' && kind !== 'acrylic') continue;
                const holes = holesByIndex[i];
                out.push({
                    pathIndex: i,
                    path: p,
                    holes: holes && holes.length > 0 ? holes : undefined,
                    color: '#cfd6da',
                });
            }
        }
        return out;
    }, [params?.materialGroups, placedClipByIndex, effectiveMaterials, holesByIndex]);

    const faceVinylInputs = useMemo<{
        layers: PlacedArtwork[];
        mask: MaskShape[];
    } | null>(() => {
        if (!development || !faceRectMm) return null;
        const placed: PlacedArtwork[] = [];
        const mask: MaskShape[] = [];
        for (const g of params?.materialGroups ?? []) {
            const fv = g.faceVinyl;
            if (!fv?.svgSource) continue;
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            const groupMasks: MaskShape[] = [];
            for (const i of g.pathIndices) {
                const p = placedClipByIndex[i];
                if (!p) continue;
                const kind = effectiveMaterials[i]?.kind;
                if (kind !== 'cut' && kind !== 'backlight' && kind !== 'pushthrough' && kind !== 'acrylic') continue;
                for (const [x, y] of p.points) {
                    if (x < minX) minX = x;
                    if (y < minY) minY = y;
                    if (x > maxX) maxX = x;
                    if (y > maxY) maxY = y;
                }
                groupMasks.push({
                    outer: p.points.map(
                        ([x, y]) => [x - faceRectMm.x, y - faceRectMm.y] as [number, number],
                    ),
                    holes: (holesByIndex[i] ?? []).map((h) =>
                        h.points.map(
                            ([x, y]) => [x - faceRectMm.x, y - faceRectMm.y] as [number, number],
                        ),
                    ),
                });
            }
            if (!Number.isFinite(minX) || groupMasks.length === 0) continue;
            let bbox: PlacedArtwork['viewBox'];
            try {
                bbox = importSvg(fv.svgSource).bbox;
            } catch {
                bbox = undefined;
            }
            placed.push({
                svg: fv.svgSource,
                viewBox: bbox,
                xMm: minX - faceRectMm.x,
                yMm: minY - faceRectMm.y,
                wMm: maxX - minX,
                hMm: maxY - minY,
            });
            mask.push(...groupMasks);
        }
        if (placed.length === 0) return null;
        return { layers: placed, mask };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        development,
        faceRectMm,
        placedClipByIndex,
        effectiveMaterials,
        holesByIndex,
        JSON.stringify(params?.materialGroups),
    ]);

    const [faceVinylPrintDataUrl, setFaceVinylPrintDataUrl] = useState<string | null>(
        null,
    );
    useEffect(() => {
        let cancelled = false;
        if (!faceVinylInputs || !faceRectMm) {
            setFaceVinylPrintDataUrl(null);
            return;
        }
        rasterizeFaceArtwork(faceVinylInputs.layers, faceRectMm.w, faceRectMm.h, {
            mask: faceVinylInputs.mask,
        }).then((url) => {
            if (!cancelled) setFaceVinylPrintDataUrl(url);
        });
        return () => {
            cancelled = true;
        };
    }, [faceVinylInputs, faceRectMm]);

    const manualFixings = useMemo(() => {
        if (!development || !placementXf || reference.length === 0) return [];
        const r = fixingDiameter / 2;
        const isInside = (pt: [number, number]): boolean => {
            let n = 0;
            for (const ref of reference) {
                const ring = ref.points;
                let inside = false;
                for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
                    const xi = ring[i][0];
                    const yi = ring[i][1];
                    const xj = ring[j][0];
                    const yj = ring[j][1];
                    if (
                        yi > pt[1] !== yj > pt[1] &&
                        pt[0] <
                            ((xj - xi) * (pt[1] - yi)) / (yj - yi || 1e-12) + xi
                    ) {
                        inside = !inside;
                    }
                }
                if (inside) n++;
            }
            return n % 2 === 1;
        };
        const polys: ReturnType<typeof circlePoly>[] = [];
        for (const p of params?.manualFixings ?? []) {
            const flatPt = placementXf.toFlat(p);
            if (!isInside(flatPt)) continue;
            polys.push(circlePoly(flatPt[0], flatPt[1], r));
        }
        return clipApertureToFace(development, polys).paths;
    }, [development, placementXf, reference, fixingDiameter, params?.manualFixings]);

    const fixings = useMemo(
        () => [...autoFixings, ...manualFixings],
        [autoFixings, manualFixings],
    );

    const cableHoleDiameter = params?.cableHoleDiameterMm ?? 10;

    const cableHoles = useMemo(() => {
        if (!development || !placementXf) return [];
        const r = cableHoleDiameter / 2;
        const polys = (params?.cableHoles ?? []).map((p) => {
            const [x, y] = placementXf.toFlat(p);
            return circlePoly(x, y, r);
        });
        return clipApertureToFace(development, polys).paths;
    }, [development, placementXf, cableHoleDiameter, params?.cableHoles]);

    const keylineClip = useMemo(() => {
        if (!development || !params || params.keylineMm <= 0 || aperture.length === 0)
            return EMPTY_CLIP;
        const raw = mergeKeyline(buildKeyline(aperture, params.keylineMm));
        return clipApertureToFace(development, raw);
    }, [development, aperture, params]);
    const keyline = keylineClip.paths;

    const pushThrough = useMemo<{ keyline: FlatPath[]; islands: FlatPath[] }>(() => {
        const keylineOut: FlatPath[] = [];
        const islands: FlatPath[] = [];
        if (!development || pushThroughPieces.length === 0)
            return { keyline: keylineOut, islands };
        const ringArea = (pts: Array<[number, number]>): number => {
            let a = 0;
            for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
                a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
            }
            return Math.abs(a) / 2;
        };
        for (const piece of pushThroughPieces) {
            const holes = (piece.holes ?? []).filter(
                (h) => h.closed && h.points.length >= 3,
            );
            if (piece.keylineOffsetMm <= 0) {
                keylineOut.push(piece.path);
                islands.push(...holes);
                continue;
            }
            const compound = buildKeyline(
                [piece.path, ...holes],
                piece.keylineOffsetMm,
            );
            if (compound.length === 0) {
                keylineOut.push(piece.path);
                continue;
            }
            let maxArea = -Infinity;
            let maxIdx = 0;
            compound.forEach((c, i) => {
                const a = ringArea(c.points);
                if (a > maxArea) {
                    maxArea = a;
                    maxIdx = i;
                }
            });
            compound.forEach((c, i) => {
                if (i === maxIdx) keylineOut.push(c);
                else islands.push(c);
            });
        }
        const clip = (paths: FlatPath[]) =>
            clipApertureToFace(development, paths).paths;
        return { keyline: clip(mergeKeyline(keylineOut)), islands: clip(islands) };
    }, [development, pushThroughPieces]);
    const pushThroughKeyline = pushThrough.keyline;
    const pushThroughIslands = pushThrough.islands;

    const sectionExport = useMemo(
        () =>
            development && params && split
                ? buildSectionedExport(params, split)
                : null,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [development, paramsGeomKey, split],
    );

    const apertureBySection = useMemo(() => {
        if (!development || !sectionExport) return [];
        return sectionExport.sections.map((s) =>
            clipApertureToSection(development, s, aperture),
        );
    }, [development, sectionExport, aperture]);

    const keylineBySection = useMemo(() => {
        if (!development || !sectionExport) return [];
        return sectionExport.sections.map((s) =>
            clipApertureToSection(development, s, keyline),
        );
    }, [development, sectionExport, keyline]);

    const pushThroughKeylineBySection = useMemo(() => {
        if (!development || !sectionExport) return [];
        return sectionExport.sections.map((s) =>
            clipApertureToSection(development, s, pushThroughKeyline),
        );
    }, [development, sectionExport, pushThroughKeyline]);

    const pushThroughIslandsBySection = useMemo(() => {
        if (!development || !sectionExport) return [];
        return sectionExport.sections.map((s) =>
            clipApertureToSection(development, s, pushThroughIslands),
        );
    }, [development, sectionExport, pushThroughIslands]);

    const fixingsBySection = useMemo(() => {
        if (!development || !sectionExport) return [];
        return sectionExport.sections.map((s) =>
            clipApertureToSection(development, s, fixings),
        );
    }, [development, sectionExport, fixings]);

    const cableHolesBySection = useMemo(() => {
        if (!development || !sectionExport) return [];
        return sectionExport.sections.map((s) =>
            clipApertureToSection(development, s, cableHoles),
        );
    }, [development, sectionExport, cableHoles]);

    const referenceBySection = useMemo(() => {
        if (!development || !sectionExport) return [];
        return sectionExport.sections.map((s) =>
            clipApertureToSection(development, s, reference),
        );
    }, [development, sectionExport, reference]);

    const apertureHoles = useMemo(() => {
        const out: FlatPath[] = [];
        for (let i = 0; i < placedClipByIndex.length; i++) {
            // Backlit shapes are aperture-cut like plain cuts, and their inner
            // counters stay on the sign too (glued to the lit opal behind), so
            // they're retained islands on the cut layout just the same.
            const k = effectiveMaterials[i]?.kind;
            if (k !== 'cut' && k !== 'backlight') continue;
            const holes = holesByIndex[i] ?? [];
            for (const h of holes) {
                if (h && h.closed && h.points.length >= 3) out.push(h);
            }
        }
        return out;
    }, [placedClipByIndex, effectiveMaterials, holesByIndex]);

    const apertureHolesBySection = useMemo(() => {
        if (!development || !sectionExport) return [];
        return sectionExport.sections.map((s) =>
            clipApertureToSection(development, s, apertureHoles),
        );
    }, [development, sectionExport, apertureHoles]);

    const bundle = useMemo<PanelRenderBundle | null>(() => {
        if (!development || !split) return null;
        return {
            development,
            split,
            aperture,
            keyline,
            pushThroughKeyline,
            pushThroughIslands,
            autoFixings,
            manualFixings,
            cableHoles,
            reference,
            vinylPieces: materialPieces.vinyl,
            acrylicPieces: materialPieces.acrylic,
            solidPieces: materialPieces.solid,
            standoffPieces,
            pushThroughPieces,
            backlightPieces,
            extraFacePieces,
            vinylPrintDataUrl,
            faceRectMm,
        };
    }, [
        development,
        split,
        aperture,
        keyline,
        pushThroughKeyline,
        pushThroughIslands,
        autoFixings,
        manualFixings,
        cableHoles,
        reference,
        materialPieces,
        standoffPieces,
        pushThroughPieces,
        backlightPieces,
        extraFacePieces,
        vinylPrintDataUrl,
        faceRectMm,
    ]);

    const pdfData = useMemo<PanelPdfData | null>(() => {
        if (!params || !development || !sectionExport) return null;
        return {
            params,
            sectionExport,
            apertureBySection,
            keylineBySection,
            pushThroughKeylineBySection,
            pushThroughIslandsBySection,
            fixingsBySection,
            cableHolesBySection,
            referenceBySection,
            apertureHolesBySection,
            vinylPieces: materialPieces.vinyl,
            acrylicPieces: materialPieces.acrylic,
            solidPieces: materialPieces.solid,
            standoffPieces,
            pushThroughPieces,
            backlightPieces,
            extraFacePieces,
            vinylPrintDataUrl,
            faceRectMm,
        };
    }, [
        params,
        development,
        sectionExport,
        apertureBySection,
        keylineBySection,
        pushThroughKeylineBySection,
        pushThroughIslandsBySection,
        fixingsBySection,
        cableHolesBySection,
        referenceBySection,
        apertureHolesBySection,
        materialPieces,
        standoffPieces,
        pushThroughPieces,
        backlightPieces,
        extraFacePieces,
        vinylPrintDataUrl,
        faceRectMm,
    ]);

    return {
        valid,
        development,
        composite,
        imported,
        isComposite: composite !== null,
        split,
        placedClip,
        placedClipByIndex,
        groupByPath,
        parentByIndex,
        effectiveMaterials,
        holesByIndex,
        aperture,
        materialPieces,
        pushThroughPieces,
        standoffPieces,
        backlightPieces,
        extraFacePieces,
        faceVinylPieces,
        reference,
        autoFixings,
        placementXf,
        manualFixings,
        fixings,
        cableHoles,
        cableHoleDiameter,
        fixingDiameter,
        mode,
        keyline,
        keylineClip,
        pushThroughKeyline,
        pushThroughIslands,
        sectionExport,
        apertureBySection,
        keylineBySection,
        pushThroughKeylineBySection,
        pushThroughIslandsBySection,
        fixingsBySection,
        cableHolesBySection,
        referenceBySection,
        apertureHoles,
        apertureHolesBySection,
        faceRectMm,
        vinylPrintDataUrl,
        faceVinylPrintDataUrl,
        bundle,
        pdfData,
    };
}
