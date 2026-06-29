'use client';

import { useEffect, useState, useTransition } from 'react';
import {
    AlertTriangle,
    Check,
    CheckCircle2,
    FileText,
    Loader2,
    Save,
    Scissors,
    Tv,
    Layers,
    FileBox,
    BadgeCheck,
    Archive,
    FileDown,
} from 'lucide-react';
import { useVisualiser, splitPanels } from './store';
import { sceneCapture } from './Scene3D';
import { MockupGenerator } from './MockupGenerator';
import {
    generateReferencePdfBlob,
    generateProductionPdfBlob,
    pdfFilename,
    type PdfOptions,
} from '@/lib/visualiser/pdf';
import { saveDesign } from '@/lib/visualiser/actions';
import { addToBackshop, isDesignOnBackshop } from '@/lib/backshop/actions';
import { createProductionPackFromContent } from '@/lib/production-packs/actions';
import {
    buildPackFromDesignPieces,
    type DesignPieceGroup,
    type DesignPackInput,
    type PackDrawing,
} from '@/lib/production-packs/from-design';
import { panelDimensionBreakdown } from '@/lib/production-packs/panel-dimensions';
import { createVisualApprovalFromDesign } from '@/lib/artwork/visual-approval-actions';
import { acrylicByHex } from '@/lib/visualiser/acrylic';
import {
    buildFilledSvg,
    buildRectSvg,
    type DisplayLayer,
} from '@/lib/visualiser/piece-display';
import { buildNestedSheets, nestedSheetGeometry } from '@/lib/visualiser/pack-nest';
import { buildPanelDevelopmentSvg, developmentGeometry } from '@/lib/visualiser/panel-cut-svg';
import {
    cutToSvg,
    cutToDxf,
    type CutGeometry,
    type Ring,
} from '@/lib/visualiser/cut-export';
import { cutToPdf } from '@/lib/visualiser/cut-pdf';
import { buildSheetSvg } from '@/lib/nesting/svg-export';
import { buildSheetDxf } from '@/lib/nesting/dxf';
import { createZip, type ZipEntry } from '@/lib/visualiser/zip';
import { getDesignBinderLogo } from '@/lib/binder/actions';
import { projectingSpecLine } from '@/lib/visualiser/projecting';
import { composeLayersSvg } from '@/lib/visualiser/compose';
import { trimImageDataUrl } from '@/lib/visualiser/image';
import {
    PanelParamsSchema,
    type PanelParams,
    type PanelPdfData,
    type FlatPath,
    type SectionedExport,
    type ExportWarning,
    type MaterialPiece,
    type StandoffPiece,
    type PushThroughPiece,
    type ExtraFacePiece,
    type FaceMaterial,
} from '@/lib/visualiser/types';
import { FACE_MATERIALS } from '@/lib/visualiser/extra-face';
import { buildExtraFaceNestSvg } from '@/lib/visualiser/extra-face-export';
import { buildNestSvg } from '@/lib/visualiser/nest-export';
import {
    sendDesignNest,
    getNestsForDesign,
} from '@/lib/visualiser/extra-face-actions';
import { embedNests, type EmbeddedNest } from '@/lib/visualiser/nest-embed';

const ACCENT = '#4e7e8c';
const ACCENT_DARK = '#3a5f6a';

function download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    // A DETACHED anchor's click() silently no-ops in Chrome for a large blob
    // built outside the click's gesture window (the small zip worked because it
    // built fast; the full SVG+DXF+PDF zip doesn't). An in-DOM click is the
    // reliable trigger. Append + click + remove in ONE synchronous tick so
    // React never observes the node between commits — leaving it parented (the
    // previous 1.5s window) is what tripped React 19 reconciliation (#418 / the
    // $RS parentNode crash). The download is already in flight after click(), so
    // removing the anchor immediately is safe; only the blob URL must outlive
    // the browser reading it, so revoke that later.
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Blob → bare base64 (no data-URL prefix) for sending to a server action. */
function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const res = (reader.result as string) ?? '';
            const comma = res.indexOf(',');
            resolve(comma >= 0 ? res.slice(comma + 1) : res);
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

/**
 * Finished-state checklist — one-glance "am I ready to export?".
 * Reads the param-level validity, the path count, and any warnings to
 * tell the operator what's done and what they should double-check
 * before sending the PDF to the cutter.
 */
function ReadyChecklist({
    geometryOk,
    pathCount,
    warningCount,
}: {
    geometryOk: boolean;
    pathCount: number;
    warningCount: number;
}) {
    const items: Array<{ ok: boolean; warn?: boolean; label: string }> = [
        {
            ok: geometryOk,
            label: geometryOk
                ? 'Geometry valid'
                : 'Geometry invalid — check dimensions',
        },
        {
            ok: pathCount > 0,
            label:
                pathCount > 0
                    ? `${pathCount} artwork path${pathCount === 1 ? '' : 's'} assigned`
                    : 'No artwork uploaded yet',
        },
        {
            ok: warningCount === 0,
            warn: warningCount > 0,
            label:
                warningCount === 0
                    ? 'No advisory warnings'
                    : `${warningCount} advisory warning${warningCount === 1 ? '' : 's'} — review before export`,
        },
    ];
    return (
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-600">
            {items.map((it, i) => {
                const Icon = it.ok
                    ? CheckCircle2
                    : it.warn
                      ? AlertTriangle
                      : AlertTriangle;
                const color = it.ok
                    ? 'text-emerald-600'
                    : it.warn
                      ? 'text-amber-600'
                      : 'text-neutral-400';
                return (
                    <li key={i} className="flex items-center gap-1">
                        <Icon size={12} className={color} aria-hidden />
                        <span>{it.label}</span>
                    </li>
                );
            })}
        </ul>
    );
}

