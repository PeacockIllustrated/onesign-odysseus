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

type GroupMaterial =
    | 'cut'
    | 'solid'
    | 'vinyl'
    | 'acrylic'
    | 'standoff'
    | 'pushthrough';

type MaterialGroup = NonNullable<PanelParams['materialGroups']>[number];

let idCounter = 0;
function nextGroupId(): string {
    idCounter += 1;
    return `g${Date.now().toString(36)}${idCounter}`;
}

function defaultGroupColor(
    material: GroupMaterial,
    panelColor: string | undefined,
): string {
    if (material === 'solid') return panelColor ?? '#d6d6d6';
    if (material === 'vinyl') return '#ffffff';
    // Push-through inserts default to a bright opal-white acrylic; the
    // most common production case is illuminated lettering.
    if (material === 'pushthrough') return '#f5f5f0';
    // acrylic, standoff, cut — dark default. 'cut' colour is unused
    // visually (the path is a hole) but the field needs a value.
    return '#1a1f23';
}

function defaultGroupThickness(material: GroupMaterial): number | undefined {
    if (material === 'acrylic') return 5;
    if (material === 'standoff') return 5;
    if (material === 'pushthrough') return 5;
    return undefined;
}

function defaultGroupStandoff(material: GroupMaterial): number | undefined {
    if (material === 'standoff') return 25;
    return undefined;
}

function defaultGroupKeylineOffset(
    material: GroupMaterial,
): number | undefined {
    // 1.5 mm shoulder for a typical 3 mm acrylic press-fit. The
    // operator can tighten / slacken per group when needed.
    if (material === 'pushthrough') return 1.5;
    return undefined;
}

