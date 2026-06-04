'use client';

import { useRef, useState } from 'react';
import { useVisualiser } from './store';
import { importSvg } from '@/lib/visualiser/svg-import';
import { TraceImage } from './TraceImage';
import { Section } from './Section';
import { SwatchPicker, type SwatchItem } from './SwatchPicker';
import { ACRYLIC_COLOURS } from '@/lib/visualiser/acrylic';
import {
    GROUP_HIGHLIGHT_PALETTE,
    type AlignH,
    type AlignV,
    type PanelParams,
} from '@/lib/visualiser/types';

const ACRYLIC_ITEMS: SwatchItem[] = ACRYLIC_COLOURS.map((c) => ({
    hex: c.hex,
    label: c.name,
    sublabel: `${c.brand}${c.code ? ' ' + c.code : ''} · ${c.finish}`,
}));
import {
    AlertTriangle,
    Check,
    Crosshair,
    Eraser,
    ImageUp,
    Plus,
    Sparkles,
    Trash2,
    Upload,
    X,
} from 'lucide-react';

const ACCENT = '#4e7e8c';
const ACCENT_DARK = '#3a5f6a';
const ACCENT_TINT_BG = '#e8f0f3';
const ACCENT_TINT_BORDER = '#b8d0d8';

type MaterialGroup = NonNullable<PanelParams['materialGroups']>[number];
type GroupMaterial = MaterialGroup['material'];

/**
 * Material-group editor. Aperture mode lets the operator bundle SVG
 * paths into named groups that share a material (solid / vinyl /
 * acrylic) and its properties (colour, thickness). The flow:
 *
 *   1. Click "Edit cuts" — enters multi-select mode on the canvas.
 *   2. Click each SVG path that should belong to the group; selected
 *      paths flash orange.
 *   3. Pick Cut / Solid / Vinyl / Acrylic — the whole selection takes
 *      that material and the group is saved.
 *
 * Existing groups appear as cards underneath. Click a group's edit
 * pencil to re-enter selection on its members; tweak colour /
 * thickness inline.
 */
function defaultColorFor(
    material: GroupMaterial,
    panelColor: string,
): string {
    if (material === 'solid') return panelColor;
    if (material === 'vinyl') return '#ffffff';
    if (material === 'pushthrough') return '#f5f5f0';
    return '#1a1f23';
}

/**
 * The orange edit panel. Lives in its own component so React can fully
 * remount it (via a `key` from the editing target) when the operator
 * switches between groups — that's what re-seeds the local input state
 * cleanly without having to set state during render.
 */
