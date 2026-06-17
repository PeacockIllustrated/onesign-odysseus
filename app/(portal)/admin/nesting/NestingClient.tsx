'use client';

/**
 * Acrylic nesting tool — main client.
 *
 * Flow: upload an outlined-artwork SVG → it splits into cut pieces (islands
 * stay welded to their letters) → configure the sheet / gap / rotation →
 * Nest. The engine runs in a Web Worker and streams its best-so-far layout;
 * Stop keeps the best found. Exports (per-sheet SVG + DXF, PDF summary) are
 * generated from a frozen snapshot of the exact pieces + config that were
 * nested, so files always match what's on screen even if settings change
 * afterwards.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
    AlertTriangle,
    ChevronRight,
    Download,
    ExternalLink,
    FileText,
    Hammer,
    Layers,
    Link2,
    Minimize2,
    Play,
    RotateCcw,
    Save,
    Square,
    Trash2,
    Upload,
    X,
} from 'lucide-react';
import { importNestSvg } from '@/lib/nesting/svg-import';
import { BinderButton } from '@/components/admin/BinderPicker';
import { buildPieces, scalePieces } from '@/lib/nesting/pieces';
import { ringsToPathData } from '@/lib/nesting/geom';
import { buildSheetSvg } from '@/lib/nesting/svg-export';
import { buildSheetDxf } from '@/lib/nesting/dxf';
import { generateNestingPdfBlob } from '@/lib/nesting/pdf';
import { useNestWorker } from '@/lib/nesting/use-nest-worker';
import {
    deleteNestingDesign,
    getNestingDesign,
    saveNestingDesign,
} from '@/lib/nesting/actions';
import {
    DEFAULT_NEST_CONFIG,
    SHEET_PRESETS,
    type ImportedNestSvg,
    type NestConfig,
    type NestingDesignSummary,
    type NestPiece,
    type PieceGroup,
} from '@/lib/nesting/types';
import { ArtworkPreview, SheetView } from './SheetView';

const ACCENT = '#4e7e8c';
const ACCENT_DARK = '#3a5f6a';
const ACCENT_TINT_BG = '#e8f0f3';
const ACCENT_TINT_BORDER = '#b8d0d8';

/** Improvement budget per run — Stop keeps the best found at any point. */
const ITERATIONS = 200;

type Hover = { kind: 'piece' | 'group'; id: string } | null;

interface RunSnapshot {
    pieces: NestPiece[];
    groups: PieceGroup[];
    config: NestConfig;
    key: string;
    baseName: string;
    /** True for a "find smallest panel" run (auto-sized single sheet). */
    smallest?: boolean;
}

function download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function NumField({
    label,
    value,
    onChange,
    step,
    min,
}: {
    label: string;
    value: number;
    onChange: (n: number) => void;
    step: number;
    min?: number;
}) {
    return (
        <label className="block">
            <span className="text-[10px] text-neutral-500">{label}</span>
            <input
                type="number"
                inputMode="decimal"
                step={step}
                min={min}
                value={value}
                onChange={(e) => {
                    const n = parseFloat(e.target.value);
                    onChange(Number.isNaN(n) ? 0 : n);
                }}
                className="mt-0.5 w-full rounded border border-neutral-300 px-1.5 py-1 text-xs focus:border-[var(--accent)] focus:outline-none"
            />
        </label>
    );
}

function Section({
    step,
    title,
    children,
    active = true,
}: {
    step: number;
    title: string;
    children: React.ReactNode;
    active?: boolean;
}) {
    return (
        <section className="rounded-lg border border-neutral-200 bg-white p-3 space-y-2.5">
            <h3 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                <span
                    className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white"
                    style={{ background: active ? ACCENT : '#9ca3af' }}
                    aria-hidden
                >
                    {step}
                </span>
                {title}
            </h3>
            {children}
        </section>
    );
}

/** Tiny silhouette of one piece (outer + holes, even-odd). */
function MiniThumb({ piece, fill }: { piece: NestPiece; fill: string }) {
    const d = useMemo(
        () => ringsToPathData([piece.outer, ...piece.holes], 2),
        [piece],
    );
    const view = useMemo(() => {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const [x, y] of piece.outer) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }
        const w = maxX - minX || 1;
        const h = maxY - minY || 1;
        const pad = Math.max(w, h) * 0.1;
        return `${minX - pad} ${minY - pad} ${w + 2 * pad} ${h + 2 * pad}`;
    }, [piece]);
    return (
        <svg
            viewBox={view}
            preserveAspectRatio="xMidYMid meet"
            className="h-6 w-6 shrink-0 rounded border border-neutral-200 bg-white"
            aria-hidden
        >
            <path d={d} fill={fill} fillRule="evenodd" />
        </svg>
    );
}

