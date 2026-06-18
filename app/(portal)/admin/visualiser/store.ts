'use client';

import { create } from 'zustand';
import {
    DEFAULT_PLACEMENT,
    type PanelParams,
    type PanelEdge,
    type ImportedSvg,
    type ProjectingMount,
    type VisualiserDesignRow,
    type FaceMaterial,
} from '@/lib/visualiser/types';
import { importSvg } from '@/lib/visualiser/svg-import';
import { seedProjectingFromMain } from '@/lib/visualiser/projecting';

/** Import an SVG, swallowing parse errors (returns null on failure). */
function safeImport(svg: string): ImportedSvg | null {
    try {
        return importSvg(svg);
    } catch {
        return null;
    }
}

/** Which panel the controls + flat editor are currently editing. */
export type SignTab = 'main' | 'projecting';

/** The editable state of one panel: its params + its uploaded aperture SVG. */
export interface PanelSlot {
    params: PanelParams;
    svgSource: string | null;
    imported: ImportedSvg | null;
}

type ArtworkLayer = NonNullable<PanelParams['artworkLayers']>[number];

let layerCounter = 0;
function nextLayerId(): string {
    layerCounter += 1;
    return `L${Date.now().toString(36)}${layerCounter}`;
}

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
    cableHoles: [],
    cableHoleDiameterMm: 10,
};

type GroupMaterial =
    | 'cut'
    | 'solid'
    | 'vinyl'
    | 'acrylic'
    | 'standoff'
    | 'pushthrough'
    | 'backlight';

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
    // Backlight glow defaults to a warm white — the most common opal
    // backlight look; the operator picks a colour per element.
    if (material === 'backlight') return '#fff4e0';
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
     * Current cable-hole edit mode — mutually exclusive with fixingMode
     * and group edit. 'place' drops a cable hole on click; 'delete'
     * removes the nearest one. Cable holes are pure positioners (no
     * auto-placement), so there's no density / count concept.
     */
    cableMode: 'off' | 'place' | 'delete';
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
    /** Selected artwork layer (multi-layer composition). */
    selectedLayerId: string | null;

    /**
     * A design is a main fascia panel that may also carry a projecting (blade)
     * sign. To keep every existing per-panel action operating on a single
     * `params`/`svgSource`/`imported` target, only ONE panel is "live" at a
     * time (the active tab); the other is stashed in `inactive` and swapped in
     * on tab change. `mount` is the projecting sign's attachment spec.
     */
    activeTab: SignTab;
    projectingEnabled: boolean;
    inactive: PanelSlot | null;
    mount: ProjectingMount;

    setParam: <K extends keyof PanelParams>(k: K, v: PanelParams[K]) => void;
    /** Merge a patch into the projecting sign's mount spec. */
    setMount: (patch: Partial<ProjectingMount>) => void;
    /** Switch which panel the editor is editing (stashes/swaps the other). */
    setActiveTab: (tab: SignTab) => void;
    /** Add a projecting sign, seeded as a mirror of the main panel. */
    enableProjecting: () => void;
    /** Remove the projecting sign (returns to editing the main panel). */
    disableProjecting: () => void;
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

    /* Artwork-layer actions (multi-layer composition) */
    addArtworkLayer: (svgSource: string, label?: string) => void;
    updateArtworkLayer: (
        id: string,
        patch: Partial<Pick<ArtworkLayer, 'xMm' | 'yMm' | 'scale' | 'label'>>,
    ) => void;
    removeArtworkLayer: (id: string) => void;
    reorderArtworkLayer: (id: string, dir: 'up' | 'down') => void;
    selectLayer: (id: string | null) => void;

    /* Cable-hole actions (positioner — manual place/delete only) */
    addCableHole: (p: [number, number]) => void;
    removeCableHole: (index: number) => void;
    clearCableHoles: () => void;
    setCableMode: (m: 'off' | 'place' | 'delete') => void;

    /* Material group actions */
    startNewGroupEdit: () => void;
    startEditingGroup: (groupId: string) => void;
    /**
     * Click-to-edit entry point: given a path, enter that path's
     * group's edit mode if it's already grouped, otherwise start a
     * brand-new group with that path pre-selected. Lets the operator
     * skip the "+ New material group" button entirely for the common
     * case of "I want to change THIS letter's material".
     */
    startGroupEditFromPath: (pathIndex: number) => void;
    cancelGroupEdit: () => void;
    togglePendingPath: (pathIndex: number) => void;
    /**
     * Reset a single shape back to the whole-sign default — strip it from
     * whatever override group it belongs to, dropping any group left empty.
     * Doesn't touch the current edit selection. Used by the per-shape
     * "reset to default" control in the Materials list.
     */
    removePathFromGroups: (pathIndex: number) => void;
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
            printFullColor?: boolean;
            glowIntensity?: number;
            /** Extra metal face over the group's letters; null clears it. */
            extraFace?: { material: FaceMaterial; thicknessMm: number } | null;
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
            printFullColor?: boolean;
            glowIntensity?: number;
            label?: string;
            /** Extra metal face over this group's letters; null clears it. */
            extraFace?: { material: FaceMaterial; thicknessMm: number } | null;
        },
    ) => void;
    deleteGroup: (groupId: string) => void;

    markSaved: (id: string) => void;

    /**
     * When true the 3D scene renders annotation-free (no outlines / fixings /
     * register lines / dimensions) so the export bar can grab a clean, "as
     * installed" in-situ render for the production pack. Toggled around a
     * capture, then reset.
     */
    captureClean: boolean;
    setCaptureClean: (v: boolean) => void;
}

