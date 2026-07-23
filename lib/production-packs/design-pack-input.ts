/**
 * Build a {@link DesignPackInput} from a finished visualiser design's derived
 * pieces — the shared core behind BOTH "Production pack" entry points:
 *
 *   - the visualiser ExportBar (live editing), and
 *   - the design-request inbox (re-deriving a customer's submitted design).
 *
 * It splits ONE sign into its buildable pieces (aluminium tray, push-through
 * letters, opal backing, face-stuck acrylic, metal faces, stood-off letters,
 * cut/printed vinyl …) and lays each out as a works-pack group: a filled
 * material-colour drawing + its nested cut layout, the spec, construction
 * callouts and that piece's REAL department route (added downstream by
 * {@link buildPackFromDesignPieces}). The in-situ render + whole-sign face form
 * the overview hero.
 *
 * Pure + framework-neutral (no 'use server'/'use client', no DB, no React, no
 * scene) — the caller supplies the derived pieces (where the geometry / nest /
 * display builders live) plus an in-situ image + client logo, both already
 * captured. Unit-testable.
 */

import {
    buildFilledSvg,
    buildRectSvg,
    type DisplayLayer,
} from '@/lib/visualiser/piece-display';
import { buildNestedSheets } from '@/lib/visualiser/pack-nest';
import {
    buildPanelDevelopmentSvg,
    composeTrayHoles,
} from '@/lib/visualiser/panel-cut-svg';
import { acrylicByHex } from '@/lib/visualiser/acrylic';
import { FACE_MATERIALS } from '@/lib/visualiser/extra-face';
import { panelDimensionBreakdown } from './panel-dimensions';
import {
    type PanelParams,
    type FlatPath,
    type SectionedExport,
    type MaterialPiece,
    type StandoffPiece,
    type PushThroughPiece,
    type ExtraFacePiece,
    type FaceMaterial,
} from '@/lib/visualiser/types';
import {
    type DesignPackInput,
    type DesignPieceGroup,
    type PackDrawing,
} from './from-design';

/**
 * The derived pieces + per-section cut arrays a finished sign breaks down into
 * — exactly the outputs of the visualiser's `usePanelDerivation`. Both callers
 * already hold these (the ExportBar from the live panel; the design-request
 * surface from re-deriving the saved params), so the builder stays scene-free.
 */
export interface DesignPackPieceData {
    params: PanelParams;
    sectionExport: SectionedExport;
    apertureBySection: FlatPath[][];
    apertureHolesBySection: FlatPath[][];
    /**
     * The global keyline (from `params.keylineMm`), per section. When present it
     * SUPERSEDES the raw aperture on the tray cut (the wider halo groove IS the
     * face opening), matching the production cut PDF — so it must reach the pack.
     */
    keylineBySection: FlatPath[][];
    pushThroughKeylineBySection: FlatPath[][];
    pushThroughIslandsBySection: FlatPath[][];
    fixingsBySection: FlatPath[][];
    cableHolesBySection: FlatPath[][];
    vinylPieces: MaterialPiece[];
    acrylicPieces: MaterialPiece[];
    solidPieces: MaterialPiece[];
    backlightPieces: MaterialPiece[];
    standoffPieces: StandoffPiece[];
    pushThroughPieces: PushThroughPiece[];
    extraFacePieces: ExtraFacePiece[];
    vinylPrintDataUrl: string | null;
}

export interface DesignPackImages {
    /** Clean "as installed" in-situ render (PNG data URI), or null. */
    insituDataUri: string | null;
    /** Client logo (SVG data URI) for the cover header, or null. */
    logoDataUri: string | null;
}

/**
 * Merge a projecting sign's pack input into the main fascia's — for two-item
 * jobs (a flat fascia + a blade/projecting sign). The projecting sign is a
 * separate physical sign, so its pieces become additional pack sections (titled
 * "Projecting sign · …") and its whole-sign face joins the overview hero. The
 * cover, overall spec and assembly order stay the main fascia's; the projecting
 * sign's own spec rides on its piece sections. Build the projecting input with
 * `insituDataUri: null` so the overview keeps a single in-situ render.
 */
export function appendProjectingSign(
    main: DesignPackInput,
    projecting: DesignPackInput,
): DesignPackInput {
    return {
        ...main,
        overviewDrawings: [
            ...main.overviewDrawings,
            ...projecting.overviewDrawings
                .filter((d) => d.kind === 'technical')
                .map((d) => ({ ...d, caption: 'Projecting sign — face' })),
        ],
        groups: [
            ...main.groups,
            ...projecting.groups.map((g) => ({
                ...g,
                title: `Projecting sign · ${g.title}`,
            })),
        ],
    };
}