function GroupEditControls({
    initialMaterial,
    initialColor,
    initialThickness,
    initialStandoff,
    initialKeylineOffset,
    initialProtrusion,
    initialPrintFullColor,
    pendingCount,
    isExistingGroup,
    panelColor,
    onApply,
    onCancel,
}: {
    initialMaterial: Exclude<GroupMaterial, 'cut'>;
    initialColor: string;
    initialThickness: number;
    initialStandoff: number;
    initialKeylineOffset: number;
    initialProtrusion: number;
    initialPrintFullColor: boolean;
    pendingCount: number;
    isExistingGroup: boolean;
    panelColor: string;
    onApply: (
        material: GroupMaterial,
        opts?: {
            color?: string;
            thicknessMm?: number;
            standoffDistanceMm?: number;
            keylineOffsetMm?: number;
            protrusionMm?: number;
            printFullColor?: boolean;
        },
    ) => void;
    onCancel: () => void;
}) {
    const [material, setMaterial] =
        useState<Exclude<GroupMaterial, 'cut'>>(initialMaterial);
    const [color, setColor] = useState<string>(initialColor);
    const [thickness, setThickness] = useState<number>(initialThickness);
    const [standoff, setStandoff] = useState<number>(initialStandoff);
    const [keylineOffset, setKeylineOffset] = useState<number>(
        initialKeylineOffset,
    );
    const [protrusion, setProtrusion] = useState<number>(initialProtrusion);
    const [printFullColor, setPrintFullColor] = useState<boolean>(
        initialPrintFullColor,
    );

    // Smart colour default when the operator switches material — only
    // snap if the colour is still the previous material's default; if
    // they've picked a custom colour keep it.
    const pickMaterial = (next: Exclude<GroupMaterial, 'cut'>) => {
        const previousDefault = defaultColorFor(material, panelColor);
        if (color.toLowerCase() === previousDefault.toLowerCase()) {
            setColor(defaultColorFor(next, panelColor));
        }
        setMaterial(next);
    };

    const hasVinyl = material === 'vinyl';
    // Printed full-colour vinyl takes its colour from the artwork itself, so
    // the spot-colour swatch only applies to solid (non-printed) vinyl.
    const hasColor = material !== 'solid' && !(hasVinyl && printFullColor);
    const hasThickness =
        material === 'acrylic' ||
        material === 'standoff' ||
        material === 'pushthrough';
    const hasStandoff = material === 'standoff';
    const hasPushThrough = material === 'pushthrough';

    const materialHelp: Record<Exclude<GroupMaterial, 'cut'>, string> = {
        solid: 'Kept as panel material — not cut. Use for inner counters of letters.',
        vinyl: 'Vinyl bonded to the panel face — printed full colour, or a solid cut colour.',
        acrylic: 'Acrylic sheet face-stuck to the panel.',
        standoff:
            'Extruded letter mounted with studs at a distance from the face.',
        pushthrough:
            'Acrylic letter pressed through the panel from behind. Outer letter + each counter are cut as separate pieces, mounted to a backing board, and pressed through a keyline hole in the panel face.',
    };
    return (
        <div
            className="rounded-md border p-2.5 space-y-2"
            style={{
                borderColor: ACCENT_TINT_BORDER,
                background: ACCENT_TINT_BG,
            }}
        >
            <p className="text-[11px] font-medium" style={{ color: ACCENT_DARK }}>
                {isExistingGroup
                    ? `Editing group · ${pendingCount} path${pendingCount === 1 ? '' : 's'} selected`
                    : `New material group · ${pendingCount} path${pendingCount === 1 ? '' : 's'} selected`}
            </p>
            <p className="text-[10px]" style={{ color: ACCENT_DARK }}>
                Click paths on the canvas to add or remove them, then pick the
                material below.
            </p>

            <div
                className="grid grid-cols-3 overflow-hidden rounded-md border text-[10px] font-medium"
                style={{ borderColor: ACCENT_TINT_BORDER }}
            >
                {(
                    [
                        ['cut', 'Cut'],
                        ['solid', 'Solid'],
                        ['vinyl', 'Vinyl'],
                        ['acrylic', 'Acrylic'],
                        ['standoff', 'Stood off'],
                        ['pushthrough', 'Push through'],
                    ] as const
                ).map(([v, label], k) => {
                    const inSecondRow = k >= 3;
                    const inFirstCol = k % 3 === 0;
                    return (
                        <button
                            key={v}
                            type="button"
                            onClick={() => {
                                if (v === 'cut') onApply('cut');
                                else pickMaterial(v);
                            }}
                            aria-pressed={v !== 'cut' && material === v}
                            className={`min-h-[32px] py-1.5 ${
                                !inFirstCol ? 'border-l' : ''
                            } ${inSecondRow ? 'border-t' : ''} ${
                                v === 'cut'
                                    ? 'bg-white text-red-600 hover:bg-red-50'
                                    : material === v
                                      ? 'text-white'
                                      : 'bg-white text-neutral-700 hover:bg-neutral-100'
                            }`}
                            style={{
                                borderColor:
                                    !inFirstCol || inSecondRow
                                        ? ACCENT_TINT_BORDER
                                        : undefined,
                                background:
                                    v !== 'cut' && material === v
                                        ? ACCENT
                                        : undefined,
                            }}
                        >
                            {label}
                        </button>
                    );
                })}
            </div>

            <p className="text-[10px] text-neutral-600">
                {materialHelp[material]}
            </p>

            {hasVinyl && (
                <div>
                    <span
                        className="text-[10px] font-medium"
                        style={{ color: ACCENT_DARK }}
                    >
                        Vinyl type
                    </span>
                    <div
                        className="mt-0.5 grid grid-cols-2 overflow-hidden rounded-md border text-[10px] font-medium"
                        style={{ borderColor: ACCENT_TINT_BORDER }}
                    >
                        {(
                            [
                                [true, 'Full colour'],
                                [false, 'Solid colour'],
                            ] as const
                        ).map(([v, label], k) => (
                            <button
                                key={label}
                                type="button"
                                onClick={() => setPrintFullColor(v)}
                                aria-pressed={printFullColor === v}
                                className={`min-h-[32px] py-1.5 ${
                                    k > 0 ? 'border-l' : ''
                                } ${
                                    printFullColor === v
                                        ? 'text-white'
                                        : 'bg-white text-neutral-700 hover:bg-neutral-100'
                                }`}
                                style={{
                                    borderColor:
                                        k > 0 ? ACCENT_TINT_BORDER : undefined,
                                    background:
                                        printFullColor === v
                                            ? ACCENT
                                            : undefined,
                                }}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <span className="mt-0.5 block text-[10px] text-neutral-500">
                        {printFullColor
                            ? 'Prints the artwork in full colour (gradients kept), then contour-cuts around it.'
                            : 'A single spot colour, plotter-cut — pick the colour below.'}
                    </span>
                </div>
            )}

            {hasColor && (
                <label className="block">
                    <span
                        className="text-[10px] font-medium"
                        style={{ color: ACCENT_DARK }}
                    >
                        Colour
                    </span>
                    {(material === 'acrylic' ||
                        material === 'pushthrough' ||
                        material === 'standoff') && (
                        <div className="mt-0.5">
                            <SwatchPicker
                                items={ACRYLIC_ITEMS}
                                value={color}
                                placeholder="Pick from acrylic stock…"
                                onPick={(i) => setColor(i.hex)}
                            />
                            <span
                                className="mt-0.5 block text-[10px]"
                                style={{ color: ACCENT_DARK }}
                            >
                                From our acrylic library — or fine-tune below.
                            </span>
                        </div>
                    )}
                    <div className="mt-0.5 flex items-center gap-1.5">
                        <input
                            type="color"
                            value={color}
                            onChange={(e) => setColor(e.target.value)}
                            className="h-11 w-14 cursor-pointer rounded border bg-white p-0.5"
                            style={{ borderColor: ACCENT_TINT_BORDER }}
                            aria-label="Group colour"
                        />
                        <input
                            type="text"
                            value={color}
                            onChange={(e) => {
                                const v = e.target.value.trim();
                                if (/^#[0-9a-fA-F]{6}$/.test(v)) setColor(v);
                            }}
                            className="flex-1 rounded border px-2 py-2 font-mono text-[11px] uppercase focus:border-black focus:outline-none"
                            style={{ borderColor: ACCENT_TINT_BORDER }}
                        />
                    </div>
                </label>
            )}

            {hasThickness && (
                <NumField
                    label="Thickness (mm)"
                    step={0.5}
                    value={thickness}
                    onChange={(n) => setThickness(n > 0 ? n : 0.5)}
                />
            )}

            {hasStandoff && (
                <NumField
                    label="Standoff distance (mm)"
                    step={1}
                    value={standoff}
                    onChange={(n) => setStandoff(n >= 0 ? n : 0)}
                />
            )}

            {hasPushThrough && (
                <>
                    <NumField
                        label="Keyline offset (mm)"
                        step={0.5}
                        value={keylineOffset}
                        onChange={(n) =>
                            setKeylineOffset(n >= 0 ? n : 0)
                        }
                    />
                    <NumField
                        label="Protrusion (mm)"
                        step={1}
                        value={protrusion}
                        onChange={(n) => setProtrusion(n >= 0 ? n : 0)}
                    />
                    <p className="text-[10px] text-neutral-500">
                        Outer letter + each counter are cut as separate
                        pieces. Mount both on a backing board behind the
                        panel.
                    </p>
                </>
            )}

            <div className="flex items-center gap-2 pt-1">
                <button
                    type="button"
                    onClick={() =>
                        onApply(material, {
                            color,
                            thicknessMm: hasThickness ? thickness : undefined,
                            standoffDistanceMm: hasStandoff
                                ? standoff
                                : undefined,
                            keylineOffsetMm: hasPushThrough
                                ? keylineOffset
                                : undefined,
                            protrusionMm: hasPushThrough
                                ? protrusion
                                : undefined,
                            printFullColor: hasVinyl
                                ? printFullColor
                                : undefined,
                        })
                    }
                    disabled={pendingCount === 0}
                    className="flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ background: ACCENT }}
                    onMouseEnter={(e) => {
                        if (!e.currentTarget.disabled)
                            e.currentTarget.style.background = ACCENT_DARK;
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = ACCENT;
                    }}
                >
                    <Check size={14} aria-hidden /> Apply{' '}
                    {material === 'standoff'
                        ? 'Stood off'
                        : material === 'pushthrough'
                          ? 'Push through'
                          : material.charAt(0).toUpperCase() +
                            material.slice(1)}
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    className="min-h-[36px] rounded-md border px-3 py-2 text-xs font-medium hover:bg-white"
                    style={{
                        borderColor: ACCENT_TINT_BORDER,
                        color: ACCENT_DARK,
                    }}
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}

function MaterialGroupsPanel({
    groups,
    editingGroupId,
    pendingPaths,
    panelColor,
    startNewGroupEdit,
    startEditingGroup,
    cancelGroupEdit,
    applyEditMaterial,
    updateGroupProps,
    deleteGroup,
}: {
    groups: MaterialGroup[];
    editingGroupId: string | null;
    pendingPaths: number[];
    panelColor: string;
    startNewGroupEdit: () => void;
    startEditingGroup: (id: string) => void;
    cancelGroupEdit: () => void;
    applyEditMaterial: (
        material: GroupMaterial,
        options?: {
            color?: string;
            thicknessMm?: number;
            standoffDistanceMm?: number;
            keylineOffsetMm?: number;
            protrusionMm?: number;
            printFullColor?: boolean;
        },
    ) => void;
    updateGroupProps: (
        id: string,
        patch: {
            color?: string;
            thicknessMm?: number;
            standoffDistanceMm?: number;
            keylineOffsetMm?: number;
            protrusionMm?: number;
            printFullColor?: boolean;
            label?: string;
        },
    ) => void;
    deleteGroup: (id: string) => void;
}) {
    const isEditing = editingGroupId !== null;
    const editingExisting =
        editingGroupId && editingGroupId !== 'new'
            ? groups.find((g) => g.id === editingGroupId)
            : null;

    return (
        <div className="space-y-2 pt-2 border-t border-neutral-100">
            <div className="flex items-center justify-between gap-2">
                <h4 className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                    Material groups
                </h4>
                {!isEditing && (
                    <button
                        type="button"
                        onClick={startNewGroupEdit}
                        className="flex min-h-[32px] items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm transition-colors"
                        style={{ background: ACCENT }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = ACCENT_DARK;
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = ACCENT;
                        }}
                    >
                        <Plus size={12} aria-hidden /> New material group
                    </button>
                )}
            </div>
            <p className="text-[10px] text-neutral-500">
                Pull SVG paths out of the default cut and reassign them as
                solid panel material, vinyl appliqué, face-stuck acrylic, or
                stood-off lettering.
            </p>

            {isEditing && (
                <GroupEditControls
                    // Key on the editing target so seeding happens via
                    // mount, not via setState-during-render.
                    key={editingGroupId}
                    initialMaterial={
                        // 'cut' isn't a real picker option — fall back to
                        // 'solid' so the apply form has a valid starting
                        // material to render its fields against.
                        (editingExisting?.material === 'cut'
                            ? 'solid'
                            : editingExisting?.material) ?? 'solid'
                    }
                    initialColor={
                        editingExisting?.color ??
                        defaultColorFor('solid', panelColor)
                    }
                    initialThickness={editingExisting?.thicknessMm ?? 5}
                    initialStandoff={editingExisting?.standoffDistanceMm ?? 25}
                    initialKeylineOffset={
                        editingExisting?.keylineOffsetMm ?? 1.5
                    }
                    initialProtrusion={editingExisting?.protrusionMm ?? 5}
                    // Default printed full-colour (undefined → true); only an
                    // explicit false makes it a solid cut vinyl.
                    initialPrintFullColor={
                        editingExisting?.printFullColor !== false
                    }
                    pendingCount={pendingPaths.length}
                    isExistingGroup={!!editingExisting}
                    panelColor={panelColor}
                    onApply={applyEditMaterial}
                    onCancel={cancelGroupEdit}
                />
            )}

            {/* Existing groups. Each row shows a palette swatch (the
                group's identity colour on the canvas), the material chip
                and member count, with pencil + trash actions. */}
            {groups.length === 0 && !isEditing && (
                <p className="text-[10px] text-neutral-400">
                    No groups yet — every path will be cut from the panel
                    by default.
                </p>
            )}
            <ul className="space-y-1.5">
                {groups.map((g, i) => {
                    const palette =
                        GROUP_HIGHLIGHT_PALETTE[
                            i % GROUP_HIGHLIGHT_PALETTE.length
                        ];
                    const isThisOne = editingGroupId === g.id;
                    const isAuto = g.label === 'Counters (auto)';
                    return (
                        <li
                            key={g.id}
                            className={`rounded-md border bg-white p-2 ${
                                isThisOne
                                    ? 'ring-1'
                                    : 'border-neutral-200 hover:border-neutral-300'
                            }`}
                            style={
                                isThisOne
                                    ? {
                                          borderColor: ACCENT,
                                          // @ts-expect-error CSS custom prop for ring
                                          '--tw-ring-color': ACCENT_TINT_BORDER,
                                      }
                                    : undefined
                            }
                        >
                            <div className="flex items-center justify-between gap-2">
                                <button
                                    type="button"
                                    onClick={() => startEditingGroup(g.id)}
                                    disabled={isEditing && !isThisOne}
                                    className="flex min-h-[36px] min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50"
                                    aria-label={`Edit group ${g.label ?? g.material}`}
                                >
                                    <span
                                        className="h-3.5 w-3.5 shrink-0 rounded-sm border border-neutral-300"
                                        style={{ background: palette }}
                                        aria-hidden
                                    />
                                    <span className="text-[11px] font-medium text-neutral-700 truncate">
                                        {g.label ??
                                            `${g.material[0].toUpperCase()}${g.material.slice(1)} group`}
                                    </span>
                                    <span className="rounded-full bg-neutral-100 px-1.5 py-px text-[9px] uppercase tracking-wide text-neutral-500">
                                        {g.material}
                                    </span>
                                    <span className="text-[10px] text-neutral-400">
                                        {g.pathIndices.length} path
                                        {g.pathIndices.length === 1 ? '' : 's'}
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => deleteGroup(g.id)}
                                    aria-label="Delete group (paths revert to cut)"
                                    className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded text-neutral-500 hover:bg-red-50 hover:text-red-600"
                                >
                                    <Trash2 size={14} aria-hidden />
                                </button>
                            </div>
                            {isAuto && (
                                <p className="mt-1 flex items-center gap-1 text-[10px] text-neutral-500">
                                    <Sparkles
                                        size={10}
                                        aria-hidden
                                        style={{ color: ACCENT }}
                                    />
                                    Auto-detected from nested paths — edit or
                                    delete freely.
                                </p>
                            )}

                            {/* Inline colour / thickness — live edits while
                                not in selection edit, no Apply needed.
                                Stacked vertically so the hex code has
                                room to breathe and the thickness field
                                doesn't get squeezed. */}
                            {!isEditing && g.material !== 'solid' && (
                                <div className="mt-2 space-y-2">
                                    {g.material === 'vinyl' && (
                                        <div>
                                            <span className="text-[10px] text-neutral-500">
                                                Vinyl type
                                            </span>
                                            <div className="mt-0.5 grid grid-cols-2 overflow-hidden rounded-md border border-neutral-300 text-[10px] font-medium">
                                                {(
                                                    [
                                                        [true, 'Full colour'],
                                                        [false, 'Solid'],
                                                    ] as const
                                                ).map(([v, label], k) => {
                                                    const active =
                                                        (g.printFullColor !==
                                                            false) === v;
                                                    return (
                                                        <button
                                                            key={label}
                                                            type="button"
                                                            onClick={() =>
                                                                updateGroupProps(
                                                                    g.id,
                                                                    {
                                                                        printFullColor:
                                                                            v,
                                                                    },
                                                                )
                                                            }
                                                            aria-pressed={active}
                                                            className={`min-h-[28px] py-1 ${
                                                                k > 0
                                                                    ? 'border-l border-neutral-300'
                                                                    : ''
                                                            } ${
                                                                active
                                                                    ? 'text-white'
                                                                    : 'bg-white text-neutral-600 hover:bg-neutral-100'
                                                            }`}
                                                            style={
                                                                active
                                                                    ? {
                                                                          background:
                                                                              ACCENT,
                                                                      }
                                                                    : undefined
                                                            }
                                                        >
                                                            {label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                    {/* Colour swatch — hidden for printed vinyl
                                        (its colour comes from the artwork). */}
                                    {!(
                                        g.material === 'vinyl' &&
                                        g.printFullColor !== false
                                    ) && (
                                        <label className="block">
                                            <span className="text-[10px] text-neutral-500">
                                                Colour
                                            </span>
                                            <div className="mt-0.5 flex items-center gap-1.5">
                                                <input
                                                    type="color"
                                                    value={g.color}
                                                    onChange={(e) =>
                                                        updateGroupProps(g.id, {
                                                            color: e.target
                                                                .value,
                                                        })
                                                    }
                                                    className="h-7 w-9 shrink-0 cursor-pointer rounded border border-neutral-300 bg-white p-0.5"
                                                />
                                                <input
                                                    type="text"
                                                    value={g.color}
                                                    onChange={(e) => {
                                                        const v =
                                                            e.target.value.trim();
                                                        if (
                                                            /^#[0-9a-fA-F]{6}$/.test(
                                                                v,
                                                            )
                                                        )
                                                            updateGroupProps(
                                                                g.id,
                                                                { color: v },
                                                            );
                                                    }}
                                                    className="flex-1 rounded border border-neutral-300 px-2 py-1 font-mono text-[11px] uppercase focus:border-black focus:outline-none"
                                                />
                                            </div>
                                        </label>
                                    )}
                                    {(g.material === 'acrylic' ||
                                        g.material === 'standoff' ||
                                        g.material === 'pushthrough') && (
                                        <NumField
                                            label="Thickness (mm)"
                                            step={0.5}
                                            value={g.thicknessMm ?? 5}
                                            onChange={(n) =>
                                                updateGroupProps(g.id, {
                                                    thicknessMm:
                                                        n > 0 ? n : 0.5,
                                                })
                                            }
                                        />
                                    )}
                                    {g.material === 'standoff' && (
                                        <NumField
                                            label="Standoff (mm)"
                                            step={1}
                                            value={
                                                g.standoffDistanceMm ?? 25
                                            }
                                            onChange={(n) =>
                                                updateGroupProps(g.id, {
                                                    standoffDistanceMm:
                                                        n >= 0 ? n : 0,
                                                })
                                            }
                                        />
                                    )}
                                    {g.material === 'pushthrough' && (
                                        <>
                                            <NumField
                                                label="Keyline offset (mm)"
                                                step={0.5}
                                                value={
                                                    g.keylineOffsetMm ?? 1.5
                                                }
                                                onChange={(n) =>
                                                    updateGroupProps(g.id, {
                                                        keylineOffsetMm:
                                                            n >= 0 ? n : 0,
                                                    })
                                                }
                                            />
                                            <NumField
                                                label="Protrusion (mm)"
                                                step={1}
                                                value={g.protrusionMm ?? 5}
                                                onChange={(n) =>
                                                    updateGroupProps(g.id, {
                                                        protrusionMm:
                                                            n >= 0 ? n : 0,
                                                    })
                                                }
                                            />
                                        </>
                                    )}
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

function Segmented<T extends string>({
    options,
    value,
    onChange,
}: {
    options: Array<[T, string]>;
    value: T;
    onChange: (v: T) => void;
}) {
    return (
        <div className="flex overflow-hidden rounded-md border border-neutral-300">
            {options.map(([val, label], i) => (
                <button
                    key={val}
                    type="button"
                    onClick={() => onChange(val)}
                    className={`flex-1 py-1 text-xs font-medium transition-colors ${
                        i > 0 ? 'border-l border-neutral-300' : ''
                    } ${
                        value === val
                            ? 'bg-black text-white'
                            : 'bg-white text-neutral-500 hover:bg-neutral-100'
                    }`}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}

function NumField({
    label,
    value,
    onChange,
    step,
}: {
    label: string;
    value: number;
    onChange: (n: number) => void;
    step: number;
}) {
    return (
        <label className="block">
            <span className="text-[10px] text-neutral-500">{label}</span>
            <input
                type="number"
                inputMode="decimal"
                step={step}
                value={value}
                onChange={(e) => {
                    const n = parseFloat(e.target.value);
                    onChange(Number.isNaN(n) ? 0 : n);
                }}
                className="mt-0.5 w-full rounded border border-neutral-300 px-1.5 py-1 text-xs focus:border-black focus:outline-none"
            />
        </label>
    );
}

export function SvgDropzone() {
    const {
        svgSource,
        imported,
        params,
        clearSvg,
        setPlacement,
        setParam,
        fixingMode,
        setFixingMode,
        clearManualFixings,
        cableMode,
        setCableMode,
        clearCableHoles,
        editingGroupId,
        pendingPaths,
        startNewGroupEdit,
        startEditingGroup,
        cancelGroupEdit,
        applyEditMaterial,
        updateGroupProps,
        deleteGroup,
        addArtworkLayer,
        updateArtworkLayer,
        removeArtworkLayer,
        reorderArtworkLayer,
        selectLayer,
        selectedLayerId,
    } = useVisualiser();
    const inputRef = useRef<HTMLInputElement>(null);
    const [error, setError] = useState<string | null>(null);
    const [traceMode, setTraceMode] = useState(false);

    const layers = params.artworkLayers ?? [];
    const composite = layers.length > 0;
    const hasArtwork = !!svgSource || composite;

    // Any path rendered as stood off — either the quick default is set
    // to standoff (so ungrouped paths land there) or at least one
    // explicit group's material is standoff. Drives whether the
    // shared lettering defaults + fixings panel is visible.
    const anyStandoffPath =
        (params.apertureMode ?? 'aperture') === 'standoff' ||
        (params.materialGroups ?? []).some(
            (g) => g.material === 'standoff',
        );

    const handleFile = async (file: File) => {
        setError(null);
        try {
            const text = await file.text();
            const result = importSvg(text);
            if (result.paths.length === 0) {
                setError('No usable vector shapes found in that SVG.');
                return;
            }
            // Each upload is an artwork layer — add it to the
            // composition so several pieces (icon + wordmark, …) can sit
            // on the sign and move independently.
            const cleanName = file.name.replace(/\.svg$/i, '');
            addArtworkLayer(text, cleanName || undefined);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not read SVG');
        }
    };

    const placement = params.aperturePlacement;

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                    <span
                        className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white"
                        style={{ background: hasArtwork ? '#4e7e8c' : '#9ca3af' }}
                        aria-hidden
                    >
                        3
                    </span>
                    Artwork
                </h3>
                {hasArtwork && (
                    <button
                        type="button"
                        onClick={clearSvg}
                        className="flex min-h-[28px] items-center gap-1 text-xs text-neutral-500 hover:text-red-600"
                    >
                        <X size={12} aria-hidden /> Clear all
                    </button>
                )}
            </div>

            {traceMode ? (
                <TraceImage onClose={() => setTraceMode(false)} />
            ) : !hasArtwork ? (
                <div className="space-y-2">
                    <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        className="flex w-full flex-col items-center gap-1 rounded-lg border-2 border-dashed border-neutral-300 px-4 py-6 text-neutral-400 hover:border-neutral-400 hover:text-neutral-600"
                    >
                        <Upload size={20} />
                        <span className="text-xs">
                            Upload an SVG (icon, wordmark…)
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setTraceMode(true)}
                        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-neutral-200 px-3 py-2 text-[11px] font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
                    >
                        <ImageUp size={13} aria-hidden />
                        or trace a PNG / JPG
                        <span className="rounded bg-neutral-100 px-1 text-[9px] uppercase tracking-wide text-neutral-400">
                            beta
                        </span>
                    </button>
                </div>
            ) : composite ? (
                <div className="space-y-2">
                    {/* Layer list — select to edit, drag the handle on the
                        Flat development to move, or nudge with the fields. */}
                    <ul className="space-y-1.5">
                        {layers.map((l, i) => {
                            const sel = l.id === selectedLayerId;
                            return (
                                <li
                                    key={l.id}
                                    className={`rounded-md border bg-white p-2 ${
                                        sel
                                            ? 'border-[#4e7e8c] ring-1 ring-[#b8d0d8]'
                                            : 'border-neutral-200'
                                    }`}
                                >
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                selectLayer(sel ? null : l.id)
                                            }
                                            className="min-w-0 flex-1 truncate text-left text-[11px] font-medium text-neutral-700"
                                        >
                                            {l.label ?? `Layer ${i + 1}`}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                reorderArtworkLayer(l.id, 'up')
                                            }
                                            disabled={i === 0}
                                            aria-label="Bring forward"
                                            className="flex min-h-[24px] min-w-[20px] items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 disabled:opacity-30"
                                        >
                                            ↑
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                reorderArtworkLayer(
                                                    l.id,
                                                    'down',
                                                )
                                            }
                                            disabled={i === layers.length - 1}
                                            aria-label="Send back"
                                            className="flex min-h-[24px] min-w-[20px] items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 disabled:opacity-30"
                                        >
                                            ↓
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                removeArtworkLayer(l.id)
                                            }
                                            aria-label="Remove layer"
                                            className="flex min-h-[24px] min-w-[24px] items-center justify-center rounded text-neutral-500 hover:bg-red-50 hover:text-red-600"
                                        >
                                            <Trash2 size={13} aria-hidden />
                                        </button>
                                    </div>
                                    {sel && (
                                        <div className="mt-2 grid grid-cols-3 gap-1.5">
                                            <NumField
                                                label="X (mm)"
                                                step={5}
                                                value={Math.round(l.xMm)}
                                                onChange={(n) =>
                                                    updateArtworkLayer(l.id, {
                                                        xMm: n,
                                                    })
                                                }
                                            />
                                            <NumField
                                                label="Y (mm)"
                                                step={5}
                                                value={Math.round(l.yMm)}
                                                onChange={(n) =>
                                                    updateArtworkLayer(l.id, {
                                                        yMm: n,
                                                    })
                                                }
                                            />
                                            <NumField
                                                label="Scale %"
                                                step={5}
                                                value={Math.round(
                                                    l.scale * 100,
                                                )}
                                                onChange={(n) =>
                                                    updateArtworkLayer(l.id, {
                                                        scale:
                                                            n > 0
                                                                ? n / 100
                                                                : 0.01,
                                                    })
                                                }
                                            />
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => inputRef.current?.click()}
                            className="flex min-h-[32px] flex-1 items-center justify-center gap-1 rounded-md border border-neutral-300 px-2 py-1.5 text-[11px] font-medium text-neutral-600 hover:bg-neutral-100"
                        >
                            <Upload size={12} aria-hidden /> Add SVG
                        </button>
                        <button
                            type="button"
                            onClick={() => setTraceMode(true)}
                            className="flex min-h-[32px] flex-1 items-center justify-center gap-1 rounded-md border border-neutral-300 px-2 py-1.5 text-[11px] font-medium text-neutral-600 hover:bg-neutral-100"
                        >
                            <ImageUp size={12} aria-hidden /> Trace
                        </button>
                    </div>
                    <p className="text-[10px] text-neutral-400">
                        Select a layer, then drag its handle on the Flat
                        development tab to move it.
                    </p>
                </div>
            ) : (
                <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600">
                    {imported && (
                        <p>
                            {imported.paths.length} path
                            {imported.paths.length === 1 ? '' : 's'} ·{' '}
                            {imported.bbox.w.toFixed(0)}×{imported.bbox.h.toFixed(0)}mm
                            native
                        </p>
                    )}
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

            {error && <p className="text-xs text-red-600">{error}</p>}

            {imported && imported.warnings.length > 0 && (
                <div className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                        <AlertTriangle size={13} />
                        Laser warnings (advisory — export still works)
                    </div>
                    <ul className="list-disc pl-4 text-[11px] text-amber-700">
                        {imported.warnings.map((w, i) => (
                            <li key={i}>{w}</li>
                        ))}
                    </ul>
                </div>
            )}

            {placement && (
                <div className="space-y-2.5">
                    {/* Artwork use — the upload-time "what is this?" choice.
                        Cut = apertures (default); Printed vinyl = the whole
                        artwork is a full-colour printed decal on the face
                        (nothing cut, gradients kept); Stand-off = extruded
                        lettering on studs. Individual paths can still be
                        re-assigned under Path materials below. */}
                    <div
                        className="rounded-md border p-2.5"
                        style={{
                            borderColor: ACCENT_TINT_BORDER,
                            background: ACCENT_TINT_BG,
                        }}
                    >
                        <span
                            className="text-[10px] font-semibold uppercase tracking-wide"
                            style={{ color: ACCENT_DARK }}
                        >
                            Artwork use
                        </span>
                        <div className="mt-1">
                            <Segmented<'aperture' | 'vinyl' | 'standoff'>
                                options={[
                                    ['aperture', 'Cut'],
                                    ['vinyl', 'Printed vinyl'],
                                    ['standoff', 'Stand-off'],
                                ]}
                                value={
                                    (params.apertureMode ?? 'aperture') as
                                        | 'aperture'
                                        | 'vinyl'
                                        | 'standoff'
                                }
                                onChange={(v) => setParam('apertureMode', v)}
                            />
                        </div>
                        <p className="mt-1 text-[10px]" style={{ color: ACCENT_DARK }}>
                            {(params.apertureMode ?? 'aperture') === 'vinyl'
                                ? 'Printed full-colour vinyl on the panel face — gradients kept, nothing is cut.'
                                : (params.apertureMode ?? 'aperture') ===
                                    'standoff'
                                  ? 'Lettering stood off the face on studs.'
                                  : 'Cut out of the panel as apertures (holes).'}
                        </p>
                    </div>

                    {/* Global placement (align / size / nudge) — for the
                        legacy single artwork. In composite mode each
                        layer is positioned individually, so these are
                        hidden and the whole composite maps 1:1 to the
                        face. */}
                    {!composite && (
                      <>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <span className="text-[10px] text-neutral-500">
                                Horizontal
                            </span>
                            <div className="mt-0.5">
                                <Segmented<AlignH>
                                    options={[
                                        ['left', 'Left'],
                                        ['center', 'Centre'],
                                        ['right', 'Right'],
                                    ]}
                                    value={placement.alignH}
                                    onChange={(v) =>
                                        setPlacement({ alignH: v })
                                    }
                                />
                            </div>
                        </div>
                        <div>
                            <span className="text-[10px] text-neutral-500">
                                Vertical
                            </span>
                            <div className="mt-0.5">
                                <Segmented<AlignV>
                                    options={[
                                        ['top', 'Top'],
                                        ['middle', 'Middle'],
                                        ['bottom', 'Bottom'],
                                    ]}
                                    value={placement.alignV}
                                    onChange={(v) =>
                                        setPlacement({ alignV: v })
                                    }
                                />
                            </div>
                        </div>
                    </div>
                    {imported && imported.bbox.w > 0 && imported.bbox.h > 0 && (
                        <div className="grid grid-cols-2 gap-2">
                            <NumField
                                label="Width (mm)"
                                step={1}
                                value={
                                    Math.round(
                                        imported.bbox.w * placement.scale * 10,
                                    ) / 10
                                }
                                onChange={(n) =>
                                    setPlacement({
                                        scale:
                                            n > 0 ? n / imported.bbox.w : 0.01,
                                    })
                                }
                            />
                            <NumField
                                label="Height (mm)"
                                step={1}
                                value={
                                    Math.round(
                                        imported.bbox.h * placement.scale * 10,
                                    ) / 10
                                }
                                onChange={(n) =>
                                    setPlacement({
                                        scale:
                                            n > 0 ? n / imported.bbox.h : 0.01,
                                    })
                                }
                            />
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                        <NumField
                            label="Nudge X (mm)"
                            step={1}
                            value={placement.nudgeXMm}
                            onChange={(n) => setPlacement({ nudgeXMm: n })}
                        />
                        <NumField
                            label="Nudge Y (mm)"
                            step={1}
                            value={placement.nudgeYMm}
                            onChange={(n) => setPlacement({ nudgeYMm: n })}
                        />
                    </div>
                    <p className="text-[10px] text-neutral-400">
                        Size in mm — aspect locked, edit width or height.
                        Anchored to the artwork centre; default is dead centre.
                    </p>
                      </>
                    )}

                    {/* Path materials & fixings — each a collapsible
                        section so the rail isn't a wall of always-open
                        panels. Every ungrouped path is cut from the
                        panel by default; the operator opts paths out
                        into explicit material groups. */}
                    <div className="space-y-2">
                        {hasArtwork && (
                            <Section title="Path materials" step={4}>
                                <p className="text-[10px] text-neutral-500">
                                    Every artwork path is cut from the panel
                                    by default. Group paths below to reassign
                                    them.
                                </p>
                                <MaterialGroupsPanel
                                    groups={params.materialGroups ?? []}
                                    editingGroupId={editingGroupId}
                                    pendingPaths={pendingPaths}
                                    panelColor={
                                        params.panelColor ?? '#d6d6d6'
                                    }
                                    startNewGroupEdit={startNewGroupEdit}
                                    startEditingGroup={startEditingGroup}
                                    cancelGroupEdit={cancelGroupEdit}
                                    applyEditMaterial={applyEditMaterial}
                                    updateGroupProps={updateGroupProps}
                                    deleteGroup={deleteGroup}
                                />
                            </Section>
                        )}
                        {/* Standoff defaults + fixings — shown whenever any
                            path is rendered as stood off, regardless of
                            whether that's via the quick default or via an
                            explicit group. Fixings are a single global
                            set applied across every standoff path so the
                            shop only configures the diameter / density
                            once per sign. */}
                        {anyStandoffPath && (
                            <Section
                                title="Stand-off & fixings"
                                defaultOpen={false}
                            >
                                {/* Lettering defaults — applied to standoff
                                    paths that are NOT in an explicit group
                                    (i.e. the quick default = Stood off
                                    case). Explicit standoff groups carry
                                    their own thickness / distance / colour
                                    and ignore these. */}
                                <div className="space-y-2 pt-1">
                                    <h4 className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                                        Standoff defaults
                                    </h4>
                                    <p className="text-[10px] text-neutral-400">
                                        Used for paths set to stood-off via
                                        the quick default. Group-specific
                                        standoff has its own thickness +
                                        distance.
                                    </p>
                                    <div className="grid grid-cols-2 gap-2">
                                        <NumField
                                            label="Thickness (mm)"
                                            step={0.5}
                                            value={
                                                params.letterThicknessMm ?? 5
                                            }
                                            onChange={(n) =>
                                                setParam(
                                                    'letterThicknessMm',
                                                    n > 0 ? n : 0.5,
                                                )
                                            }
                                        />
                                        <NumField
                                            label="Stand-off (mm)"
                                            step={1}
                                            value={
                                                params.standoffDistanceMm ??
                                                25
                                            }
                                            onChange={(n) =>
                                                setParam(
                                                    'standoffDistanceMm',
                                                    n >= 0 ? n : 0,
                                                )
                                            }
                                        />
                                    </div>
                                    <label className="block">
                                        <span className="text-[10px] text-neutral-500">
                                            Default letter colour
                                        </span>
                                        <div className="mt-0.5 flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={
                                                    params.letterColor ??
                                                    '#1a1f23'
                                                }
                                                onChange={(e) =>
                                                    setParam(
                                                        'letterColor',
                                                        e.target.value,
                                                    )
                                                }
                                                className="h-7 w-10 cursor-pointer rounded border border-neutral-300 bg-white p-0.5"
                                                aria-label="Default letter colour"
                                            />
                                            <input
                                                type="text"
                                                value={
                                                    params.letterColor ??
                                                    '#1a1f23'
                                                }
                                                onChange={(e) => {
                                                    const v =
                                                        e.target.value.trim();
                                                    if (
                                                        /^#[0-9a-fA-F]{6}$/.test(
                                                            v,
                                                        )
                                                    )
                                                        setParam(
                                                            'letterColor',
                                                            v,
                                                        );
                                                }}
                                                className="flex-1 rounded border border-neutral-300 px-1.5 py-1 font-mono text-[10px] uppercase tracking-wide focus:border-black focus:outline-none"
                                                placeholder="#1a1f23"
                                            />
                                        </div>
                                    </label>
                                </div>

                                {/* Stud hardware — thread / length / finish.
                                    Surfaced on the standoff material page of
                                    the reference PDF so the back-shop has
                                    the procurement spec without phoning. */}
                                <div className="space-y-2 pt-1">
                                    <h4 className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                                        Stud hardware
                                    </h4>
                                    <p className="text-[10px] text-neutral-400">
                                        Printed on the reference PDF for the
                                        fabricator. Defaults: M8 stainless,
                                        length sized to standoff distance.
                                    </p>
                                    <div className="grid grid-cols-2 gap-2">
                                        <label className="block">
                                            <span className="text-[10px] text-neutral-500">
                                                Thread
                                            </span>
                                            <select
                                                value={
                                                    params.standoffStudSpec
                                                        ?.thread ?? 'M8'
                                                }
                                                onChange={(e) =>
                                                    setParam(
                                                        'standoffStudSpec',
                                                        {
                                                            ...(params.standoffStudSpec ??
                                                                {}),
                                                            thread: e.target
                                                                .value as
                                                                | 'M5'
                                                                | 'M6'
                                                                | 'M8'
                                                                | 'M10',
                                                        },
                                                    )
                                                }
                                                className="mt-0.5 w-full rounded border border-neutral-300 px-1.5 py-1 text-xs focus:border-black focus:outline-none"
                                            >
                                                <option value="M5">M5</option>
                                                <option value="M6">M6</option>
                                                <option value="M8">M8</option>
                                                <option value="M10">M10</option>
                                            </select>
                                        </label>
                                        <NumField
                                            label="Length (mm)"
                                            step={5}
                                            value={
                                                params.standoffStudSpec
                                                    ?.lengthMm ??
                                                Math.max(
                                                    20,
                                                    Math.round(
                                                        (params.standoffDistanceMm ??
                                                            25) + 15,
                                                    ),
                                                )
                                            }
                                            onChange={(n) =>
                                                setParam(
                                                    'standoffStudSpec',
                                                    {
                                                        ...(params.standoffStudSpec ??
                                                            {}),
                                                        lengthMm:
                                                            n > 0 ? n : 20,
                                                    },
                                                )
                                            }
                                        />
                                    </div>
                                    <label className="block">
                                        <span className="text-[10px] text-neutral-500">
                                            Finish
                                        </span>
                                        <input
                                            type="text"
                                            value={
                                                params.standoffStudSpec
                                                    ?.finish ?? 'Stainless A2'
                                            }
                                            onChange={(e) =>
                                                setParam(
                                                    'standoffStudSpec',
                                                    {
                                                        ...(params.standoffStudSpec ??
                                                            {}),
                                                        finish: e.target.value,
                                                    },
                                                )
                                            }
                                            placeholder="Stainless A2"
                                            className="mt-0.5 w-full rounded border border-neutral-300 px-1.5 py-1 text-xs focus:border-black focus:outline-none"
                                        />
                                    </label>
                                    <label className="block">
                                        <span className="text-[10px] text-neutral-500">
                                            Supplier (optional)
                                        </span>
                                        <input
                                            type="text"
                                            value={
                                                params.standoffStudSpec
                                                    ?.supplier ?? ''
                                            }
                                            onChange={(e) =>
                                                setParam(
                                                    'standoffStudSpec',
                                                    {
                                                        ...(params.standoffStudSpec ??
                                                            {}),
                                                        supplier:
                                                            e.target.value ||
                                                            undefined,
                                                    },
                                                )
                                            }
                                            placeholder="e.g. ASF Components"
                                            className="mt-0.5 w-full rounded border border-neutral-300 px-1.5 py-1 text-xs focus:border-black focus:outline-none"
                                        />
                                    </label>
                                </div>

                                {/* Fixings — diameter + density + manual */}
                                <div className="space-y-2 pt-1">
                                    <h4 className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                                        Fixings
                                    </h4>
                                    <NumField
                                        label="Diameter (mm)"
                                        step={0.5}
                                        value={
                                            params.fixingDiameterMm ??
                                            (params.fixingRadiusMm
                                                ? params.fixingRadiusMm * 2
                                                : 10)
                                        }
                                        onChange={(n) =>
                                            setParam(
                                                'fixingDiameterMm',
                                                n > 0 ? n : 0.2,
                                            )
                                        }
                                    />
                                    <div>
                                        <div className="flex items-baseline justify-between">
                                            <span className="text-[10px] text-neutral-500">
                                                Density (auto-placed)
                                            </span>
                                            <span className="text-[10px] tabular-nums text-neutral-400">
                                                {Math.round(
                                                    (params.fixingDensity ??
                                                        1) * 100,
                                                )}
                                                %
                                            </span>
                                        </div>
                                        <input
                                            type="range"
                                            min={0}
                                            max={100}
                                            value={Math.round(
                                                50 +
                                                    Math.log2(
                                                        params.fixingDensity ??
                                                            1,
                                                    ) *
                                                        50,
                                            )}
                                            onChange={(e) => {
                                                const v = Number(
                                                    e.target.value,
                                                );
                                                const factor = Math.pow(
                                                    2,
                                                    (v - 50) / 50,
                                                );
                                                setParam(
                                                    'fixingDensity',
                                                    Math.round(factor * 100) /
                                                        100,
                                                );
                                            }}
                                            className="mt-1 h-1 w-full accent-black"
                                            aria-label="Fixing density"
                                        />
                                        <div className="mt-0.5 flex justify-between text-[9px] uppercase tracking-wide text-neutral-400">
                                            <span>Sparse</span>
                                            <span>Normal</span>
                                            <span>Dense</span>
                                        </div>
                                    </div>

                                    {/* Manual placement + deletion. Modes
                                        are mutually exclusive; clicking the
                                        active mode again turns it off. */}
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setFixingMode(
                                                    fixingMode === 'place'
                                                        ? 'off'
                                                        : 'place',
                                                )
                                            }
                                            aria-pressed={
                                                fixingMode === 'place'
                                            }
                                            className={`flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                                                fixingMode === 'place'
                                                    ? 'text-white shadow-sm'
                                                    : 'border border-neutral-300 text-neutral-700 hover:bg-neutral-100'
                                            }`}
                                            style={
                                                fixingMode === 'place'
                                                    ? { background: ACCENT }
                                                    : undefined
                                            }
                                        >
                                            <Crosshair
                                                size={14}
                                                aria-hidden
                                            />
                                            {fixingMode === 'place'
                                                ? 'Done placing'
                                                : 'Place fixings'}
                                        </button>
                                        <button
                                            type="button"
                                            disabled={
                                                (params.manualFixings?.length ??
                                                    0) === 0
                                            }
                                            onClick={() =>
                                                setFixingMode(
                                                    fixingMode === 'delete'
                                                        ? 'off'
                                                        : 'delete',
                                                )
                                            }
                                            aria-pressed={
                                                fixingMode === 'delete'
                                            }
                                            className={`flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                                fixingMode === 'delete'
                                                    ? 'bg-red-600 text-white shadow-sm'
                                                    : 'border border-neutral-300 text-neutral-700 hover:bg-neutral-100'
                                            }`}
                                        >
                                            <Eraser size={14} aria-hidden />
                                            {fixingMode === 'delete'
                                                ? 'Done deleting'
                                                : 'Delete'}
                                        </button>
                                        {(params.manualFixings?.length ?? 0) >
                                            0 && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    clearManualFixings()
                                                }
                                                className="min-h-[40px] rounded-md border border-neutral-300 px-2 py-2 text-xs font-medium text-neutral-500 hover:bg-neutral-100"
                                                aria-label="Remove every manually-placed fixing"
                                            >
                                                Clear (
                                                {
                                                    params.manualFixings
                                                        ?.length
                                                }
                                                )
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-[10px] text-neutral-500">
                                        Place: click the lettering on either
                                        canvas to drop a fixing. Fixings are
                                        anchored to the artwork, so they
                                        follow placement edits.
                                    </p>
                                </div>
                            </Section>
                        )}

                        {/* Cable holes — available for any illuminated
                            sign, independent of material. A pure
                            positioner: only one or two per letter, placed
                            exactly where the cable run dictates. */}
                        {hasArtwork && (
                            <Section title="Cable holes" defaultOpen={false}>
                                <p className="text-[10px] text-neutral-500">
                                    Holes cut in the panel face to feed
                                    cables into illuminated letters. Click to
                                    place; one or two per letter is typical.
                                </p>
                            <NumField
                                label="Diameter (mm)"
                                step={0.5}
                                value={params.cableHoleDiameterMm ?? 10}
                                onChange={(n) =>
                                    setParam(
                                        'cableHoleDiameterMm',
                                        n > 0 ? n : 0.2,
                                    )
                                }
                            />
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() =>
                                        setCableMode(
                                            cableMode === 'place'
                                                ? 'off'
                                                : 'place',
                                        )
                                    }
                                    aria-pressed={cableMode === 'place'}
                                    className={`flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                                        cableMode === 'place'
                                            ? 'text-white shadow-sm'
                                            : 'border border-neutral-300 text-neutral-700 hover:bg-neutral-100'
                                    }`}
                                    style={
                                        cableMode === 'place'
                                            ? { background: ACCENT }
                                            : undefined
                                    }
                                >
                                    <Crosshair size={14} aria-hidden />
                                    {cableMode === 'place'
                                        ? 'Done placing'
                                        : 'Place cable holes'}
                                </button>
                                <button
                                    type="button"
                                    disabled={
                                        (params.cableHoles?.length ?? 0) === 0
                                    }
                                    onClick={() =>
                                        setCableMode(
                                            cableMode === 'delete'
                                                ? 'off'
                                                : 'delete',
                                        )
                                    }
                                    aria-pressed={cableMode === 'delete'}
                                    className={`flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                        cableMode === 'delete'
                                            ? 'bg-red-600 text-white shadow-sm'
                                            : 'border border-neutral-300 text-neutral-700 hover:bg-neutral-100'
                                    }`}
                                >
                                    <Eraser size={14} aria-hidden />
                                    {cableMode === 'delete'
                                        ? 'Done deleting'
                                        : 'Delete'}
                                </button>
                                {(params.cableHoles?.length ?? 0) > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => clearCableHoles()}
                                        className="min-h-[40px] rounded-md border border-neutral-300 px-2 py-2 text-xs font-medium text-neutral-500 hover:bg-neutral-100"
                                        aria-label="Remove every cable hole"
                                    >
                                        Clear ({params.cableHoles?.length})
                                    </button>
                                )}
                            </div>
                            </Section>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