/**
 * Resolve the two panels from store state regardless of which tab is live.
 * The active tab's editing state is the "live" slot; the other (if any) is
 * stashed in `inactive`. Shared by the 3D composite + the save/export path so
 * they always agree on which panel is main and which is projecting.
 */
export function splitPanels(s: {
    activeTab: SignTab;
    projectingEnabled: boolean;
    params: PanelParams;
    svgSource: string | null;
    imported: ImportedSvg | null;
    inactive: PanelSlot | null;
}): { main: PanelSlot; projecting: PanelSlot | null } {
    const live: PanelSlot = {
        params: s.params,
        svgSource: s.svgSource,
        imported: s.imported,
    };
    if (!s.projectingEnabled || !s.inactive) return { main: live, projecting: null };
    return s.activeTab === 'main'
        ? { main: live, projecting: s.inactive }
        : { main: s.inactive, projecting: live };
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
    cableMode: 'off',
    editingGroupId: null,
    pendingPaths: [],
    selectedLayerId: null,
    activeTab: 'main',
    projectingEnabled: false,
    inactive: null,
    mount: {},

    setParam: (k, v) =>
        set((s) => ({ params: { ...s.params, [k]: v }, dirty: true })),

    setMount: (patch) =>
        set((s) => ({ mount: { ...s.mount, ...patch }, dirty: true })),

    setActiveTab: (tab) =>
        set((s) => {
            if (tab === s.activeTab) return {};
            // Can't edit a projecting panel that doesn't exist.
            if (!s.projectingEnabled || !s.inactive) return {};
            // Swap: stash the live panel, promote the stashed one. All other
            // per-panel edit modes reset so a half-finished pick on one panel
            // doesn't bleed onto the other.
            const stash: PanelSlot = {
                params: s.params,
                svgSource: s.svgSource,
                imported: s.imported,
            };
            return {
                activeTab: tab,
                params: s.inactive.params,
                svgSource: s.inactive.svgSource,
                imported: s.inactive.imported,
                inactive: stash,
                fixingMode: 'off',
                cableMode: 'off',
                editingGroupId: null,
                pendingPaths: [],
                selectedLayerId: null,
            };
        }),

    enableProjecting: () =>
        set((s) => {
            if (s.projectingEnabled) return {};
            // Seed from whichever panel is the main one right now. We only ever
            // enable from the main tab, but resolve defensively.
            const { main } = splitPanels(s);
            const seed = seedProjectingFromMain(main.params);
            return {
                projectingEnabled: true,
                mount: seed.mount,
                inactive: {
                    params: seed.panel as PanelParams,
                    svgSource: seed.svgSource ?? null,
                    imported: seed.svgSource
                        ? safeImport(seed.svgSource)
                        : null,
                },
                activeTab: 'main',
            };
        }),

    disableProjecting: () =>
        set((s) => {
            if (!s.projectingEnabled) return {};
            // If we're editing the blade, restore the main panel as live first.
            if (s.activeTab === 'projecting' && s.inactive) {
                return {
                    projectingEnabled: false,
                    activeTab: 'main',
                    params: s.inactive.params,
                    svgSource: s.inactive.svgSource,
                    imported: s.inactive.imported,
                    inactive: null,
                    mount: {},
                    dirty: true,
                    fixingMode: 'off',
                    cableMode: 'off',
                    editingGroupId: null,
                    pendingPaths: [],
                };
            }
            return {
                projectingEnabled: false,
                activeTab: 'main',
                inactive: null,
                mount: {},
                dirty: true,
            };
        }),

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
                artworkLayers: [],
            },
            editingGroupId: null,
            pendingPaths: [],
            selectedLayerId: null,
            dirty: true,
        })),

    loadDesign: (row, imported) =>
        set(() => {
            // Split the nested projecting sign (if any) out of params_json into
            // its own stashed slot, so the main panel becomes the live editor.
            const { projectingSign, ...mainCore } = row.params_json;
            const main = mainCore as PanelParams;
            const projecting = projectingSign
                ? {
                      params: projectingSign.panel as PanelParams,
                      svgSource: projectingSign.svgSource ?? null,
                      imported: projectingSign.svgSource
                          ? safeImport(projectingSign.svgSource)
                          : null,
                  }
                : null;
            return {
                params: main,
                svgSource: row.svg_source,
                imported,
                designId: row.id,
                quoteId: row.quote_id,
                quoteItemId: row.quote_item_id,
                activeTab: 'main',
                projectingEnabled: !!projecting,
                inactive: projecting,
                mount: projectingSign?.mount ?? {},
                editingGroupId: null,
                pendingPaths: [],
                selectedLayerId: null,
                dirty: false,
            };
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

    // Turning a fixing mode on cancels any cable-hole edit — the two
    // placement workflows are mutually exclusive so canvas clicks only
    // ever mean one thing. Turning it off leaves cable mode untouched.
    setFixingMode: (m) =>
        set((s) => ({
            fixingMode: m,
            cableMode: m === 'off' ? s.cableMode : 'off',
        })),

    /* ------------------------------------------------------------------ *
     * Artwork layers (multi-layer composition)
     * ------------------------------------------------------------------ */

    addArtworkLayer: (svgSource, label) =>
        set((s) => {
            // Native size from the import; default to a tidy fit (~45%
            // of the smaller panel dimension) centred on the face.
            let wMm = 100;
            let hMm = 100;
            try {
                const imp = importSvg(svgSource);
                wMm = Math.max(1, imp.bbox.w);
                hMm = Math.max(1, imp.bbox.h);
            } catch {
                /* keep defaults */
            }
            const panelW = s.params.panelWidthMm;
            const panelH = s.params.panelHeightMm;
            const targetMm = 0.45 * Math.min(panelW, panelH);
            const scale = Math.max(
                0.01,
                Math.min(20, targetMm / Math.max(wMm, hMm)),
            );
            const sw = wMm * scale;
            const sh = hMm * scale;
            const existing = s.params.artworkLayers ?? [];
            // Stagger new layers a touch so they don't stack exactly.
            const offset = existing.length * 0.04 * Math.min(panelW, panelH);
            const id = nextLayerId();
            const layer: ArtworkLayer = {
                id,
                label: label ?? `Layer ${existing.length + 1}`,
                svgSource,
                xMm: panelW / 2 - sw / 2 + offset,
                yMm: panelH / 2 - sh / 2 + offset,
                scale,
                wMm,
                hMm,
            };
            return {
                params: {
                    ...s.params,
                    artworkLayers: [...existing, layer],
                    // Composite mode supersedes the legacy single
                    // placement; make sure it's a clean identity.
                    aperturePlacement: DEFAULT_PLACEMENT,
                },
                selectedLayerId: id,
                dirty: true,
            };
        }),

    updateArtworkLayer: (id, patch) =>
        set((s) => ({
            params: {
                ...s.params,
                artworkLayers: (s.params.artworkLayers ?? []).map((l) =>
                    l.id === id ? { ...l, ...patch } : l,
                ),
            },
            dirty: true,
        })),

    removeArtworkLayer: (id) =>
        set((s) => {
            const next = (s.params.artworkLayers ?? []).filter(
                (l) => l.id !== id,
            );
            return {
                params: { ...s.params, artworkLayers: next },
                selectedLayerId:
                    s.selectedLayerId === id ? null : s.selectedLayerId,
                dirty: true,
            };
        }),

    reorderArtworkLayer: (id, dir) =>
        set((s) => {
            const list = [...(s.params.artworkLayers ?? [])];
            const i = list.findIndex((l) => l.id === id);
            if (i < 0) return {} as Partial<VisualiserState>;
            const j = dir === 'up' ? i - 1 : i + 1;
            if (j < 0 || j >= list.length)
                return {} as Partial<VisualiserState>;
            [list[i], list[j]] = [list[j], list[i]];
            return {
                params: { ...s.params, artworkLayers: list },
                dirty: true,
            };
        }),

    selectLayer: (id) => set({ selectedLayerId: id }),

    /* ------------------------------------------------------------------ *
     * Cable holes (manual positioner)
     * ------------------------------------------------------------------ */

    addCableHole: (p) =>
        set((s) => ({
            params: {
                ...s.params,
                cableHoles: [...(s.params.cableHoles ?? []), p],
            },
            dirty: true,
        })),

    removeCableHole: (index) =>
        set((s) => {
            const list = s.params.cableHoles ?? [];
            if (index < 0 || index >= list.length)
                return {} as Partial<VisualiserState>;
            const next = list.filter((_, i) => i !== index);
            const nextMode =
                s.cableMode === 'delete' && next.length === 0
                    ? ('off' as const)
                    : s.cableMode;
            return {
                params: { ...s.params, cableHoles: next },
                cableMode: nextMode,
                dirty: true,
            };
        }),

    clearCableHoles: () =>
        set((s) => ({
            params: { ...s.params, cableHoles: [] },
            cableMode:
                s.cableMode === 'delete' ? ('off' as const) : s.cableMode,
            dirty: true,
        })),

    // Symmetric to setFixingMode — turning cable mode on cancels any
    // fixing-edit and group-edit so the canvas only does one thing.
    setCableMode: (m) =>
        set((s) => ({
            cableMode: m,
            fixingMode: m === 'off' ? s.fixingMode : 'off',
            ...(m === 'off'
                ? {}
                : { editingGroupId: null, pendingPaths: [] }),
        })),

    /* ------------------------------------------------------------------ *
     * Material groups
     * ------------------------------------------------------------------ */

    startNewGroupEdit: () =>
        set({
            editingGroupId: 'new',
            pendingPaths: [],
            // Fixing + cable edits can't run at the same time as a
            // group edit — clear both.
            fixingMode: 'off',
            cableMode: 'off',
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
                cableMode: 'off',
            };
        }),

    startGroupEditFromPath: (pathIndex) =>
        set((s) => {
            const groups = s.params.materialGroups ?? [];
            const existing = groups.find((g) =>
                g.pathIndices.includes(pathIndex),
            );
            if (existing) {
                return {
                    editingGroupId: existing.id,
                    pendingPaths: [...existing.pathIndices],
                    fixingMode: 'off',
                };
            }
            return {
                editingGroupId: 'new',
                pendingPaths: [pathIndex],
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

    removePathFromGroups: (pathIndex) =>
        set((s) => {
            const list = s.params.materialGroups ?? [];
            const next = list
                .map((g) => ({
                    ...g,
                    pathIndices: g.pathIndices.filter((p) => p !== pathIndex),
                }))
                .filter((g) => g.pathIndices.length > 0);
            // If we just emptied the group currently being edited, close
            // the editor so it doesn't dangle on a group that no longer exists.
            const editedGone =
                s.editingGroupId !== null &&
                s.editingGroupId !== 'new' &&
                !next.some((g) => g.id === s.editingGroupId);
            return {
                params: { ...s.params, materialGroups: next },
                dirty: true,
                ...(editedGone
                    ? { editingGroupId: null, pendingPaths: [] }
                    : {}),
            };
        }),

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
            // Vinyl only. Printed full-colour is the default (undefined →
            // treated as true downstream); a group opts into flat solid by
            // explicitly setting false.
            const printFullColor =
                options?.printFullColor ?? existing?.printFullColor;
            const glowIntensity =
                options?.glowIntensity ??
                existing?.glowIntensity ??
                (material === 'backlight' ? 1 : undefined);
            // Extra face only applies to letters that sit on the panel
            // (push-through / backlit). An explicit value (object or null)
            // wins; null clears; otherwise keep the existing face.
            const extraFace =
                material === 'pushthrough' || material === 'backlight'
                    ? options?.extraFace !== undefined
                        ? options.extraFace ?? undefined
                        : existing?.extraFace
                    : undefined;

            const updated: MaterialGroup = {
                id: existing?.id ?? nextGroupId(),
                label: existing?.label,
                material,
                color,
                thicknessMm,
                standoffDistanceMm,
                keylineOffsetMm,
                protrusionMm,
                printFullColor,
                glowIntensity,
                extraFace,
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
                          printFullColor:
                              patch.printFullColor !== undefined
                                  ? patch.printFullColor
                                  : g.printFullColor,
                          glowIntensity:
                              patch.glowIntensity ?? g.glowIntensity,
                          label: patch.label ?? g.label,
                          extraFace:
                              patch.extraFace !== undefined
                                  ? patch.extraFace
                                  : g.extraFace,
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

    captureClean: false,
    setCaptureClean: (v) => set({ captureClean: v }),
}));
