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
    keylineMm: 0,
    materialThicknessMm: 5,
    materialLabel: 'Aluminium',
    aperturePlacement: null,
    apertureMode: 'aperture',
    fixingDiameterMm: 10,
    fixingDensity: 1,
};

interface VisualiserState {
    params: PanelParams;
    svgSource: string | null;
    imported: ImportedSvg | null;
    designId: string | null;
    quoteId: string | null;
    quoteItemId: string | null;
    dirty: boolean;

    setParam: <K extends keyof PanelParams>(k: K, v: PanelParams[K]) => void;
    setReturn: (edge: PanelEdge, on: boolean) => void;
    setPlacement: (
        patch: Partial<NonNullable<PanelParams['aperturePlacement']>>,
    ) => void;
    setSvg: (source: string, imported: ImportedSvg) => void;
    clearSvg: () => void;
    loadDesign: (row: VisualiserDesignRow, imported: ImportedSvg | null) => void;
    applyPrefill: (patch: Partial<PanelParams>, quoteId: string | null, quoteItemId: string) => void;
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

    setParam: (k, v) =>
        set((s) => ({ params: { ...s.params, [k]: v }, dirty: true })),

    setReturn: (edge, on) =>
        set((s) => ({
            params: { ...s.params, returns: { ...s.params.returns, [edge]: on } },
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
            },
            dirty: true,
        })),

    clearSvg: () =>
        set((s) => ({
            svgSource: null,
            imported: null,
            params: { ...s.params, aperturePlacement: null },
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

    markSaved: (id) => set({ designId: id, dirty: false }),
}));