export function ExportBar({
    sectionExport,
    apertureBySection,
    keylineBySection,
    pushThroughKeylineBySection,
    pushThroughIslandsBySection,
    fixingsBySection,
    cableHolesBySection,
    referenceBySection,
    apertureHolesBySection,
    vinylPieces,
    acrylicPieces,
    solidPieces,
    standoffPieces,
    pushThroughPieces,
    backlightPieces,
    extraFacePieces,
    vinylPrintDataUrl = null,
    faceRectMm = null,
    warnings = [],
    pathCount = 0,
    companionPdf = null,
    mainIsActive = true,
    projectingSummary = null,
}: {
    sectionExport: SectionedExport;
    apertureBySection: FlatPath[][];
    keylineBySection: FlatPath[][];
    pushThroughKeylineBySection: FlatPath[][];
    pushThroughIslandsBySection: FlatPath[][];
    fixingsBySection: FlatPath[][];
    cableHolesBySection: FlatPath[][];
    referenceBySection: FlatPath[][];
    apertureHolesBySection: FlatPath[][];
    vinylPieces: MaterialPiece[];
    acrylicPieces: MaterialPiece[];
    solidPieces: MaterialPiece[];
    standoffPieces: StandoffPiece[];
    pushThroughPieces: PushThroughPiece[];
    /** Backlit apertures — for the opal-backing + LED pages in the PDFs. */
    backlightPieces: MaterialPiece[];
    /** Extra metal faces (brass/…) — for the "send metal faces to nester"
     *  hand-off. Empty when no group opted into a face. */
    extraFacePieces: ExtraFacePiece[];
    /** Full-colour vinyl print PNG (face-sized, masked) + the face rect it
     *  maps onto — for the print-&-cut PDF pages. */
    vinylPrintDataUrl?: string | null;
    faceRectMm?: { x: number; y: number; w: number; h: number } | null;
    warnings?: ExportWarning[];
    /** Total imported artwork paths (used for the ready checklist). */
    pathCount?: number;
    /** The OTHER sign's cached PDF data, for a two-item (fascia+projecting) job. */
    companionPdf?: PanelPdfData | null;
    /** True when the active/primary panel is the main fascia. */
    mainIsActive?: boolean;
    /** One-line projecting-sign + mount summary for the reference overview. */
    projectingSummary?: string | null;
}) {
    const {
        params,
        svgSource,
        imported,
        designId,
        quoteId,
        quoteItemId,
        dirty,
        markSaved,
        activeTab,
        projectingEnabled,
        inactive,
        mount,
        setCaptureClean,
    } = useVisualiser();

    // Flatten a panel's artwork layers into a single aperture SVG, falling
    // back to its raw uploaded SVG when there are no layers.
    const flattenSvg = (
        p: { artworkLayers?: PanelParams['artworkLayers']; panelWidthMm: number; panelHeightMm: number },
        raw: string | null,
    ): string | null => {
        const layers = p.artworkLayers ?? [];
        return layers.length
            ? composeLayersSvg(layers, p.panelWidthMm, p.panelHeightMm)
            : raw;
    };

    /**
     * Assemble the full design for persistence regardless of which tab is
     * live: the main panel is the row's params (with the projecting blade
     * nested inside projectingSign), the blade carries its own flattened svg.
     */
    const assembleMain = (): { params: PanelParams; svgSource: string | null } => {
        const { main, projecting } = splitPanels({
            activeTab,
            projectingEnabled,
            params,
            svgSource,
            imported,
            inactive,
        });
        const mainSvg = flattenSvg(main.params, main.svgSource);
        let projectingSign: PanelParams['projectingSign'];
        if (projecting) {
            const bladeCore = { ...projecting.params };
            delete (bladeCore as { projectingSign?: unknown }).projectingSign;
            projectingSign = {
                panel: bladeCore,
                mount,
                svgSource: flattenSvg(projecting.params, projecting.svgSource),
            };
        }
        return {
            params: { ...main.params, projectingSign },
            svgSource: mainSvg,
        };
    };

    // Two-item PDF fields. When the design has a projecting sign, both PDFs
    // cover BOTH items: every page is labelled with the item name and the
    // OTHER sign rides along as `secondary`. The projecting-sign + mount
    // summary (companionNote) sits on the FASCIA's overview.
    const twoItem: Partial<PdfOptions> = companionPdf
        ? {
              itemLabel: mainIsActive ? 'Main fascia' : 'Projecting sign',
              companionNote: mainIsActive
                  ? (projectingSummary ?? undefined)
                  : undefined,
              secondary: {
                  ...companionPdf,
                  itemLabel: mainIsActive ? 'Projecting sign' : 'Main fascia',
                  companionNote: mainIsActive
                      ? undefined
                      : (projectingSummary ?? undefined),
              },
          }
        : {};

    const [savePending, startSaveTransition] = useTransition();
    const [pdfPending, setPdfPending] = useState<'prod' | 'ref' | null>(null);
    const [backshopPending, setBackshopPending] = useState(false);
    const [onBackshop, setOnBackshop] = useState(false);
    const [nesterPending, setNesterPending] = useState(false);
    const [zipPending, setZipPending] = useState(false);
    const [packPending, setPackPending] = useState<
        'prod' | 'approval' | 'pdf' | null
    >(null);
    const [msg, setMsg] = useState<string | null>(null);
    const [exported, setExported] = useState<string | null>(null);

    // Is the current design already on the board? Drives the Add / Update
    // label. Re-checked whenever the loaded design changes.
    useEffect(() => {
        let cancelled = false;
        if (!designId) {
            setOnBackshop(false);
            return;
        }
        isDesignOnBackshop(designId).then((on) => {
            if (!cancelled) setOnBackshop(on);
        });
        return () => {
            cancelled = true;
        };
    }, [designId]);

    const valid = PanelParamsSchema.safeParse(params);

    // Clear the "exported" success chip after a few seconds so it
    // doesn't linger across the operator's next action.
    useEffect(() => {
        if (!exported) return;
        const id = setTimeout(() => setExported(null), 4500);
        return () => clearTimeout(id);
    }, [exported]);

    // Pull the design's saved nests and reproduce their packed sheets, so the
    // PDFs can render the actual cut nests. Empty when the design isn't saved
    // (no link) or has no nests.
    const loadEmbeddedNests = async (): Promise<EmbeddedNest[]> => {
        if (!designId) return [];
        const res = await getNestsForDesign(designId);
        if (!res.ok) return [];
        return embedNests(res.data);
    };

    const onReferencePdf = async () => {
        if (pdfPending) return;
        setPdfPending('ref');
        try {
            const thumb = sceneCapture.fn?.() ?? undefined;
            const embeddedNests = await loadEmbeddedNests();
            const blob = await generateReferencePdfBlob({
                sectionExport,
                params,
                designId: designId ?? null,
                apertureBySection,
                keylineBySection,
                pushThroughKeylineBySection,
                pushThroughIslandsBySection,
                fixingsBySection,
                cableHolesBySection,
                referenceBySection,
                vinylPieces,
                acrylicPieces,
                solidPieces,
                standoffPieces,
                pushThroughPieces,
                backlightPieces,
                vinylPrintDataUrl,
                faceRectMm,
                thumbnailDataUrl: thumb || undefined,
                embeddedNests,
                ...twoItem,
            });
            const fname = pdfFilename(params, 'reference');
            download(blob, fname);
            setExported(`Reference PDF · ${fname}`);
        } finally {
            setPdfPending(null);
        }
    };

    // Pieces that nest like acrylic: the extra metal faces and the face-stuck
    // acrylic. Each distinct material becomes its own nest (separate sheet
    // stock can't share a sheet).
    const nestableCount = extraFacePieces.length + acrylicPieces.length;

    // Send all nestable pieces to the acrylic nester as linked nests — one per
    // material (each metal finish; each acrylic colour+thickness). Saves the
    // design first (the nests link back to it), then opens the nester on the
    // first nest created. Mirrors the built-up-returns handoff.
    const onSendToNester = async () => {
        if (nesterPending || nestableCount === 0) return;
        setNesterPending(true);
        setMsg(null);
        try {
            // 1. Ensure the design is saved — the nests link back to its id.
            let id = designId;
            if (!id || dirty) {
                const assembled = assembleMain();
                const saved = await saveDesign({
                    id: designId ?? undefined,
                    params: assembled.params,
                    svgSource: assembled.svgSource,
                    quoteId,
                    quoteItemId,
                });
                if (!saved.ok) {
                    setMsg(saved.error);
                    return;
                }
                id = saved.data.id;
                markSaved(saved.data.id);
            }

            // 2. One nest spec per material.
            const specs: Array<{
                combinedSvg: string;
                nestLabel: string;
                sourceKind: string;
                fileName: string;
            }> = [];

            // Metal faces — grouped by finish.
            const byMetal = new Map<FaceMaterial, ExtraFacePiece[]>();
            for (const p of extraFacePieces) {
                const arr = byMetal.get(p.material) ?? [];
                arr.push(p);
                byMetal.set(p.material, arr);
            }
            for (const [material, pieces] of byMetal) {
                const label = `${FACE_MATERIALS[material].label} faces`;
                specs.push({
                    combinedSvg: buildExtraFaceNestSvg({
                        pieces,
                        material,
                        title: `${params.name} — ${label}`,
                    }),
                    nestLabel: label,
                    sourceKind: 'panel_extra_face',
                    fileName: `${params.name}-${material}-faces.svg`,
                });
            }

            // Acrylic — grouped by colour + thickness (distinct stock).
            const byAcrylic = new Map<string, MaterialPiece[]>();
            for (const p of acrylicPieces) {
                const key = `${p.color}|${p.thicknessMm ?? 0}`;
                const arr = byAcrylic.get(key) ?? [];
                arr.push(p);
                byAcrylic.set(key, arr);
            }
            for (const [key, pieces] of byAcrylic) {
                const [color, thick] = key.split('|');
                const hasThick = thick && thick !== '0';
                const label = `Acrylic ${color}${hasThick ? ` ${thick}mm` : ''}`;
                specs.push({
                    combinedSvg: buildNestSvg(
                        pieces,
                        'ACRYLIC',
                        `${params.name} — ${label}`,
                    ),
                    nestLabel: label,
                    sourceKind: 'panel_acrylic',
                    fileName: `${params.name}-acrylic-${color.replace('#', '')}${hasThick ? `-${thick}mm` : ''}.svg`,
                });
            }

            // 3. Send each, opening the nester on the first.
            let firstNestId: string | null = null;
            for (const spec of specs) {
                const res = await sendDesignNest({
                    designId: id,
                    name: params.name,
                    combinedSvg: spec.combinedSvg,
                    nestLabel: spec.nestLabel,
                    sourceKind: spec.sourceKind,
                    fileName: spec.fileName,
                });
                if (!res.ok) {
                    setMsg(res.error);
                    return;
                }
                if (!firstNestId) firstNestId = res.data.nestId;
            }

            if (firstNestId) {
                window.location.assign(`/admin/nesting?open=${firstNestId}`);
            }
        } finally {
            setNesterPending(false);
        }
    };

    // Ensure the design is persisted (the packs link to a real design id);
    // returns the id, or null on a save error (message already surfaced).
    const ensureSaved = async (): Promise<string | null> => {
        if (designId && !dirty) return designId;
        const assembled = assembleMain();
        const saved = await saveDesign({
            id: designId ?? undefined,
            params: assembled.params,
            svgSource: assembled.svgSource,
            quoteId,
            quoteItemId,
        });
        if (!saved.ok) {
            setMsg(saved.error);
            return null;
        }
        markSaved(saved.data.id);
        return saved.data.id;
    };

    // The design has to actually carry artwork for a pack/approval to mean
    // anything — a bare panel scaffolds an empty document and (for approval) a
    // featureless 3D the client can't review. Guard at the source.
    const designHasArtwork = (): boolean =>
        (params.artworkLayers?.length ?? 0) > 0 ||
        !!(imported && imported.paths.length > 0);

    // Grab a clean, "as installed" in-situ render — flip the scene to
    // annotation-free, let it repaint, capture, then restore. Returns a trimmed
    // PNG data URI (or null if the scene isn't ready).
    const captureCleanInsitu = async (): Promise<string | null> => {
        setCaptureClean(true);
        // Two frames so React commits the annotation-free scene and r3f redraws
        // before we force a render in the capture.
        await new Promise<void>((r) =>
            requestAnimationFrame(() => requestAnimationFrame(() => r())),
        );
        let raw: string | null = null;
        try {
            raw = sceneCapture.fn?.() ?? null;
        } finally {
            setCaptureClean(false);
        }
        if (!raw) return null;
        try {
            return await trimImageDataUrl(raw);
        } catch {
            return raw;
        }
    };

    // Split the live 3D design into its individual production pieces — each its
    // own works-pack section with a filled material-colour drawing, its nested
    // cut file and its department route. Built here (where the derived pieces +
    // nest/display builders live) and handed to the server fully-formed.
    // Returns aren't modelled on a visualiser design (they come from the
    // dedicated built-up-returns tool), so no returns section is synthesised.
    const buildProductionPackInput = async (
        insituDataUri: string | null,
        logoDataUri: string | null,
    ): Promise<DesignPackInput> => {
        const svgUri = (svg: string) =>
            `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
        const round = (n: number) => Math.round(n);
        const w = params.panelWidthMm;
        const h = params.panelHeightMm;
        const keyline = !!params.illumination?.keyline?.enabled;
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
        // to. Its drawing is the UNFOLDED flat blank (the developed cruciform
        // with every ring cut through the face + the bend lines) — the real
        // sheet-metal cut file, not the assembled face art. The counters of
        // aperture letters (apertureHoles) are cut too — they leave an island of
        // panel that the machine cuts first so it stays put; even-odd nesting
        // renders each counter as a solid island inside its letter hole.
        const holesBySection = sectionExport.sections.map((_s, i) => [
            ...(apertureBySection[i] ?? []),
            ...(apertureHolesBySection[i] ?? []),
            ...(pushThroughKeylineBySection[i] ?? []),
            ...(pushThroughIslandsBySection[i] ?? []),
            ...(fixingsBySection[i] ?? []),
            ...(cableHolesBySection[i] ?? []),
        ]);
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

        // 3. Opal backing — the shared diffuser, cut as a single rectangle.
        if (illuminated && (pushThroughPieces.length > 0 || backlightPieces.length > 0)) {
            const lit = [...pushThroughPieces, ...backlightPieces];
            // Rectangle = lit-area bounding box + a 40mm overlap margin.
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const p of lit) for (const [x, y] of p.path.points) {
                if (x < minX) minX = x; if (y < minY) minY = y;
                if (x > maxX) maxX = x; if (y > maxY) maxY = y;
            }
            const margin = 40;
            const rectW = Number.isFinite(minX) ? maxX - minX + margin * 2 : w;
            const rectH = Number.isFinite(minY) ? maxY - minY + margin * 2 : h;
            const rect = buildRectSvg({ widthMm: rectW, heightMm: rectH, title: 'Opal backing' });
            groups.push({
                kind: 'opalBacking',
                title: 'Opal backing & lighting',
                count: 1,
                specRows: [
                    { label: 'Diffuser', value: 'Opal acrylic backing' },
                    { label: 'Sheet size', value: `${round(rectW)} × ${round(rectH)}mm` },
                    { label: 'Illumination', value: keyline ? 'Keyline halo' : 'Backlit' },
                    { label: 'Lit pieces', value: `${lit.length} shape${lit.length === 1 ? '' : 's'}` },
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
    };

    // Build + persist the full per-piece works pack from this design; returns
    // the new pack id (or null on failure, message already surfaced). Shared by
    // the "open in builder" and "download PDF" buttons.
    const buildAndCreatePack = async (): Promise<string | null> => {
        // Persist the design first so the pack can link back to it later.
        const id = await ensureSaved();
        if (!id) return null;
        setMsg('Capturing render…');
        const insitu = await captureCleanInsitu();
        // The client's logo from the binder (if their org has one).
        let logo: string | null = null;
        const logoRes = await getDesignBinderLogo(id);
        if (logoRes.ok && logoRes.data?.svg) {
            logo = `data:image/svg+xml;utf8,${encodeURIComponent(logoRes.data.svg)}`;
        }
        // Nesting can take a beat — tell the operator something's happening.
        setMsg('Nesting pieces & building pack…');
        await new Promise((r) => setTimeout(r, 20));
        const input = await buildProductionPackInput(insitu, logo);
        const content = buildPackFromDesignPieces(input);
        const res = await createProductionPackFromContent({
            name: input.name,
            content,
        });
        if (!res.ok) {
            setMsg(res.error);
            return null;
        }
        return res.data.id;
    };

    // Build the full per-piece works pack from this design and open it.
    const onCreateProductionPack = async () => {
        if (packPending) return;
        if (!designHasArtwork()) {
            setMsg('Add artwork to the panel before creating a production pack.');
            return;
        }
        setPackPending('prod');
        setMsg(null);
        try {
            const id = await buildAndCreatePack();
            if (id) window.location.assign(`/admin/production-packs/${id}`);
        } finally {
            setPackPending(null);
        }
    };

    // Build the pack, then open its print view auto-printing — the browser's
    // "Save as PDF" gives a faithful PDF of the whole works pack (studio
    // template, dimensions, per-piece breakdown). The tab is opened up-front in
    // the click gesture so it isn't popup-blocked, then pointed at the print URL.
    const onDownloadPackPdf = async () => {
        if (packPending) return;
        if (!designHasArtwork()) {
            setMsg('Add artwork to the panel before downloading a pack PDF.');
            return;
        }
        const win = window.open('', '_blank');
        setPackPending('pdf');
        setMsg(null);
        try {
            const id = await buildAndCreatePack();
            if (!id) {
                win?.close();
                return;
            }
            const url = `/admin/production-packs/${id}/print?print=1`;
            if (win) win.location.href = url;
            else window.location.assign(url); // popup blocked → same tab
        } finally {
            setPackPending(null);
        }
    };

    // Export every production CUT file as a .zip — purely the draw files (true
    // mm, hairline cut paths), each as SVG + DXF + PDF, ready to send straight to
    // the machines. No pack chrome: just the tray blank, the nested material
    // sheets, the opal rectangle and the vinyl.
    const onExportProductionZip = async () => {
        if (zipPending) return;
        if (!designHasArtwork()) {
            setMsg('Add artwork to the panel before exporting production files.');
            return;
        }
        setZipPending(true);
        setMsg('Building cut files…');
        try {
            // Let the status paint before the (synchronous) nesting work.
            await new Promise((r) => setTimeout(r, 20));

            const name = params.name || 'sign';
            const safe = (s: string) =>
                s.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'file';
            const folder = safe(name);
            const hex = (c: string) => c.replace('#', '');
            const entries: ZipEntry[] = [];

            const byStock = <T extends { color: string; thicknessMm?: number }>(
                arr: T[],
            ): Map<string, T[]> => {
                const m = new Map<string, T[]>();
                for (const p of arr) {
                    const k = `${p.color}|${p.thicknessMm ?? 0}`;
                    (m.get(k) ?? m.set(k, []).get(k)!).push(p);
                }
                return m;
            };

            // The PDF goes through jsPDF; if a single page ever throws, skip just
            // that PDF rather than losing the whole export (SVG + DXF still go in).
            const pdfEntry = (base: string, geo: CutGeometry) => {
                try {
                    entries.push({ name: `${folder}/${base}.pdf`, data: cutToPdf(geo) });
                } catch (e) {
                    console.error(`pdf export failed for ${base}:`, e);
                }
            };

            // Each cut file goes in as .svg + .dxf + .pdf from the SAME geometry.
            const pushCut = (base: string, geo: CutGeometry) => {
                entries.push({ name: `${folder}/${base}.svg`, data: cutToSvg(geo, base) });
                entries.push({ name: `${folder}/${base}.dxf`, data: cutToDxf(geo) });
                pdfEntry(base, geo);
            };

            // Nested material — two cut files so the cutter can use EITHER:
            //   <label>_laid-out  — the pieces in their as-designed sign
            //                        positions, a reference for how they lay out;
            //   <label>_nested    — packed onto sheets for efficient cutting.
            // Both as SVG + DXF + PDF.
            const pushNest = (
                pieces: { path: FlatPath; holes?: FlatPath[] }[],
                label: string,
            ) => {
                // Laid-out reference (face positions, as on the finished sign).
                const layoutRings: Ring[] = pieces.flatMap((p) => [
                    p.path.points.map(([x, y]) => [x, y] as [number, number]),
                    ...(p.holes ?? []).map((h) =>
                        h.points.map(([x, y]) => [x, y] as [number, number]),
                    ),
                ]);
                if (layoutRings.length > 0) {
                    pushCut(`${safe(label)}_laid-out`, { cut: layoutRings });
                }

                // Nested onto sheets.
                const nest = nestedSheetGeometry(pieces, {
                    label,
                    title: `${name} — ${label}`,
                });
                nest.sheets.forEach((sheet, i) => {
                    const base = `${safe(label)}_nested${nest.sheets.length > 1 ? `-sheet${i + 1}` : ''}`;
                    entries.push({ name: `${folder}/${base}.svg`, data: buildSheetSvg(sheet.input) });
                    entries.push({ name: `${folder}/${base}.dxf`, data: buildSheetDxf(sheet.input) });
                    pdfEntry(base, { cut: sheet.cut, ref: [sheet.boundary] });
                });
            };

            // 1. The aluminium tray — the unfolded flat blank as a CAM cut file.
            const holesBySection = sectionExport.sections.map((_s, i) => [
                ...(apertureBySection[i] ?? []),
                ...(apertureHolesBySection[i] ?? []),
                ...(pushThroughKeylineBySection[i] ?? []),
                ...(pushThroughIslandsBySection[i] ?? []),
                ...(fixingsBySection[i] ?? []),
                ...(cableHolesBySection[i] ?? []),
            ]);
            pushCut('tray-cut', developmentGeometry({ sectionExport, holesBySection }));

            // 2. Nested rigid-sheet pieces — one cut file per stock / finish.
            for (const [key, pieces] of byStock(pushThroughPieces)) {
                pushNest(pieces, `push-through-${hex(key.split('|')[0])}`);
            }
            for (const [key, pieces] of byStock(acrylicPieces)) {
                pushNest(pieces, `acrylic-${hex(key.split('|')[0])}`);
            }
            for (const [key, pieces] of byStock(standoffPieces)) {
                pushNest(pieces, `standoff-${hex(key.split('|')[0])}`);
            }
            const byMetal = new Map<FaceMaterial, ExtraFacePiece[]>();
            for (const p of extraFacePieces) {
                (byMetal.get(p.material) ?? byMetal.set(p.material, []).get(p.material)!).push(p);
            }
            for (const [material, pieces] of byMetal) {
                pushNest(pieces, `${material}-faces`);
            }

            // 3. Opal backing — a single cut rectangle.
            const keyline = !!params.illumination?.keyline?.enabled;
            const illuminated = keyline || backlightPieces.length > 0;
            if (illuminated && (pushThroughPieces.length > 0 || backlightPieces.length > 0)) {
                const lit = [...pushThroughPieces, ...backlightPieces];
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                for (const p of lit) for (const [x, y] of p.path.points) {
                    if (x < minX) minX = x; if (y < minY) minY = y;
                    if (x > maxX) maxX = x; if (y > maxY) maxY = y;
                }
                const margin = 40;
                const rw = Math.max(1, Math.round(Number.isFinite(minX) ? maxX - minX + margin * 2 : params.panelWidthMm));
                const rh = Math.max(1, Math.round(Number.isFinite(minY) ? maxY - minY + margin * 2 : params.panelHeightMm));
                const rectRing: Ring = [
                    [0, 0],
                    [rw, 0],
                    [rw, rh],
                    [0, rh],
                ];
                pushCut('opal-backing', { cut: [rectRing] });
            }

            // 4. Cut vinyl — plotter outlines (printed vinyl is a raster, below).
            const cutVinyl = vinylPieces.filter((p) => !p.fullColor);
            if (cutVinyl.length > 0) {
                const vinylRings: Ring[] = cutVinyl.flatMap((p) => [
                    p.path.points.map(([x, y]) => [x, y] as [number, number]),
                    ...(p.holes ?? []).map((h) => h.points.map(([x, y]) => [x, y] as [number, number])),
                ]);
                pushCut('cut-vinyl', { cut: vinylRings });
            }

            // 5. Printed vinyl — the print artwork (PNG) for the large-format RIP.
            if (vinylPrintDataUrl) {
                const comma = vinylPrintDataUrl.indexOf(',');
                if (comma >= 0) {
                    try {
                        const bin = atob(vinylPrintDataUrl.slice(comma + 1));
                        const bytes = new Uint8Array(bin.length);
                        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                        entries.push({ name: `${folder}/printed-vinyl.png`, data: bytes });
                    } catch {
                        /* skip a malformed raster */
                    }
                }
            }

            const zip = createZip(entries);
            download(
                new Blob([zip as BlobPart], { type: 'application/zip' }),
                `${folder}-production-files.zip`,
            );
            setMsg(null);
            setExported(`Production files · ${entries.length} file${entries.length === 1 ? '' : 's'} (SVG · DXF · PDF)`);
        } catch (e) {
            console.error('production zip export failed:', e);
            setMsg(
                e instanceof Error
                    ? `Export failed: ${e.message}`
                    : 'Export failed — see the console.',
            );
        } finally {
            setZipPending(false);
        }
    };

    // Spin up a visual-approval pack from this design (the design drives the
    // interactive 3D the client orbits while they approve) and open the job.
    const onCreateApprovalPack = async () => {
        if (packPending) return;
        if (!designHasArtwork()) {
            setMsg('Add artwork to the panel before creating an approval pack.');
            return;
        }
        setPackPending('approval');
        setMsg(null);
        try {
            const id = await ensureSaved();
            if (!id) return;
            const res = await createVisualApprovalFromDesign(id);
            if ('error' in res) {
                setMsg(res.error);
                return;
            }
            window.location.assign(`/admin/artwork/${res.id}`);
        } finally {
            setPackPending(null);
        }
    };

    // Push this design onto the workshop TV board. We're the only place the
    // reference-PDF geometry + 3D thumbnail exist, so capture both here and
    // ship them to the server with the design id. Saves first if needed
    // (the board snapshots a saved design).
    const onAddToBackshop = async () => {
        if (backshopPending) return;
        setBackshopPending(true);
        setMsg(null);
        try {
            // 1. Ensure the design is saved — we need a concrete id, and the
            //    QR on the stored PDF should point at a real design.
            let id = designId;
            if (!id || dirty) {
                const assembled = assembleMain();
                const saved = await saveDesign({
                    id: designId ?? undefined,
                    params: assembled.params,
                    svgSource: assembled.svgSource,
                    quoteId,
                    quoteItemId,
                });
                if (!saved.ok) {
                    setMsg(saved.error);
                    return;
                }
                id = saved.data.id;
                markSaved(saved.data.id);
            }

            // 2. Thumbnails + reference PDF (same opts as the Reference PDF
            //    button), base64-encoded for the server action. The PDF keeps
            //    the angled orbit shot; the board uses a straight-on face shot
            //    trimmed to the sign, so it crops to a clean wide rectangle
            //    that fills its banner instead of floating in empty space.
            const thumb = sceneCapture.fn?.() ?? undefined;
            const faceThumb = sceneCapture.faceOn?.() ?? thumb;
            const boardThumb = faceThumb
                ? await trimImageDataUrl(faceThumb)
                : undefined;
            const blob = await generateReferencePdfBlob({
                sectionExport,
                params,
                designId: id,
                apertureBySection,
                keylineBySection,
                pushThroughKeylineBySection,
                pushThroughIslandsBySection,
                fixingsBySection,
                cableHolesBySection,
                referenceBySection,
                vinylPieces,
                acrylicPieces,
                solidPieces,
                standoffPieces,
                pushThroughPieces,
                backlightPieces,
                vinylPrintDataUrl,
                faceRectMm,
                thumbnailDataUrl: thumb || undefined,
            });
            const pdfBase64 = await blobToBase64(blob);

            // Each panel pushes as its own board item (separate sheets per
            // panel). When the active panel is the projecting blade, surface
            // its spec on the Build column + add the contextual Wall-fixing
            // (bracket) stage.
            const bladeActive = projectingEnabled && activeTab === 'projecting';
            const projDesc = bladeActive
                ? projectingSpecLine(params, mount)
                : null;
            // Keep the board glance-informative: tray material, paint colour and
            // the specific metal face finish where present.
            const colourSpec = params.panelRal || params.panelColor || null;
            const metalFinishes =
                extraFacePieces.length > 0
                    ? Array.from(
                          new Set(
                              extraFacePieces.map(
                                  (p) => FACE_MATERIALS[p.material].label,
                              ),
                          ),
                      )
                          .map((label) => `${label} faces`)
                          .join(', ')
                    : null;
            const description =
                [projDesc, params.materialLabel || null, colourSpec, metalFinishes]
                    .filter(Boolean)
                    .join(' — ') || null;

            const res = await addToBackshop({
                designId: id,
                name: params.name,
                description,
                widthMm: params.panelWidthMm,
                heightMm: params.panelHeightMm,
                returnsMm: params.returnDepthMm,
                shadowGapMm: params.shadowGapMm,
                thumbnailDataUrl: boardThumb ?? null,
                pdfBase64,
                // Contextual production stages follow the construction.
                features: {
                    pushThrough: pushThroughPieces.length > 0,
                    vinyl: vinylPieces.length > 0,
                    acrylic: acrylicPieces.length > 0,
                    metalFace: extraFacePieces.length > 0,
                    standoff: standoffPieces.length > 0,
                    illumination:
                        !!params.illumination?.keyline?.enabled ||
                        backlightPieces.length > 0,
                    bracket: bladeActive,
                },
            });
            if (res.ok) {
                setExported(
                    onBackshop
                        ? 'Updated backshop screen'
                        : 'Added to backshop screen',
                );
                setOnBackshop(true);
            } else setMsg(res.error);
        } catch {
            setMsg('Could not add to the backshop screen.');
        } finally {
            setBackshopPending(false);
        }
    };

    const onProductionPdf = async () => {
        if (pdfPending) return;
        setPdfPending('prod');
        try {
            const embeddedNests = await loadEmbeddedNests();
            // Prompt to nest first if there are nestable pieces but nothing's
            // been nested yet — otherwise the pack would miss the acrylic /
            // metal-face cuts. If nests already exist, pick them up silently
            // (no friction).
            if (nestableCount > 0 && embeddedNests.length === 0) {
                const go = window.confirm(
                    'This sign has acrylic / metal-face pieces that haven’t been nested yet.\n\n' +
                        'Send them to the nester now? Once nested, the production pack includes the packed sheets.\n\n' +
                        'OK = send to nester  ·  Cancel = make the pack without nest sheets',
                );
                if (go) {
                    await onSendToNester();
                    return;
                }
            }

            // Production PDF is a multi-page CAM bundle: panel cut +
            // push-through inserts (when keyline) + a 1:1 cut page per
            // material (acrylic / vinyl / standoff) + the saved nest sheets at
            // 1:1 + a final 1:1 placement template for the backshop. Pass
            // everything; each helper inside the generator no-ops when its
            // data is empty.
            const blob = await generateProductionPdfBlob({
                sectionExport,
                params,
                designId: designId ?? null,
                apertureBySection,
                keylineBySection,
                pushThroughKeylineBySection,
                pushThroughIslandsBySection,
                fixingsBySection,
                cableHolesBySection,
                referenceBySection,
                apertureHolesBySection,
                vinylPieces,
                acrylicPieces,
                solidPieces,
                standoffPieces,
                pushThroughPieces,
                backlightPieces,
                vinylPrintDataUrl,
                faceRectMm,
                embeddedNests,
                ...twoItem,
            });
            const fname = pdfFilename(params, 'production');
            download(blob, fname);
            setExported(`Production PDF · ${fname}`);
        } finally {
            setPdfPending(null);
        }
    };

    const onSave = () => {
        setMsg(null);
        // Persist the full design: the main panel as the row params (with the
        // projecting blade nested inside), each panel carrying a flattened
        // composite SVG so any consumer that only reads svg_source still
        // renders. Works from either tab.
        const assembled = assembleMain();
        startSaveTransition(async () => {
            const res = await saveDesign({
                id: designId ?? undefined,
                params: assembled.params,
                svgSource: assembled.svgSource,
                quoteId,
                quoteItemId,
            });
            if (res.ok) {
                markSaved(res.data.id);
                setMsg('Saved');
            } else {
                setMsg(res.error);
            }
        });
    };

    const advisoryWarnings = warnings.length;
    const geometryOk = valid.success;

    return (
        <div className="space-y-2.5">
            <ReadyChecklist
                geometryOk={geometryOk}
                pathCount={pathCount}
                warningCount={advisoryWarnings}
            />
            {warnings.length > 0 && (
                <ul
                    className="space-y-1 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2"
                    aria-live="polite"
                >
                    {warnings.map((w, i) => (
                        <li
                            key={i}
                            className="flex items-start gap-1.5 text-[11px] text-amber-800"
                        >
                            <AlertTriangle
                                size={11}
                                className="mt-0.5 shrink-0 text-amber-600"
                                aria-hidden
                            />
                            <span>{w.message}</span>
                        </li>
                    ))}
                </ul>
            )}
            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={onProductionPdf}
                    disabled={!valid.success || !!pdfPending}
                    aria-busy={pdfPending === 'prod'}
                    title="Cut-only PDF — welded perimeters, hairline stroke, sized to the part. Drop into the cutter."
                    className="flex min-h-[44px] items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    style={{
                        background: pdfPending === 'prod' ? ACCENT_DARK : ACCENT,
                    }}
                    onMouseEnter={(e) => {
                        if (!e.currentTarget.disabled)
                            e.currentTarget.style.background = ACCENT_DARK;
                    }}
                    onMouseLeave={(e) => {
                        if (pdfPending !== 'prod')
                            e.currentTarget.style.background = ACCENT;
                    }}
                >
                    {pdfPending === 'prod' ? (
                        <Loader2
                            size={16}
                            className="animate-spin"
                            aria-hidden
                        />
                    ) : (
                        <Scissors size={16} aria-hidden />
                    )}
                    {pdfPending === 'prod'
                        ? 'Building production PDF…'
                        : 'Export production PDF'}
                </button>
                <button
                    type="button"
                    onClick={onReferencePdf}
                    disabled={!valid.success || !!pdfPending}
                    aria-busy={pdfPending === 'ref'}
                    title="Dimensioned shop drawing — spec, legend, fold lines, dimensions. For printing / reference."
                    className="flex min-h-[36px] items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {pdfPending === 'ref' ? (
                        <Loader2
                            size={14}
                            className="animate-spin"
                            aria-hidden
                        />
                    ) : (
                        <FileText size={14} aria-hidden />
                    )}
                    Reference PDF
                </button>
                <button
                    type="button"
                    onClick={onSave}
                    disabled={savePending || !valid.success}
                    aria-busy={savePending}
                    className="flex min-h-[36px] items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {savePending ? (
                        <Loader2
                            size={14}
                            className="animate-spin"
                            aria-hidden
                        />
                    ) : (
                        <Save size={14} aria-hidden />
                    )}
                    {savePending
                        ? 'Saving…'
                        : designId
                          ? 'Update design'
                          : 'Save design'}
                    {dirty && !savePending && (
                        <span
                            className="ml-0.5 h-1.5 w-1.5 rounded-full bg-amber-500"
                            aria-label="Unsaved changes"
                        />
                    )}
                </button>
                <button
                    type="button"
                    onClick={onAddToBackshop}
                    disabled={!valid.success || backshopPending}
                    aria-busy={backshopPending}
                    title="Send this design to the workshop TV board (saves first, with its reference PDF + preview)."
                    className="flex min-h-[36px] items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {backshopPending ? (
                        <Loader2
                            size={14}
                            className="animate-spin"
                            aria-hidden
                        />
                    ) : (
                        <Tv size={14} aria-hidden />
                    )}
                    {backshopPending
                        ? onBackshop
                            ? 'Updating…'
                            : 'Sending…'
                        : onBackshop
                          ? 'Update backshop screen'
                          : 'Add to backshop screen'}
                </button>
                {nestableCount > 0 && (
                    <button
                        type="button"
                        onClick={onSendToNester}
                        disabled={nesterPending}
                        aria-busy={nesterPending}
                        title="Nest the acrylic + metal-face pieces — saves the design, then opens the acrylic nester (one nest per material)."
                        className="flex min-h-[36px] items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {nesterPending ? (
                            <Loader2
                                size={14}
                                className="animate-spin"
                                aria-hidden
                            />
                        ) : (
                            <Layers size={14} aria-hidden />
                        )}
                        {nesterPending ? 'Sending…' : 'Send to nester'}
                    </button>
                )}
                <button
                    type="button"
                    onClick={onCreateProductionPack}
                    disabled={packPending !== null}
                    aria-busy={packPending === 'prod'}
                    title="Create a production (works) pack scaffolded from this design — saves it, then opens the pack."
                    className="flex min-h-[36px] items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {packPending === 'prod' ? (
                        <Loader2 size={14} className="animate-spin" aria-hidden />
                    ) : (
                        <FileBox size={14} aria-hidden />
                    )}
                    {packPending === 'prod' ? 'Creating…' : 'Production pack'}
                </button>
                <button
                    type="button"
                    onClick={onDownloadPackPdf}
                    disabled={packPending !== null}
                    aria-busy={packPending === 'pdf'}
                    title="Build the works pack and open it ready to save as PDF — the whole document (studio template, dimensions, per-piece breakdown)."
                    className="flex min-h-[36px] items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {packPending === 'pdf' ? (
                        <Loader2 size={14} className="animate-spin" aria-hidden />
                    ) : (
                        <FileDown size={14} aria-hidden />
                    )}
                    {packPending === 'pdf' ? 'Building…' : 'Pack PDF'}
                </button>
                <button
                    type="button"
                    onClick={onCreateApprovalPack}
                    disabled={packPending !== null}
                    aria-busy={packPending === 'approval'}
                    title="Create a client approval pack — the design drives an interactive 3D the client orbits while they sign off. Saves it, then opens the job."
                    className="flex min-h-[36px] items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {packPending === 'approval' ? (
                        <Loader2 size={14} className="animate-spin" aria-hidden />
                    ) : (
                        <BadgeCheck size={14} aria-hidden />
                    )}
                    {packPending === 'approval' ? 'Creating…' : 'Approval pack'}
                </button>
                <button
                    type="button"
                    onClick={onExportProductionZip}
                    disabled={zipPending}
                    aria-busy={zipPending}
                    title="Download every production cut file as a .zip — SVG + DXF + PDF, true mm, ready to send straight to the machines."
                    className="flex min-h-[36px] items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {zipPending ? (
                        <Loader2 size={14} className="animate-spin" aria-hidden />
                    ) : (
                        <Archive size={14} aria-hidden />
                    )}
                    {zipPending ? 'Zipping…' : 'Production files (.zip)'}
                </button>
                <MockupGenerator
                    params={params}
                    capture={captureCleanInsitu}
                    disabled={!valid.success}
                />
                <div className="ml-auto flex items-center gap-2 text-xs text-neutral-500">
                    {exported && (
                        <span
                            role="status"
                            className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200"
                        >
                            <Check size={11} aria-hidden /> {exported}
                        </span>
                    )}
                    {msg && <span>{msg}</span>}
                </div>
                {!valid.success && (
                    <span className="basis-full text-xs text-red-600">
                        {valid.error.issues[0]?.message}
                    </span>
                )}
            </div>
        </div>
    );
}
