'use client';

import { create } from 'zustand';
import {
    DEFAULT_PLACEMENT,
    type PanelParams,
    type PanelEdge,
    type ImportedSvg,
    type VisualiserDesignRow,
} from '@/lib/visualiser/types';

export const DEFAULT_PARAMS: PanelParams = {
    name: 'Untitled panel',
    panelWidthMm: 2400,
    panelHeightMm: 400,
    returnDepthMm: 50,
    returns: { top: true, bottom: true, left: true, right: true },
    shadowGapMm: 0,
    shadowGapEdges: { top: true, bottom: true },
    keylineMm: 0,
    materialThicknessMm: 5,
    materialLabel: 'Aluminium',
    panelColor: '#d6d6d6',
    aperturePlacement: null,
    apertureMode: 'aperture',
    fixingDiameterMm: 10,
    fixingDensity: 1,
    letterThicknessMm: 5,
    standoffDistanceMm: 25,
    letterColor: '#1a1f23',
    manualFixings: [],
};

interface VisualiserState {
    params: PanelParams;
    svgSource: string | null;
    imported: ImportedSvg | null;
    designId: string | null;
    quoteId: string | null;
    quoteItemId: string | null;
    dirty: boolean;
    /**
     * Current fixing-edit mode. 'place' drops a fixing on click; 'delete'
     * removes the nearest manual fixing within a tolerance. 'off' is the
     * default — clicks don't affect fixings. Stored on `params.manualFixings`
     * in SVG-local coords so fixings track the lettering across placement
     * changes (re-aligning the SVG drags the fixings with it).
     */
    fixingMode: 'off' | 'place' | 'delete';
    /**
     * Imported SVG path index currently selected for material editing.
     * Set by clicks on the flat preview; reset to null on background
     * clicks or when a new SVG is loaded.
     */
    selectedPathIndex: number | null;

    setParam: <K extends keyof PanelParams>(k: K, v: PanelParams[K]) => void;
    setReturn: (edge: PanelEdge, on: boolean) => void;
    setShadowGapEdge: (edge: 'top' | 'bottom', on: boolean) => void;
    setPlacement: (
        patch: Partial<NonNullable<PanelParams['aperturePlacement']>>,
    ) => void;
    setSvg: (source: string, imported: ImportedSvg) => void;
    clearSvg: () => void;
    loadDesign: (row: VisualiserDesignRow, imported: ImportedSvg | null) => void;
    applyPrefill: (patch: Partial<PanelParams>, quoteId: string | null, quoteItemId: string) => void;
    addManualFixing: (p: [number, number]) => void;
    removeManualFixing: (index: number) => void;
    clearManualFixings: () => void;
    setFixingMode: (m: 'off' | 'place' | 'delete') => void;
    setSelectedPathIndex: (i: number | null) => void;
    setPathMaterial: (
        pathIndex: number,
        patch:
            | null
            | {
                  material: 'vinyl' | 'acrylic';
                  color?: string;
                  thicknessMm?: number;
              },
    ) => void;
    markSaved: (id: string) => void;
}