export function NestingClient({
    initialDesigns,
    initialOpenId = null,
}: {
    initialDesigns: NestingDesignSummary[];
    /** A nest id to auto-open on mount (from the returns tool's "Send to nester"). */
    initialOpenId?: string | null;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    // Seeded lazily in startNest (an event handler) — render must stay pure.
    const seedRef = useRef<number>(0);

    const [fileName, setFileName] = useState<string | null>(null);
    const [imported, setImported] = useState<ImportedNestSvg | null>(null);
    const [importError, setImportError] = useState<string | null>(null);
    const [widthCal, setWidthCal] = useState<number | null>(null);
    const [cfg, setCfg] = useState<NestConfig>(DEFAULT_NEST_CONFIG);
    const [snapshot, setSnapshot] = useState<RunSnapshot | null>(null);
    const [activeSheet, setActiveSheet] = useState(0);
    const [hover, setHover] = useState<Hover>(null);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    // Saved-nests rail state.
    const [svgText, setSvgText] = useState<string | null>(null);
    const [designs, setDesigns] =
        useState<NestingDesignSummary[]>(initialDesigns);
    const [currentDesignId, setCurrentDesignId] = useState<string | null>(null);
    const [designName, setDesignName] = useState('');
    const [saveError, setSaveError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    // Group ids the operator wants packed together as one rigid unit.
    const [keptGroups, setKeptGroups] = useState<Set<string>>(new Set());
    // Set when the loaded nest came from a built-up-letter job (migration 065),
    // so we can show a banner linking back to that job.
    const [sourceJob, setSourceJob] = useState<{ id: string; name: string } | null>(
        null,
    );
    const [sourceDesign, setSourceDesign] = useState<{
        id: string;
        name: string;
    } | null>(null);

    const nest = useNestWorker();

    // ---- derive pieces from the import + calibration scale ----
    const built = useMemo(
        () => (imported ? buildPieces(imported.paths) : null),
        [imported],
    );
    const nativeWidth = imported?.bbox.w ?? 0;
    const effectiveWidth = widthCal ?? nativeWidth;
    const factor =
        nativeWidth > 0 && effectiveWidth > 0 ? effectiveWidth / nativeWidth : 1;
    const pieces = useMemo(
        () => (built ? scalePieces(built.pieces, factor) : []),
        [built, factor],
    );
    const groups = useMemo(() => built?.groups ?? [], [built]);
    const pieceById = useMemo(
        () => new Map(pieces.map((p) => [p.id, p])),
        [pieces],
    );

    // Only multi-piece groups can be "kept together"; tag those pieces with a
    // clusterId so the engine packs each such group as one rigid unit.
    const keptEffective = useMemo(() => {
        const multi = new Set(
            groups.filter((g) => g.pieceIds.length > 1).map((g) => g.id),
        );
        return new Set([...keptGroups].filter((id) => multi.has(id)));
    }, [keptGroups, groups]);
    const keptKey = useMemo(
        () => [...keptEffective].sort().join(','),
        [keptEffective],
    );
    const enginePieces = useMemo(
        () =>
            keptEffective.size === 0
                ? pieces
                : pieces.map((p) =>
                      keptEffective.has(p.groupId)
                          ? { ...p, clusterId: p.groupId }
                          : p,
                  ),
        [pieces, keptEffective],
    );

    const baseName = useMemo(() => {
        const raw = (fileName ?? 'nest').replace(/\.svg$/i, '');
        const slug = raw.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '');
        return slug || 'nest';
    }, [fileName]);

    // A run is "stale" when anything that feeds the engine changed since.
    const runKey = useMemo(
        () => JSON.stringify({ cfg, factor, fileName, n: pieces.length, keptKey }),
        [cfg, factor, fileName, pieces.length, keptKey],
    );
    const stale = !!snapshot && snapshot.key !== runKey && !nest.running;

    const solution = nest.solution;
    const sheets = solution?.sheets ?? [];
    const placementsBySheet = useMemo(() => {
        const map = new Map<number, NonNullable<typeof solution>['placements']>();
        if (!solution) return map;
        for (const pl of solution.placements) {
            const arr = map.get(pl.sheetIndex);
            if (arr) arr.push(pl);
            else map.set(pl.sheetIndex, [pl]);
        }
        return map;
    }, [solution]);
    const sheetByPiece = useMemo(() => {
        const map = new Map<string, number>();
        if (!solution) return map;
        for (const pl of solution.placements) map.set(pl.pieceId, pl.sheetIndex);
        return map;
    }, [solution]);

    const highlight = useMemo(() => {
        if (!hover) return new Set<string>();
        if (hover.kind === 'piece') return new Set([hover.id]);
        const g = groups.find((x) => x.id === hover.id);
        return new Set(g?.pieceIds ?? []);
    }, [hover, groups]);

    // ---- config validation ----
    const cfgIssues = useMemo(() => {
        const issues: string[] = [];
        if (cfg.sheetWidthMm <= 0 || cfg.sheetHeightMm <= 0) {
            issues.push('Sheet size must be greater than zero.');
        }
        if (cfg.gapMm < 0) issues.push('Gap cannot be negative.');
        if (cfg.marginMm < 0) issues.push('Margin cannot be negative.');
        if (
            cfg.marginMm * 2 >= Math.min(cfg.sheetWidthMm, cfg.sheetHeightMm)
        ) {
            issues.push('The margin leaves no usable sheet area.');
        }
        return issues;
    }, [cfg]);

    const canNest =
        pieces.length > 0 && cfgIssues.length === 0 && !nest.running;

    // ---- actions ----
    const handleFile = async (file: File) => {
        setImportError(null);
        try {
            const text = await file.text();
            const result = importNestSvg(text);
            if (result.paths.filter((p) => p.closed).length === 0) {
                setImportError(
                    'No closed vector outlines found in that SVG — nothing to nest.',
                );
                return;
            }
            nest.reset();
            setSnapshot(null);
            setActiveSheet(0);
            setHover(null);
            setExpanded(new Set());
            setWidthCal(null);
            setFileName(file.name);
            setImported(result);
            setSvgText(text);
            setCurrentDesignId(null);
            setDesignName(file.name.replace(/\.svg$/i, ''));
            setSaveError(null);
            setKeptGroups(new Set());
            setSourceJob(null);
        } catch (e) {
            setImportError(
                e instanceof Error ? e.message : 'Could not read that SVG',
            );
        }
    };

    const clearAll = () => {
        nest.reset();
        setSnapshot(null);
        setImported(null);
        setFileName(null);
        setImportError(null);
        setWidthCal(null);
        setHover(null);
        setActiveSheet(0);
        setSvgText(null);
        setCurrentDesignId(null);
        setDesignName('');
        setSaveError(null);
        setKeptGroups(new Set());
        setSourceJob(null);
    };

    // ---- saved-nests rail ----
    const doSave = async () => {
        if (!svgText) return;
        const name = designName.trim() || fileName || 'Untitled nest';
        setBusy(true);
        setSaveError(null);
        const res = await saveNestingDesign({
            id: currentDesignId ?? undefined,
            name,
            svgSource: svgText,
            config: cfg,
            widthCalMm: widthCal,
            fileName,
            keptGroupIds: [...keptEffective],
        });
        setBusy(false);
        if (!res.ok) {
            setSaveError(res.error);
            return;
        }
        const id = res.data.id;
        setCurrentDesignId(id);
        const nowIso = new Date().toISOString();
        setDesigns((prev) => {
            const created = prev.find((d) => d.id === id)?.created_at ?? nowIso;
            return [
                { id, name, created_at: created, updated_at: nowIso },
                ...prev.filter((d) => d.id !== id),
            ];
        });
    };

    const doLoad = async (id: string) => {
        setBusy(true);
        setSaveError(null);
        const res = await getNestingDesign(id);
        setBusy(false);
        if (!res.ok) {
            setSaveError(res.error);
            return;
        }
        const row = res.data;
        try {
            const result = importNestSvg(row.svg_source);
            nest.reset();
            setSnapshot(null);
            setActiveSheet(0);
            setHover(null);
            setExpanded(new Set());
            setSvgText(row.svg_source);
            setImported(result);
            setCfg(row.config_json.config);
            setWidthCal(row.config_json.widthCalMm);
            setFileName(row.config_json.fileName ?? row.name);
            setKeptGroups(new Set(row.config_json.keptGroupIds ?? []));
            setCurrentDesignId(row.id);
            setDesignName(row.name);
            setSourceJob(
                row.source_job_id
                    ? {
                          id: row.source_job_id,
                          name:
                              row.config_json.sourceJobName ??
                              'built-up letter job',
                      }
                    : null,
            );
            setSourceDesign(
                row.source_design_id
                    ? {
                          id: row.source_design_id,
                          name:
                              row.config_json.sourceDesignName ??
                              'visualiser design',
                      }
                    : null,
            );
        } catch {
            setSaveError('Saved artwork could not be reopened.');
        }
    };

    // Auto-open a nest deep-linked from the returns tool's "Send to nester".
    useEffect(() => {
        if (initialOpenId) void doLoad(initialOpenId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialOpenId]);

    const doDelete = async (id: string) => {
        setBusy(true);
        const res = await deleteNestingDesign(id);
        setBusy(false);
        if (!res.ok) {
            setSaveError(res.error);
            return;
        }
        setDesigns((prev) => prev.filter((d) => d.id !== id));
        if (currentDesignId === id) setCurrentDesignId(null);
    };

    // Fresh seed each run so a re-run explores a different path. Seeded
    // lazily in this event handler — render stays pure.
    const nextSeed = () => {
        if (seedRef.current === 0) {
            seedRef.current = ((Date.now() % 0x7fffffff) | 1) >>> 0;
        }
        seedRef.current = (seedRef.current * 1664525 + 1013904223) >>> 0;
        return seedRef.current || 1;
    };

    const startNest = () => {
        if (!canNest) return;
        setSnapshot({
            pieces: enginePieces,
            groups,
            config: cfg,
            key: runKey,
            baseName,
        });
        setActiveSheet(0);
        nest.start(enginePieces, cfg, ITERATIONS, nextSeed());
    };

    // "Smallest panel": nest onto a generously-auto-sized single sheet, then
    // the improvement loop (which minimises the used footprint) settles the
    // pieces into the tightest bounding box it can find — that box, plus the
    // edge margin, is the smallest panel/offcut that will hold the job.
    const startSmallest = () => {
        if (!canNest) return;
        let bboxArea = 0;
        let maxDim = 0;
        for (const p of pieces) {
            bboxArea += (p.widthMm + cfg.gapMm) * (p.heightMm + cfg.gapMm);
            maxDim = Math.max(maxDim, p.widthMm, p.heightMm);
        }
        // ~45% target fill leaves the packer room to compact without overflow.
        const side = Math.ceil(
            Math.max(maxDim, Math.sqrt(bboxArea) * 1.5) + 2 * cfg.marginMm,
        );
        const c2: NestConfig = {
            ...cfg,
            sheetWidthMm: side,
            sheetHeightMm: side,
            maxSheets: 1,
        };
        setSnapshot({
            pieces: enginePieces,
            groups,
            config: c2,
            key: runKey,
            baseName,
            smallest: true,
        });
        setActiveSheet(0);
        nest.start(enginePieces, c2, ITERATIONS, nextSeed());
    };

    // Cut files are sized to the snapshot sheet — except a smallest-panel run,
    // where the deliverable should be the tight panel, not the virtual canvas.
    const effConfig = (sheetIndex: number): NestConfig => {
        if (!snapshot) return cfg;
        const st = solution?.sheets[sheetIndex];
        if (snapshot.smallest && st && st.pieceCount > 0) {
            return {
                ...snapshot.config,
                sheetWidthMm: Math.ceil(
                    st.usedWidthMm + 2 * snapshot.config.marginMm,
                ),
                sheetHeightMm: Math.ceil(
                    st.usedHeightMm + 2 * snapshot.config.marginMm,
                ),
            };
        }
        return snapshot.config;
    };

    const exportSheetSvg = (sheetIndex: number) => {
        if (!snapshot || !solution) return;
        const svg = buildSheetSvg({
            pieces: snapshot.pieces,
            placements: solution.placements.filter(
                (p) => p.sheetIndex === sheetIndex,
            ),
            config: effConfig(sheetIndex),
            title: `${snapshot.baseName} — sheet ${sheetIndex + 1} of ${sheets.length}`,
        });
        download(
            new Blob([svg], { type: 'image/svg+xml' }),
            `${snapshot.baseName}-sheet-${sheetIndex + 1}.svg`,
        );
    };

    const exportSheetDxf = (sheetIndex: number) => {
        if (!snapshot || !solution) return;
        const dxf = buildSheetDxf({
            pieces: snapshot.pieces,
            placements: solution.placements.filter(
                (p) => p.sheetIndex === sheetIndex,
            ),
            config: effConfig(sheetIndex),
            title: `${snapshot.baseName} — sheet ${sheetIndex + 1} of ${sheets.length}`,
        });
        download(
            new Blob([dxf], { type: 'application/dxf' }),
            `${snapshot.baseName}-sheet-${sheetIndex + 1}.dxf`,
        );
    };

    const exportAllSheets = () => {
        for (let s = 0; s < sheets.length; s++) {
            exportSheetSvg(s);
            exportSheetDxf(s);
        }
    };

    const exportPdf = () => {
        if (!snapshot || !solution) return;
        const blob = generateNestingPdfBlob({
            jobName: snapshot.baseName,
            pieces: snapshot.pieces,
            groups: snapshot.groups,
            solution,
            config: effConfig(0),
            generatedAt: new Date(),
        });
        download(blob, `${snapshot.baseName}-nesting-summary.pdf`);
    };

    const setSheetSize = (w: number, h: number) =>
        setCfg((c) => ({ ...c, sheetWidthMm: w, sheetHeightMm: h }));

    const presetValue =
        SHEET_PRESETS.find(
            (p) => p.w === cfg.sheetWidthMm && p.h === cfg.sheetHeightMm,
        )?.label ?? 'custom';

    const unplacedLabels = (solution?.unplacedPieceIds ?? [])
        .map((id) => snapshot?.pieces.find((p) => p.id === id)?.label ?? id)
        .slice(0, 8);

    const activePlacements = placementsBySheet.get(activeSheet) ?? [];
    const activeStats = sheets[activeSheet];
    const overallUtilisation =
        sheets.length > 0
            ? sheets.reduce((acc, s) => acc + s.utilisation, 0) / sheets.length
            : 0;

    // The canvas + exports always draw the SNAPSHOT pieces (what was nested),
    // not the live ones — otherwise rescaling mid-result would lie.
    const canvasPieces = snapshot?.pieces ?? pieces;
    // In smallest-panel mode the nested footprint + edge margin IS the panel,
    // so crop the displayed sheet to it (pieces hug the origin under BLF).
    const smallestPanel =
        snapshot?.smallest && activeStats && activeStats.pieceCount > 0
            ? {
                  w: Math.ceil(
                      activeStats.usedWidthMm + 2 * snapshot.config.marginMm,
                  ),
                  h: Math.ceil(
                      activeStats.usedHeightMm + 2 * snapshot.config.marginMm,
                  ),
              }
            : null;
    const canvasConfig = smallestPanel
        ? {
              ...snapshot!.config,
              sheetWidthMm: smallestPanel.w,
              sheetHeightMm: smallestPanel.h,
          }
        : (snapshot?.config ?? cfg);

    return (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            {/* ------------------------------------------------ left rail */}
            <div className="space-y-3">
                {/* Saved nests — save the current SVG + config, reopen to revise */}
                <div className="space-y-2 rounded-lg border border-neutral-200 bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                        <h3 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                            <Save size={12} aria-hidden /> Saved nests
                        </h3>
                        {currentDesignId && (
                            <span
                                className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                                style={{ background: ACCENT_TINT_BG, color: ACCENT_DARK }}
                            >
                                editing
                            </span>
                        )}
                    </div>
                    {imported ? (
                        <>
                            <div className="flex items-center gap-1.5">
                                <input
                                    value={designName}
                                    onChange={(e) => setDesignName(e.target.value)}
                                    placeholder="Name this nest"
                                    className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1 text-xs focus:border-[var(--accent)] focus:outline-none"
                                />
                                <button
                                    type="button"
                                    onClick={doSave}
                                    disabled={busy || !designName.trim()}
                                    className="flex min-h-[30px] items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                    style={{ background: ACCENT }}
                                >
                                    <Save size={12} aria-hidden />
                                    {currentDesignId ? 'Update' : 'Save'}
                                </button>
                            </div>
                            {currentDesignId && (
                                <button
                                    type="button"
                                    onClick={() => setCurrentDesignId(null)}
                                    className="text-[10px] text-neutral-500 underline hover:text-neutral-700"
                                >
                                    Save as a new nest instead
                                </button>
                            )}
                        </>
                    ) : (
                        <p className="text-[10px] text-neutral-400">
                            Upload artwork to save a nest — or reopen one below to
                            revise it.
                        </p>
                    )}
                    {saveError && (
                        <p className="text-[11px] text-red-600">{saveError}</p>
                    )}
                    {designs.length > 0 && (
                        <ul className="max-h-44 space-y-1 overflow-y-auto pr-1">
                            {designs.map((d) => (
                                <li
                                    key={d.id}
                                    className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 ${
                                        currentDesignId === d.id
                                            ? 'border-[#4e7e8c] bg-[#e8f0f3]'
                                            : 'border-neutral-200 hover:border-[#b8d0d8]'
                                    }`}
                                >
                                    <button
                                        type="button"
                                        onClick={() => doLoad(d.id)}
                                        disabled={busy}
                                        className="min-w-0 flex-1 text-left disabled:opacity-50"
                                    >
                                        <span className="block truncate text-[11px] font-medium text-neutral-700">
                                            {d.name}
                                        </span>
                                        <span className="block text-[9px] text-neutral-400">
                                            {new Date(
                                                d.updated_at,
                                            ).toLocaleDateString('en-GB')}
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => doDelete(d.id)}
                                        disabled={busy}
                                        aria-label={`Delete ${d.name}`}
                                        className="flex min-h-[28px] min-w-[28px] shrink-0 items-center justify-center rounded text-neutral-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                                    >
                                        <Trash2 size={13} aria-hidden />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <Section step={1} title="Artwork" active={!!imported}>
                    {!imported ? (
                        <div className="space-y-2">
                            <button
                                type="button"
                                onClick={() => inputRef.current?.click()}
                                className="flex w-full flex-col items-center gap-1 rounded-lg border-2 border-dashed border-neutral-300 px-4 py-6 text-neutral-400 hover:border-neutral-400 hover:text-neutral-600"
                            >
                                <Upload size={20} />
                                <span className="text-xs">
                                    Upload an SVG (outlined artwork)
                                </span>
                                <span className="text-[10px] text-neutral-400">
                                    Text must be converted to outlines first
                                </span>
                            </button>
                            <BinderButton
                                label="or pick from the binder"
                                onPick={(a) =>
                                    void handleFile(
                                        new File([a.svgSource], `${a.name}.svg`, {
                                            type: 'image/svg+xml',
                                        }),
                                    )
                                }
                                className="flex w-full items-center justify-center gap-1.5 rounded-md border border-neutral-200 px-3 py-2 text-[11px] font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
                            />
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-2">
                                <div className="min-w-0 text-xs text-neutral-600">
                                    <p className="truncate font-medium text-neutral-800">
                                        {fileName}
                                    </p>
                                    <p className="text-[10px] text-neutral-500">
                                        {pieces.length} piece
                                        {pieces.length === 1 ? '' : 's'} ·{' '}
                                        {Math.round(effectiveWidth)} ×{' '}
                                        {Math.round(
                                            (imported.bbox.h || 0) * factor,
                                        )}{' '}
                                        mm
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={clearAll}
                                    className="flex min-h-[28px] items-center gap-1 text-xs text-neutral-500 hover:text-red-600"
                                >
                                    <X size={12} aria-hidden /> Clear
                                </button>
                            </div>
                            <div className="flex items-end gap-2">
                                <div className="flex-1">
                                    <NumField
                                        label="Artwork width (mm)"
                                        step={1}
                                        min={1}
                                        value={Math.round(effectiveWidth * 10) / 10}
                                        onChange={(n) =>
                                            setWidthCal(n > 0 ? n : null)
                                        }
                                    />
                                </div>
                                {widthCal !== null && (
                                    <button
                                        type="button"
                                        onClick={() => setWidthCal(null)}
                                        title="Reset to the size in the file"
                                        className="flex min-h-[28px] items-center gap-1 rounded-md border border-neutral-300 px-2 py-1 text-[10px] font-medium text-neutral-600 hover:bg-neutral-100"
                                    >
                                        <RotateCcw size={11} aria-hidden /> Reset
                                    </button>
                                )}
                            </div>
                            <p className="text-[10px] text-neutral-400">
                                Height scales with width — use this if the SVG
                                came in at the wrong physical size.
                            </p>
                        </div>
                    )}
                    <input
                        ref={inputRef}
                        type="file"
                        accept=".svg,image/svg+xml"
                        className="hidden"
                        onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleFile(f);
                            e.target.value = '';
                        }}
                    />
                    {importError && (
                        <p className="text-xs text-red-600">{importError}</p>
                    )}
                    {imported &&
                        (imported.warnings.length > 0 ||
                            (built?.warnings.length ?? 0) > 0) && (
                            <div className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-2.5">
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                                    <AlertTriangle size={13} />
                                    Import notes
                                </div>
                                <ul className="list-disc pl-4 text-[11px] text-amber-700">
                                    {[
                                        ...imported.warnings,
                                        ...(built?.warnings ?? []),
                                    ].map((w, i) => (
                                        <li key={i}>{w}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                </Section>

                <Section step={2} title="Sheet & spacing" active={!!imported}>
                    <label className="block">
                        <span className="text-[10px] text-neutral-500">
                            Sheet preset
                        </span>
                        <select
                            value={presetValue}
                            onChange={(e) => {
                                const p = SHEET_PRESETS.find(
                                    (x) => x.label === e.target.value,
                                );
                                if (p) setSheetSize(p.w, p.h);
                            }}
                            className="mt-0.5 w-full rounded border border-neutral-300 px-1.5 py-1.5 text-xs focus:border-[var(--accent)] focus:outline-none"
                        >
                            {SHEET_PRESETS.map((p) => (
                                <option key={p.label} value={p.label}>
                                    {p.label}
                                </option>
                            ))}
                            <option value="custom" disabled={presetValue !== 'custom'}>
                                Custom
                            </option>
                        </select>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                        <NumField
                            label="Sheet width (mm)"
                            step={10}
                            min={1}
                            value={cfg.sheetWidthMm}
                            onChange={(n) =>
                                setCfg((c) => ({ ...c, sheetWidthMm: n }))
                            }
                        />
                        <NumField
                            label="Sheet height (mm)"
                            step={10}
                            min={1}
                            value={cfg.sheetHeightMm}
                            onChange={(n) =>
                                setCfg((c) => ({ ...c, sheetHeightMm: n }))
                            }
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <NumField
                            label="Gap between pieces (mm)"
                            step={0.5}
                            min={0}
                            value={cfg.gapMm}
                            onChange={(n) =>
                                setCfg((c) => ({ ...c, gapMm: Math.max(0, n) }))
                            }
                        />
                        <NumField
                            label="Edge margin (mm)"
                            step={1}
                            min={0}
                            value={cfg.marginMm}
                            onChange={(n) =>
                                setCfg((c) => ({
                                    ...c,
                                    marginMm: Math.max(0, n),
                                }))
                            }
                        />
                    </div>
                    <div>
                        <span className="text-[10px] text-neutral-500">
                            Rotation
                        </span>
                        <div className="mt-0.5 flex overflow-hidden rounded-md border border-neutral-300">
                            {(
                                [
                                    [0, 'Off'],
                                    [90, '90°'],
                                    [45, '45°'],
                                    [30, '30°'],
                                    [15, '15°'],
                                ] as const
                            ).map(([v, label], i) => (
                                <button
                                    key={v}
                                    type="button"
                                    onClick={() =>
                                        setCfg((c) => ({
                                            ...c,
                                            rotationStepDeg: v,
                                        }))
                                    }
                                    aria-pressed={cfg.rotationStepDeg === v}
                                    className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                                        i > 0
                                            ? 'border-l border-neutral-300'
                                            : ''
                                    } ${
                                        cfg.rotationStepDeg === v
                                            ? 'bg-[var(--accent)] text-white'
                                            : 'bg-white text-neutral-500 hover:bg-neutral-100'
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <p className="mt-0.5 text-[10px] text-neutral-400">
                            Finer steps pack tighter but take longer per pass.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() =>
                            setCfg((c) => ({
                                ...c,
                                allowHoleNesting: !c.allowHoleNesting,
                            }))
                        }
                        aria-pressed={cfg.allowHoleNesting}
                        className="flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left"
                        style={{
                            borderColor: cfg.allowHoleNesting
                                ? ACCENT_TINT_BORDER
                                : '#d4d4d4',
                            background: cfg.allowHoleNesting
                                ? ACCENT_TINT_BG
                                : '#fff',
                        }}
                    >
                        <span>
                            <span
                                className="block text-xs font-medium"
                                style={{
                                    color: cfg.allowHoleNesting
                                        ? ACCENT_DARK
                                        : '#525252',
                                }}
                            >
                                Nest into letter counters
                            </span>
                            <span className="block text-[10px] text-neutral-500">
                                Small pieces may sit inside the holes of O / D /
                                R — free material.
                            </span>
                        </span>
                        <span
                            className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                                cfg.allowHoleNesting ? '' : 'bg-neutral-300'
                            }`}
                            style={{
                                background: cfg.allowHoleNesting
                                    ? ACCENT
                                    : undefined,
                            }}
                            aria-hidden
                        >
                            <span
                                className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
                                    cfg.allowHoleNesting ? 'translate-x-4' : ''
                                }`}
                            />
                        </span>
                    </button>
                    {cfgIssues.length > 0 && (
                        <ul className="list-disc pl-4 text-[11px] text-red-600">
                            {cfgIssues.map((w, i) => (
                                <li key={i}>{w}</li>
                            ))}
                        </ul>
                    )}
                </Section>

                <Section step={3} title="Nest" active={!!solution}>
                    {!nest.running ? (
                      <div className="space-y-2">
                        <button
                            type="button"
                            onClick={startNest}
                            disabled={!canNest}
                            className="flex min-h-[40px] w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                            style={{ background: ACCENT }}
                            onMouseEnter={(e) => {
                                if (!e.currentTarget.disabled)
                                    e.currentTarget.style.background =
                                        ACCENT_DARK;
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = ACCENT;
                            }}
                        >
                            <Play size={15} aria-hidden />
                            {solution && !snapshot?.smallest
                                ? 'Nest again'
                                : `Nest ${pieces.length || ''} piece${pieces.length === 1 ? '' : 's'} on the sheet`}
                        </button>
                        <button
                            type="button"
                            onClick={startSmallest}
                            disabled={!canNest}
                            className="flex min-h-[36px] w-full items-center justify-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                            style={{
                                borderColor: ACCENT_TINT_BORDER,
                                color: ACCENT_DARK,
                                background: ACCENT_TINT_BG,
                            }}
                            title="Pack onto the smallest possible panel and report its size — handy for checking offcuts"
                        >
                            <Minimize2 size={13} aria-hidden />
                            Find smallest panel
                        </button>
                      </div>
                    ) : (
                        <div className="space-y-2">
                            <button
                                type="button"
                                onClick={nest.stop}
                                className="flex min-h-[40px] w-full items-center justify-center gap-2 rounded-md border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-100"
                            >
                                <Square size={13} aria-hidden /> Stop & keep best
                            </button>
                            <div className="h-1.5 overflow-hidden rounded-full bg-neutral-200">
                                <div
                                    className="h-full rounded-full transition-[width]"
                                    style={{
                                        width: `${Math.round((nest.iteration / Math.max(1, nest.totalIterations)) * 100)}%`,
                                        background: ACCENT,
                                    }}
                                />
                            </div>
                            <p className="text-[10px] text-neutral-500">
                                Improving layout — pass {nest.iteration} of{' '}
                                {nest.totalIterations}. The preview updates
                                whenever a better nest is found.
                            </p>
                        </div>
                    )}
                    {nest.error && (
                        <p className="text-xs text-red-600">{nest.error}</p>
                    )}
                    {stale && solution && (
                        <div className="flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-700">
                            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                            Settings or artwork changed since this nest — run it
                            again to update the layout.
                        </div>
                    )}
                    {solution && sheets.length > 0 && (
                        <div className="space-y-1 rounded-md border border-neutral-200 bg-neutral-50 p-2.5 text-[11px] text-neutral-600">
                            <p className="font-semibold text-neutral-800">
                                {solution.placements.length} of{' '}
                                {snapshot?.pieces.length ?? pieces.length} pieces
                                on {sheets.length} sheet
                                {sheets.length === 1 ? '' : 's'} ·{' '}
                                {(overallUtilisation * 100).toFixed(1)}% material
                                used
                            </p>
                            {solution.unplacedPieceIds.length > 0 && (
                                <p className="text-red-600">
                                    Didn&apos;t fit:{' '}
                                    {unplacedLabels.join(', ')}
                                    {solution.unplacedPieceIds.length >
                                    unplacedLabels.length
                                        ? '…'
                                        : ''}
                                </p>
                            )}
                        </div>
                    )}
                    {snapshot?.smallest && smallestPanel && (
                        <div
                            className="rounded-md border p-2.5 text-center"
                            style={{
                                borderColor: ACCENT,
                                background: ACCENT_TINT_BG,
                            }}
                        >
                            <p
                                className="text-[10px] font-semibold uppercase tracking-wide"
                                style={{ color: ACCENT_DARK }}
                            >
                                Smallest panel needed
                            </p>
                            <p
                                className="text-lg font-bold"
                                style={{ color: ACCENT_DARK }}
                            >
                                {smallestPanel.w} × {smallestPanel.h} mm
                            </p>
                            <p className="text-[10px] text-neutral-500">
                                Includes {snapshot.config.marginMm}mm edge margin —
                                an offcut at least this big will fit the job.
                            </p>
                        </div>
                    )}
                </Section>

                {pieces.length > 0 && (
                    <Section step={4} title={`Pieces (${pieces.length})`}>
                        <p className="text-[10px] text-neutral-400">
                            Hover a row to spot its pieces on the sheet. Toggle{' '}
                            <span className="font-medium">Keep</span> to pack a
                            group&apos;s pieces together as one block.
                        </p>
                        <ul className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
                            {groups.map((g) => {
                                const single = g.pieceIds.length === 1;
                                const first = pieceById.get(g.pieceIds[0]);
                                if (single && first) {
                                    return (
                                        <PieceRow
                                            key={g.id}
                                            piece={first}
                                            sheetIndex={sheetByPiece.get(
                                                first.id,
                                            )}
                                            hovered={highlight.has(first.id)}
                                            onHover={(on) =>
                                                setHover(
                                                    on
                                                        ? {
                                                              kind: 'piece',
                                                              id: first.id,
                                                          }
                                                        : null,
                                                )
                                            }
                                        />
                                    );
                                }
                                const open = expanded.has(g.id);
                                const kept = keptGroups.has(g.id);
                                return (
                                    <li key={g.id}>
                                        <div
                                            onMouseEnter={() =>
                                                setHover({
                                                    kind: 'group',
                                                    id: g.id,
                                                })
                                            }
                                            onMouseLeave={() => setHover(null)}
                                            className={`flex min-h-[36px] w-full items-center gap-1.5 rounded-md border bg-white px-2 py-1.5 ${
                                                kept
                                                    ? 'border-[#4e7e8c]'
                                                    : 'border-neutral-200 hover:border-[#b8d0d8] hover:bg-[#e8f0f3]'
                                            }`}
                                        >
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setExpanded((prev) => {
                                                        const next = new Set(
                                                            prev,
                                                        );
                                                        if (next.has(g.id))
                                                            next.delete(g.id);
                                                        else next.add(g.id);
                                                        return next;
                                                    })
                                                }
                                                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                            >
                                                <ChevronRight
                                                    size={13}
                                                    aria-hidden
                                                    className={`shrink-0 text-neutral-400 transition-transform ${open ? 'rotate-90' : ''}`}
                                                />
                                                <span className="min-w-0 flex-1 truncate text-xs font-medium text-neutral-700">
                                                    {g.label}
                                                </span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setKeptGroups((prev) => {
                                                        const next = new Set(
                                                            prev,
                                                        );
                                                        if (next.has(g.id))
                                                            next.delete(g.id);
                                                        else next.add(g.id);
                                                        return next;
                                                    })
                                                }
                                                aria-pressed={kept}
                                                title="Keep this group's pieces together when nesting"
                                                className={`flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
                                                    kept
                                                        ? 'text-white'
                                                        : 'border-neutral-300 text-neutral-500 hover:border-[#4e7e8c] hover:text-[#3a5f6a]'
                                                }`}
                                                style={
                                                    kept
                                                        ? {
                                                              background: ACCENT,
                                                              borderColor:
                                                                  ACCENT,
                                                          }
                                                        : undefined
                                                }
                                            >
                                                <Link2
                                                    size={10}
                                                    aria-hidden
                                                />
                                                {kept ? 'Kept' : 'Keep'}
                                            </button>
                                            <span
                                                className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white"
                                                style={{ background: ACCENT }}
                                            >
                                                {g.pieceIds.length}
                                            </span>
                                        </div>
                                        {open && (
                                            <ul className="mt-1 space-y-1 pl-4">
                                                {g.pieceIds.map((id) => {
                                                    const p = pieceById.get(id);
                                                    if (!p) return null;
                                                    return (
                                                        <PieceRow
                                                            key={id}
                                                            piece={p}
                                                            sheetIndex={sheetByPiece.get(
                                                                id,
                                                            )}
                                                            hovered={highlight.has(
                                                                id,
                                                            )}
                                                            onHover={(on) =>
                                                                setHover(
                                                                    on
                                                                        ? {
                                                                              kind: 'piece',
                                                                              id,
                                                                          }
                                                                        : null,
                                                                )
                                                            }
                                                        />
                                                    );
                                                })}
                                            </ul>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </Section>
                )}
            </div>

            {/* ------------------------------------------------ canvas side */}
            <div className="space-y-3">
                {sourceJob && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#b8d0d8] bg-[#e8f0f3] px-3 py-2 text-xs text-[#3a5f6a]">
                        <span className="flex items-center gap-1.5">
                            <Hammer size={14} aria-hidden />
                            Part of built-up job{' '}
                            <b className="font-semibold">{sourceJob.name}</b> —
                            faces + returns nested on one sheet.
                        </span>
                        <Link
                            href={`/admin/visualiser/returns?id=${sourceJob.id}`}
                            className="flex items-center gap-1 rounded-md border border-[#b8d0d8] bg-white px-2 py-1 font-medium hover:bg-white/70"
                        >
                            <ExternalLink size={12} aria-hidden /> Open job
                        </Link>
                    </div>
                )}
                {sourceDesign && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#b8d0d8] bg-[#e8f0f3] px-3 py-2 text-xs text-[#3a5f6a]">
                        <span className="flex items-center gap-1.5">
                            <Layers size={14} aria-hidden />
                            Metal faces from{' '}
                            <b className="font-semibold">{sourceDesign.name}</b> —
                            cut to the letter shapes.
                        </span>
                        <Link
                            href={`/admin/visualiser?id=${sourceDesign.id}`}
                            className="flex items-center gap-1 rounded-md border border-[#b8d0d8] bg-white px-2 py-1 font-medium hover:bg-white/70"
                        >
                            <ExternalLink size={12} aria-hidden /> Open design
                        </Link>
                    </div>
                )}
                {!imported ? (
                    <div className="flex min-h-[360px] flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-neutral-200 bg-white p-8 text-center">
                        <Upload size={28} className="text-neutral-300" />
                        <p className="text-sm font-medium text-neutral-500">
                            Upload an artwork SVG to start
                        </p>
                        <p className="max-w-md text-xs text-neutral-400">
                            The tool splits the artwork into individual cut
                            pieces (keeping the islands inside letters like D
                            and R), then packs them onto your sheet size with
                            the gap you choose.
                        </p>
                    </div>
                ) : !solution ? (
                    <div className="space-y-2">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                            Imported artwork — {pieces.length} piece
                            {pieces.length === 1 ? '' : 's'} found
                        </p>
                        <ArtworkPreview
                            pieces={pieces}
                            highlight={highlight}
                            onHoverPiece={(id) =>
                                setHover(id ? { kind: 'piece', id } : null)
                            }
                        />
                        <p className="text-[10px] text-neutral-400">
                            Check the split looks right (hover the piece list),
                            then hit Nest.
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Sheet tabs */}
                        <div className="flex flex-wrap items-center gap-1.5">
                            {sheets.map((s) => (
                                <button
                                    key={s.index}
                                    type="button"
                                    onClick={() => setActiveSheet(s.index)}
                                    aria-pressed={activeSheet === s.index}
                                    className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                                        activeSheet === s.index
                                            ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                                            : 'border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-100'
                                    }`}
                                >
                                    Sheet {s.index + 1}
                                    <span
                                        className={`ml-1.5 ${activeSheet === s.index ? 'text-neutral-300' : 'text-neutral-400'}`}
                                    >
                                        {(s.utilisation * 100).toFixed(0)}%
                                    </span>
                                </button>
                            ))}
                            {nest.running && (
                                <span className="text-[11px] text-neutral-400">
                                    improving…
                                </span>
                            )}
                        </div>

                        <SheetView
                            pieces={canvasPieces}
                            placements={activePlacements}
                            config={canvasConfig}
                            highlight={highlight}
                            onHoverPiece={(id) =>
                                setHover(id ? { kind: 'piece', id } : null)
                            }
                        />

                        {activeStats && (
                            <p className="text-[11px] text-neutral-500">
                                {canvasConfig.sheetWidthMm} ×{' '}
                                {canvasConfig.sheetHeightMm} mm ·{' '}
                                {activeStats.pieceCount} pieces ·{' '}
                                {(activeStats.utilisation * 100).toFixed(1)}%
                                used · pieces occupy{' '}
                                {Math.ceil(activeStats.usedWidthMm)} ×{' '}
                                {Math.ceil(activeStats.usedHeightMm)} mm
                                {activeSheet === sheets.length - 1 && (
                                    <>
                                        {' '}
                                        · smallest off-cut that fits:{' '}
                                        <span className="font-semibold text-neutral-700">
                                            {Math.ceil(
                                                activeStats.usedWidthMm +
                                                    2 * canvasConfig.marginMm,
                                            )}{' '}
                                            ×{' '}
                                            {Math.ceil(
                                                activeStats.usedHeightMm +
                                                    2 * canvasConfig.marginMm,
                                            )}{' '}
                                            mm
                                        </span>
                                    </>
                                )}
                            </p>
                        )}

                        {/* Export bar */}
                        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-white p-2.5">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                                Export
                            </span>
                            <button
                                type="button"
                                onClick={() => exportSheetSvg(activeSheet)}
                                className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:border-[#4e7e8c] hover:bg-[#e8f0f3] hover:text-[#3a5f6a]"
                            >
                                <Download size={13} aria-hidden /> SVG — sheet{' '}
                                {activeSheet + 1}
                            </button>
                            <button
                                type="button"
                                onClick={() => exportSheetDxf(activeSheet)}
                                className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:border-[#4e7e8c] hover:bg-[#e8f0f3] hover:text-[#3a5f6a]"
                            >
                                <Download size={13} aria-hidden /> DXF — sheet{' '}
                                {activeSheet + 1}
                            </button>
                            {sheets.length > 1 && (
                                <button
                                    type="button"
                                    onClick={exportAllSheets}
                                    className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:border-[#4e7e8c] hover:bg-[#e8f0f3] hover:text-[#3a5f6a]"
                                >
                                    <Download size={13} aria-hidden /> All sheets
                                    (SVG + DXF)
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={exportPdf}
                                className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:border-[#4e7e8c] hover:bg-[#e8f0f3] hover:text-[#3a5f6a]"
                            >
                                <FileText size={13} aria-hidden /> PDF summary
                            </button>
                            {stale && (
                                <span className="text-[10px] text-amber-600">
                                    Exports reflect the last run, not the new
                                    settings.
                                </span>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

function PieceRow({
    piece,
    sheetIndex,
    hovered,
    onHover,
}: {
    piece: NestPiece;
    sheetIndex: number | undefined;
    hovered: boolean;
    onHover: (on: boolean) => void;
}) {
    return (
        <li className="list-none">
            <div
                onMouseEnter={() => onHover(true)}
                onMouseLeave={() => onHover(false)}
                className={`flex min-h-[36px] items-center gap-2 rounded-md border bg-white px-2 py-1.5 ${
                    hovered
                        ? 'border-[#4e7e8c] bg-[#e8f0f3]'
                        : 'border-neutral-200 hover:border-[#b8d0d8]'
                }`}
            >
                <MiniThumb piece={piece} fill={hovered ? ACCENT : '#1a1f23'} />
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-medium text-neutral-700">
                        {piece.label}
                    </span>
                    <span className="block text-[10px] text-neutral-400">
                        {Math.ceil(piece.widthMm)} × {Math.ceil(piece.heightMm)}{' '}
                        mm
                    </span>
                </span>
                <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        sheetIndex === undefined
                            ? 'bg-neutral-100 text-neutral-400'
                            : 'text-white'
                    }`}
                    style={
                        sheetIndex === undefined
                            ? undefined
                            : { background: ACCENT }
                    }
                    title={
                        sheetIndex === undefined
                            ? 'Not nested yet'
                            : `On sheet ${sheetIndex + 1}`
                    }
                >
                    {sheetIndex === undefined ? '—' : `S${sheetIndex + 1}`}
                </span>
            </div>
        </li>
    );
}