export function buildDesignPackInput(
    d: DesignPackPieceData,
    images: DesignPackImages,
): DesignPackInput {
    const {
        params,
        sectionExport,
        apertureBySection,
        apertureHolesBySection,
        keylineBySection,
        pushThroughKeylineBySection,
        pushThroughIslandsBySection,
        fixingsBySection,
        cableHolesBySection,
        vinylPieces,
        acrylicPieces,
        solidPieces,
        backlightPieces,
        standoffPieces,
        pushThroughPieces,
        extraFacePieces,
        vinylPrintDataUrl,
    } = d;
    const { insituDataUri, logoDataUri } = images;

    const svgUri = (svg: string) =>
        `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    const round = (n: number) => Math.round(n);
    const w = params.panelWidthMm;
    const h = params.panelHeightMm;
    const keyline = !!params.illumination?.keyline?.enabled;
    // A global keyline actually emitted geometry this section-set (offset > 0,
    // apertures present). Distinct from the `keyline` toggle: an enabled toggle
    // with no aperture produces nothing to cut.
    const hasGlobalKeyline = keylineBySection.some((a) => a.length > 0);
    const illuminated = keyline || backlightPieces.length > 0;
    const panelColor = params.panelColor ?? '#c8ccce';
    const acrylicName = (hex: string) => {
        const a = acrylicByHex(hex);
        return a ? `${a.brand} ${a.code ?? a.name}` : hex.toUpperCase();
    };

    // A filled drawing (material colour, holes punched, contrast bg) → a
    // dimensioned technical block.
    const filledDrawing = (
        layers: DisplayLayer[],
        caption: string,
        background?: string | null,
    ): PackDrawing => {
        const f = buildFilledSvg({ layers, background, title: caption });
        return {
            dataUri: svgUri(f.svg),
            isSvg: true,
            kind: 'technical',
            caption,
            widthMm: f.widthMm,
            heightMm: f.heightMm,
        };
    };

    // A nested cut LAYOUT (run on the spot) — filled in the material colour,
    // cropped to the smallest panel — one dimensioned drawing per panel.
    const nestedDrawings = (
        pieces: { path: FlatPath; holes?: FlatPath[] }[],
        label: string,
        fill: string,
    ): PackDrawing[] => {
        const nest = buildNestedSheets(pieces, {
            label,
            title: `${params.name} — ${label}`,
            fill,
        });
        return nest.sheets.slice(0, 3).map((sheet, i) => ({
            dataUri: svgUri(sheet.svg),
            isSvg: true,
            kind: 'technical' as const,
            caption:
                nest.sheetCount > 1
                    ? `Nested cut layout — panel ${i + 1} of ${nest.sheetCount}`
                    : 'Nested cut layout',
            widthMm: sheet.widthMm,
            heightMm: sheet.heightMm,
        }));
    };

    // The nested cut layout where possible (filled), else the un-nested
    // filled display — so a piece always has a drawing.
    const nestedOrFilled = (
        pieces: { path: FlatPath; holes?: FlatPath[]; color: string }[],
        label: string,
        fill: string,
        fallbackCaption: string,
    ): PackDrawing[] => {
        const nested = nestedDrawings(pieces, label, fill);
        return nested.length > 0
            ? nested
            : [filledDrawing([{ pieces, fill }], fallbackCaption)];
    };

    const groups: DesignPieceGroup[] = [];

    // The whole-sign FACE, filled in real material colours on the panel
    // colour — reused on the overview hero and the tray section so the
    // printed pack reads in colour, not hairline outlines.
    const faceLayers: DisplayLayer[] = [
        ...solidPieces.map((p) => ({ pieces: [p], fill: p.color })),
        ...backlightPieces.map((p) => ({ pieces: [p], fill: p.color })),
        ...acrylicPieces.map((p) => ({ pieces: [p], fill: p.color })),
        ...pushThroughPieces.map((p) => ({ pieces: [p], fill: p.color })),
        ...standoffPieces.map((p) => ({ pieces: [p], fill: p.color })),
        ...vinylPieces.map((p) => ({ pieces: [p], fill: p.color })),
        ...extraFacePieces.map((p) => ({ pieces: [p], fill: p.color })),
    ];
    const faceDrawing =
        faceLayers.length > 0
            ? filledDrawing(faceLayers, 'Whole sign — face', panelColor)
            : null;

    // 1. The aluminium tray — always present; the carcass everything mounts
    // to. Its drawing is the UNFOLDED flat blank (the developed cruciform with
    // every ring cut through the face + the bend lines) — the real sheet-metal
    // cut file, not the assembled face art. The face holes come from the shared
    // composeTrayHoles authority (keyline supersedes aperture, counters excluded
    // — see that helper), so the pack and the production ZIP never disagree.
    const holesBySection = composeTrayHoles({
        sectionCount: sectionExport.sections.length,
        apertureBySection,
        keylineBySection,
        pushThroughKeylineBySection,
        pushThroughIslandsBySection,
        fixingsBySection,
        cableHolesBySection,
    });
    const trayCut = buildPanelDevelopmentSvg({
        sectionExport,
        holesBySection,
        panelColor,
        title: `${params.name} — tray`,
    });
    const apertureNote =
        backlightPieces.length > 0
            ? `${backlightPieces.length} backlit aperture${backlightPieces.length === 1 ? '' : 's'} cut in the face`
            : null;
    // Clear face-vs-unfolded-blank-vs-shadow-gap dimension breakdown, plus
    // the fold deduction + the developed (flat) face size.
    const dev0 = sectionExport.sections[0]?.development;
    const trayDims = panelDimensionBreakdown({
        faceWmm: w,
        faceHmm: h,
        blankWmm: trayCut.widthMm,
        blankHmm: trayCut.heightMm,
        faceFlatWmm: dev0?.faceFlatWMm,
        faceFlatHmm: dev0?.faceFlatHMm,
        returnDepthMm: params.returnDepthMm,
        shadowGapMm: params.shadowGapMm ?? 0,
        shadowGapEdges: params.shadowGapEdges,
        materialLabel: params.materialLabel ?? 'Folded aluminium',
        gaugeMm: params.materialThicknessMm,
        colour: params.panelRal ?? params.panelColor ?? '',
    });
    groups.push({
        kind: 'panel',
        title: 'Aluminium tray',
        count: 1,
        thicknessMm: params.materialThicknessMm,
        painted: !!(params.panelRal || params.panelColor),
        specRows: trayDims.specRows,
        callouts: [
            ...trayDims.callouts,
            'Folded aluminium tray — cut the flat blank, fold on the dashed lines.',
            ...(apertureNote ? [apertureNote] : []),
        ],
        drawings: [
            {
                dataUri: svgUri(trayCut.svg),
                isSvg: true,
                kind: 'technical',
                caption: `Unfolded flat blank — ${trayCut.widthMm} × ${trayCut.heightMm} mm (cut & fold)`,
                widthMm: trayCut.widthMm,
                heightMm: trayCut.heightMm,
            },
        ],
    });

    const byStock = <T extends { color: string; thicknessMm?: number }>(
        pieces: T[],
    ): Map<string, T[]> => {
        const m = new Map<string, T[]>();
        for (const p of pieces) {
            const key = `${p.color}|${p.thicknessMm ?? 0}`;
            (m.get(key) ?? m.set(key, []).get(key)!).push(p);
        }
        return m;
    };

    // 2. Push-through letters — one section per acrylic stock.
    for (const [key, pieces] of byStock(pushThroughPieces)) {
        const [color] = key.split('|');
        const t = pieces[0].thicknessMm;
        groups.push({
            kind: 'pushthrough',
            title: `Push-through letters — ${acrylicName(color)}`,
            count: pieces.length,
            thicknessMm: t,
            specRows: [
                { label: 'Acrylic', value: acrylicName(color) },
                { label: 'Thickness', value: `${t}mm` },
                { label: 'Keyline shoulder', value: `${pieces[0].keylineOffsetMm}mm` },
            ],
            callouts: [
                'Pressed through the tray face from behind',
                'Each counter is a separate piece bonded to the backing',
                illuminated
                    ? 'Opal backing behind for the keyline halo'
                    : 'Bonded to a backing board',
            ],
            drawings: nestedOrFilled(
                pieces,
                'push-through',
                color,
                `Push-through — ${acrylicName(color)}`,
            ),
        });
    }

    // 2b. Illuminated-acrylic INSERTS for a legacy global-keyline sign (keyline
    // on, letters cut as apertures, no explicit push-through group). The
    // production cut PDF emits these on its insert page; without this section
    // they had no pack counterpart and no cut file — the acrylic that presses
    // into the keyline openings would be missing on the floor. Guarded on "no
    // push-through pieces" so a sign that has BOTH doesn't double up.
    if (hasGlobalKeyline && pushThroughPieces.length === 0) {
        const insertPieces = [
            ...apertureBySection.flat(),
            ...apertureHolesBySection.flat(),
        ].map((path) => ({ path, color: '#f5f5f0' }));
        if (insertPieces.length > 0) {
            groups.push({
                kind: 'pushthrough',
                title: 'Illuminated acrylic inserts',
                count: apertureBySection.flat().length,
                specRows: [
                    { label: 'Material', value: 'Opal / clear acrylic' },
                    {
                        label: 'Keyline shoulder',
                        value: `${params.keylineMm ?? 0}mm`,
                    },
                ],
                callouts: [
                    'Cut the letter faces (and counters as separate pieces) from acrylic',
                    'Press into the keyline openings from behind; light halos the shoulder',
                ],
                drawings: nestedOrFilled(
                    insertPieces,
                    'keyline-inserts',
                    '#f5f5f0',
                    'Illuminated acrylic inserts',
                ),
            });
        }
    }

    // 3. Opal backing — the shared diffuser, cut as a single rectangle. Any
    // illuminated construction needs it: push-through, backlit, OR a global
    // keyline halo (previously the keyline-only sign silently shipped none).
    if (
        illuminated &&
        (pushThroughPieces.length > 0 ||
            backlightPieces.length > 0 ||
            hasGlobalKeyline)
    ) {
        const lit = [...pushThroughPieces, ...backlightPieces];
        // Rectangle = lit-area bounding box + a 40mm overlap margin. The lit
        // area spans the material pieces AND (for a keyline-only sign) the
        // global keyline contours, so the diffuser covers the openings.
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const eat = (pts: Array<[number, number]>) => {
            for (const [x, y] of pts) {
                if (x < minX) minX = x; if (y < minY) minY = y;
                if (x > maxX) maxX = x; if (y > maxY) maxY = y;
            }
        };
        for (const p of lit) eat(p.path.points);
        for (const arr of keylineBySection) for (const p of arr) eat(p.points);
        const margin = 40;
        const rectW = Number.isFinite(minX) ? maxX - minX + margin * 2 : w;
        const rectH = Number.isFinite(minY) ? maxY - minY + margin * 2 : h;
        const litCount = lit.length || keylineBySection.flat().length;
        const rect = buildRectSvg({ widthMm: rectW, heightMm: rectH, title: 'Opal backing' });
        groups.push({
            kind: 'opalBacking',
            title: 'Opal backing & lighting',
            count: 1,
            specRows: [
                { label: 'Diffuser', value: 'Opal acrylic backing' },
                { label: 'Sheet size', value: `${round(rectW)} × ${round(rectH)}mm` },
                { label: 'Illumination', value: keyline ? 'Keyline halo' : 'Backlit' },
                { label: 'Lit pieces', value: `${litCount} shape${litCount === 1 ? '' : 's'}` },
            ],
            callouts: [
                'Single opal rectangle behind the illuminated pieces',
                'LEDs mounted on the backing — build the wiring in the LED layout tool',
                keyline
                    ? 'Light escapes through the keyline shoulder as a halo'
                    : 'Light glows through the cut aperture',
            ],
            drawings: [
                {
                    dataUri: svgUri(rect.svg),
                    isSvg: true,
                    kind: 'technical',
                    caption: 'Opal backing — cut rectangle',
                    widthMm: rect.widthMm,
                    heightMm: rect.heightMm,
                },
            ],
        });
    }

    // 4. Face-stuck acrylic — one section per stock.
    for (const [key, pieces] of byStock(acrylicPieces)) {
        const [color] = key.split('|');
        const t = pieces[0].thicknessMm;
        groups.push({
            kind: 'acrylic',
            title: `Face-stuck acrylic — ${acrylicName(color)}`,
            count: pieces.length,
            thicknessMm: t,
            specRows: [
                { label: 'Acrylic', value: acrylicName(color) },
                ...(t ? [{ label: 'Thickness', value: `${t}mm` }] : []),
            ],
            callouts: ['Face-stuck to the tray', 'Weeded & applied'],
            drawings: nestedOrFilled(
                pieces,
                'acrylic',
                color,
                `Acrylic — ${acrylicName(color)}`,
            ),
        });
    }

    // 5. Stood-off lettering — one section per stock (typically painted).
    for (const [key, pieces] of byStock(standoffPieces)) {
        const [color] = key.split('|');
        const t = pieces[0].thicknessMm;
        const dist = pieces[0].standoffDistanceMm;
        groups.push({
            kind: 'standoff',
            title: 'Stood-off letters',
            count: pieces.length,
            thicknessMm: t,
            painted: true,
            specRows: [
                { label: 'Material', value: acrylicName(color) },
                { label: 'Thickness', value: `${t}mm` },
                { label: 'Stand-off', value: `${round(dist)}mm` },
            ],
            callouts: [
                `Stood ${round(dist)}mm off the face on locators`,
                'Fixing holes drilled in the tray face',
            ],
            drawings: nestedOrFilled(pieces, 'stand-off', color, 'Stood-off letters'),
        });
    }

    // 6. Metal faces — one section per finish (brass / stainless / …).
    const byMetal = new Map<FaceMaterial, ExtraFacePiece[]>();
    for (const p of extraFacePieces) {
        (byMetal.get(p.material) ?? byMetal.set(p.material, []).get(p.material)!).push(p);
    }
    for (const [material, pieces] of byMetal) {
        const label = FACE_MATERIALS[material].label;
        groups.push({
            kind: 'extraFace',
            title: `${label} faces`,
            count: pieces.length,
            thicknessMm: pieces[0].thicknessMm,
            specRows: [
                { label: 'Material', value: label },
                { label: 'Thickness', value: `${pieces[0].thicknessMm}mm` },
            ],
            callouts: [
                `${label} face laminated over the letter`,
                'Same outline + counters as the letter beneath',
            ],
            drawings: nestedOrFilled(
                pieces,
                `${material}-faces`,
                pieces[0].color,
                `${label} faces`,
            ),
        });
    }

    // 7. Vinyl — printed (digital print) vs cut (spot colour).
    const printedVinyl = vinylPieces.filter((p) => p.fullColor);
    const cutVinyl = vinylPieces.filter((p) => !p.fullColor);
    if (printedVinyl.length > 0) {
        groups.push({
            kind: 'vinylPrint',
            title: 'Printed vinyl graphics',
            count: printedVinyl.length,
            specRows: [
                { label: 'Process', value: 'Full-colour digital print' },
                { label: 'Finish', value: 'Printed, laminated & cut' },
            ],
            callouts: ['Full-colour print', 'Laminated, weeded & applied to the face'],
            // The printed-vinyl raster IS the artwork — show it with its real
            // print texture when we have it, else a filled representation.
            drawings: vinylPrintDataUrl
                ? [{ dataUri: vinylPrintDataUrl, isSvg: false, kind: 'visual', caption: 'Printed vinyl artwork' }]
                : [filledDrawing(printedVinyl.map((p) => ({ pieces: [p], fill: p.color })), 'Printed vinyl', panelColor)],
        });
    }
    if (cutVinyl.length > 0) {
        const byColor = byStock(cutVinyl);
        const cutLayers = [...byColor].map(([key, pieces]) => ({
            pieces,
            fill: key.split('|')[0],
        }));
        groups.push({
            kind: 'vinylCut',
            title: 'Cut vinyl graphics',
            count: cutVinyl.length,
            specRows: [{ label: 'Process', value: 'Spot-colour cut vinyl' }],
            callouts: ['Plotter-cut spot-colour vinyl', 'Weeded & applied'],
            drawings: [filledDrawing(cutLayers, 'Cut vinyl', panelColor)],
        });
    }

    const overviewDrawings: PackDrawing[] = [];
    if (insituDataUri) {
        overviewDrawings.push({
            dataUri: insituDataUri,
            isSvg: false,
            kind: 'visual',
            caption: 'In-situ — as installed',
        });
    }
    if (faceDrawing) overviewDrawings.push({ ...faceDrawing, caption: 'Whole sign — face' });

    const ledNote = illuminated
        ? 'Build the LED module layout & wiring in the LED layout tool, then attach the wiring PDF.'
        : null;

    return {
        name: params.name || 'Sign',
        logoDataUri,
        overallSpecRows: [
            { label: 'Face size (visible front)', value: `${round(w)} × ${round(h)} mm` },
            { label: 'Unfolded flat blank (cut size)', value: `${trayCut.widthMm} × ${trayCut.heightMm} mm` },
            { label: 'Return depth', value: `${round(params.returnDepthMm)} mm` },
            ...((params.shadowGapMm ?? 0) > 0
                ? [{ label: 'Shadow gap', value: `${round(params.shadowGapMm)} mm` }]
                : []),
            { label: 'Tray material', value: params.materialLabel ?? 'Folded aluminium' },
            { label: 'Panel colour', value: params.panelRal ?? params.panelColor ?? '' },
            {
                label: 'Illumination',
                value: illuminated
                    ? keyline ? 'Keyline illuminated' : 'Backlit'
                    : 'Non-illuminated',
            },
            { label: 'Fixing', value: '' },
        ],
        overviewDrawings,
        groups,
        ledToolNote: ledNote,
    };
}