export const useVisualiser = create<VisualiserState>((set) => ({
    params: DEFAULT_PARAMS,
    svgSource: null,
    imported: null,
    designId: null,
    quoteId: null,
    quoteItemId: null,
    dirty: false,
    fixingMode: 'off',
    selectedPathIndex: null,

    setParam: (k, v) =>
        set((s) => ({ params: { ...s.params, [k]: v }, dirty: true })),

    setReturn: (edge, on) =>
        set((s) => ({
            params: { ...s.params, returns: { ...s.params.returns, [edge]: on } },
            dirty: true,
        })),

    setShadowGapEdge: (edge, on) =>
        set((s) => ({
            params: {
                ...s.params,
                shadowGapEdges: {
                    ...(s.params.shadowGapEdges ?? { top: true, bottom: true }),
                    [edge]: on,
                },
            },
            dirty: true,
        })),

    setPlacement: (patch) =>
        set((s) => ({
            params: {
                ...s.params,
                aperturePlacement: {
                    ...DEFAULT_PLACEMENT,
                    ...(s.params.aperturePlacement ?? {}),
                    ...patch,
                },
            },
            dirty: true,
        })),

    setSvg: (source, imported) =>
        set((s) => ({
            svgSource: source,
            imported,
            params: {
                ...s.params,
                aperturePlacement:
                    s.params.aperturePlacement ?? DEFAULT_PLACEMENT,
                // Path indices change with the new artwork, so any prior
                // material assignments would point at the wrong shapes.
                nonCutPaths: [],
            },
            selectedPathIndex: null,
            dirty: true,
        })),

    clearSvg: () =>
        set((s) => ({
            svgSource: null,
            imported: null,
            params: {
                ...s.params,
                aperturePlacement: null,
                nonCutPaths: [],
            },
            selectedPathIndex: null,
            dirty: true,
        })),

    loadDesign: (row, imported) =>
        set({
            params: row.params_json,
            svgSource: row.svg_source,
            imported,
            designId: row.id,
            quoteId: row.quote_id,
            quoteItemId: row.quote_item_id,
            dirty: false,
        }),

    applyPrefill: (patch, quoteId, quoteItemId) =>
        set((s) => ({
            params: { ...s.params, ...patch },
            quoteId,
            quoteItemId,
            dirty: true,
        })),

    addManualFixing: (p) =>
        set((s) => ({
            params: {
                ...s.params,
                manualFixings: [...(s.params.manualFixings ?? []), p],
            },
            dirty: true,
        })),

    removeManualFixing: (index) =>
        set((s) => {
            const list = s.params.manualFixings ?? [];
            if (index < 0 || index >= list.length) return {} as Partial<VisualiserState>;
            const next = list.filter((_, i) => i !== index);
            // If the operator was deleting and just removed the last
            // fixing, drop them out of delete mode automatically — the
            // delete pill disables itself with an empty list and the
            // user would otherwise be stuck on a now-inert mode.
            const nextMode =
                s.fixingMode === 'delete' && next.length === 0
                    ? ('off' as const)
                    : s.fixingMode;
            return {
                params: { ...s.params, manualFixings: next },
                fixingMode: nextMode,
                dirty: true,
            };
        }),

    clearManualFixings: () =>
        set((s) => ({
            params: { ...s.params, manualFixings: [] },
            fixingMode:
                s.fixingMode === 'delete' ? ('off' as const) : s.fixingMode,
            dirty: true,
        })),

    setFixingMode: (m) => set({ fixingMode: m }),

    setSelectedPathIndex: (i) => set({ selectedPathIndex: i }),

    setPathMaterial: (pathIndex, patch) =>
        set((s) => {
            const list = s.params.nonCutPaths ?? [];
            const idx = list.findIndex((e) => e.pathIndex === pathIndex);
            // Null removes the override → path goes back to "cut".
            if (patch === null) {
                if (idx < 0) return {} as Partial<VisualiserState>;
                const next = list.filter((_, i) => i !== idx);
                return {
                    params: { ...s.params, nonCutPaths: next },
                    dirty: true,
                };
            }
            const existing = idx >= 0 ? list[idx] : undefined;
            const merged = {
                pathIndex,
                material: patch.material,
                color:
                    patch.color ??
                    existing?.color ??
                    (patch.material === 'vinyl' ? '#ffffff' : '#1a1f23'),
                thicknessMm:
                    patch.thicknessMm ??
                    existing?.thicknessMm ??
                    (patch.material === 'acrylic' ? 5 : undefined),
            };
            const next = idx >= 0
                ? list.map((e, i) => (i === idx ? merged : e))
                : [...list, merged];
            return {
                params: { ...s.params, nonCutPaths: next },
                dirty: true,
            };
        }),

    markSaved: (id) => set({ designId: id, dirty: false }),
}));