function defaultGroupProtrusion(material: GroupMaterial): number | undefined {
    // 5 mm proud-of-face protrusion reads clearly in the 3D preview
    // without being unrealistically tall.
    if (material === 'pushthrough') return 5;
    return undefined;
}

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
     * removes the nearest manual fixing within a tolerance.
     */
    fixingMode: 'off' | 'place' | 'delete';
    /**
     * Material-group editor state. When non-null the operator is
     * picking paths in the canvas to bundle into a group:
     *   - 'new'           — building a brand-new group
     *   - <group.id>      — editing an existing group's members
     * `pendingPaths` is the working set of imported-path indices in
     * the current edit; clicks on the canvas toggle entries in it.
     */
    editingGroupId: string | null;
    pendingPaths: number[];

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

    /* Material group actions */
    startNewGroupEdit: () => void;
    startEditingGroup: (groupId: string) => void;
    cancelGroupEdit: () => void;
    togglePendingPath: (pathIndex: number) => void;
    /**
     * Commit the current edit. `material === 'cut'` removes the pending
     * paths from any group they're in (and deletes the group being
     * edited if applicable) — effectively reverting them to the
     * default-for-ungrouped behaviour driven by apertureMode. Any
     * other material creates or updates a group with the pending
     * paths as its members.
     */
    applyEditMaterial: (
        material: GroupMaterial,
        options?: {
            color?: string;
            thicknessMm?: number;
            standoffDistanceMm?: number;
            keylineOffsetMm?: number;
            protrusionMm?: number;
        },
    ) => void;
    updateGroupProps: (
        groupId: string,
        patch: {
            color?: string;
            thicknessMm?: number;
            standoffDistanceMm?: number;
            keylineOffsetMm?: number;
            protrusionMm?: number;
            label?: string;
        },
    ) => void;
    deleteGroup: (groupId: string) => void;

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
    editingGroupId: null,
    pendingPaths: [],

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
            // Nested paths (inner counters of letters) are now treated
            // as HOLES in their parent's compound shape — not as
            // separate "solid" pieces. The previous auto-seed of a
            // "Counters (auto)" solid group was conceptually wrong:
            // a counter is absence, not material, and emitting it as
            // a closed contour in the production PDF made the cutter
            // cut the counter loose (it would fall away with the
            // letter-piece anyway during fabrication, so the extra
            // cut was useless).
            //
            // Real CAM survival of inner counters requires either
            // bridges/tabs (stencil style) or a keyline + push-through
            // acrylic insert (the counter is then a hole in the insert,
            // not panel material). The UI surfaces a warning when an
            // aperture cut has counters but no keyline, with a one-
            // click "Enable keyline" fix.
            svgSource: source,
            imported,
            params: {
                ...s.params,
                aperturePlacement:
                    s.params.aperturePlacement ?? DEFAULT_PLACEMENT,
                materialGroups: [],
            },
            editingGroupId: null,
            pendingPaths: [],
            dirty: true,
        })),

    clearSvg: () =>
        set((s) => ({
            svgSource: null,
            imported: null,
            params: {
                ...s.params,
                aperturePlacement: null,
                materialGroups: [],
            },
            editingGroupId: null,
            pendingPaths: [],
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
            editingGroupId: null,
            pendingPaths: [],
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

    /* ------------------------------------------------------------------ *
     * Material groups
     * ------------------------------------------------------------------ */

    startNewGroupEdit: () =>
        set({
            editingGroupId: 'new',
            pendingPaths: [],
            // Fixing edits can't run at the same time as a group edit.
            fixingMode: 'off',
        }),

    startEditingGroup: (groupId) =>
        set((s) => {
            const g = (s.params.materialGroups ?? []).find(
                (x) => x.id === groupId,
            );
            return {
                editingGroupId: groupId,
                pendingPaths: g ? [...g.pathIndices] : [],
                fixingMode: 'off',
            };
        }),

    cancelGroupEdit: () => set({ editingGroupId: null, pendingPaths: [] }),

    togglePendingPath: (pathIndex) =>
        set((s) => ({
            pendingPaths: s.pendingPaths.includes(pathIndex)
                ? s.pendingPaths.filter((p) => p !== pathIndex)
                : [...s.pendingPaths, pathIndex],
        })),

    applyEditMaterial: (material, options) =>
        set((s) => {
            const pending = s.pendingPaths;
            const editingId = s.editingGroupId;
            const list = s.params.materialGroups ?? [];

            // No-op if there's nothing to apply and no existing group
            // to delete — just close the editor.
            if (pending.length === 0 && (editingId === 'new' || !editingId)) {
                return {
                    editingGroupId: null,
                    pendingPaths: [],
                };
            }

            // Strip pending paths from every OTHER group first — a path
            // can only belong to one group at a time.
            const stripped = list
                .map((g) =>
                    g.id === editingId
                        ? g
                        : {
                              ...g,
                              pathIndices: g.pathIndices.filter(
                                  (i) => !pending.includes(i),
                              ),
                          },
                )
                .filter((g) => g.pathIndices.length > 0);

            // Cut, or apply with an empty selection on an existing
            // group, both mean "this group should no longer exist" —
            // drop the editing target if it was a real group.
            if (material === 'cut' || pending.length === 0) {
                const next = stripped.filter((g) => g.id !== editingId);
                return {
                    params: { ...s.params, materialGroups: next },
                    editingGroupId: null,
                    pendingPaths: [],
                    dirty: true,
                };
            }

            // Solid / vinyl / acrylic / standoff — create or update.
            const existing =
                editingId && editingId !== 'new'
                    ? list.find((g) => g.id === editingId)
                    : undefined;
            const color =
                options?.color ??
                existing?.color ??
                defaultGroupColor(material, s.params.panelColor);
            const thicknessMm =
                options?.thicknessMm ??
                existing?.thicknessMm ??
                defaultGroupThickness(material);
            const standoffDistanceMm =
                options?.standoffDistanceMm ??
                existing?.standoffDistanceMm ??
                defaultGroupStandoff(material);
            const keylineOffsetMm =
                options?.keylineOffsetMm ??
                existing?.keylineOffsetMm ??
                defaultGroupKeylineOffset(material);
            const protrusionMm =
                options?.protrusionMm ??
                existing?.protrusionMm ??
                defaultGroupProtrusion(material);

            const updated: MaterialGroup = {
                id: existing?.id ?? nextGroupId(),
                label: existing?.label,
                material,
                color,
                thicknessMm,
                standoffDistanceMm,
                keylineOffsetMm,
                protrusionMm,
                pathIndices: [...pending].sort((a, b) => a - b),
            };

            const withoutOld = stripped.filter((g) => g.id !== updated.id);
            return {
                params: {
                    ...s.params,
                    materialGroups: [...withoutOld, updated],
                },
                editingGroupId: null,
                pendingPaths: [],
                dirty: true,
            };
        }),

    updateGroupProps: (groupId, patch) =>
        set((s) => {
            const list = s.params.materialGroups ?? [];
            const next = list.map((g) =>
                g.id === groupId
                    ? {
                          ...g,
                          color: patch.color ?? g.color,
                          thicknessMm:
                              patch.thicknessMm ?? g.thicknessMm,
                          standoffDistanceMm:
                              patch.standoffDistanceMm ??
                              g.standoffDistanceMm,
                          keylineOffsetMm:
                              patch.keylineOffsetMm ?? g.keylineOffsetMm,
                          protrusionMm:
                              patch.protrusionMm ?? g.protrusionMm,
                          label: patch.label ?? g.label,
                      }
                    : g,
            );
            return {
                params: { ...s.params, materialGroups: next },
                dirty: true,
            };
        }),

    deleteGroup: (groupId) =>
        set((s) => ({
            params: {
                ...s.params,
                materialGroups: (s.params.materialGroups ?? []).filter(
                    (g) => g.id !== groupId,
                ),
            },
            editingGroupId:
                s.editingGroupId === groupId ? null : s.editingGroupId,
            pendingPaths: s.editingGroupId === groupId ? [] : s.pendingPaths,
            dirty: true,
        })),

    markSaved: (id) => set({ designId: id, dirty: false }),
}));
