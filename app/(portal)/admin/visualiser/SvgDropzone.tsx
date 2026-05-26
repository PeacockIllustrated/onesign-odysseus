'use client';

import { useRef, useState } from 'react';
import { useVisualiser } from './store';
import { importSvg } from '@/lib/visualiser/svg-import';
import {
    GROUP_HIGHLIGHT_PALETTE,
    type AlignH,
    type AlignV,
    type ApertureMode,
    type PanelParams,
} from '@/lib/visualiser/types';
import {
    AlertTriangle,
    Check,
    Crosshair,
    Eraser,
    Pencil,
    Trash2,
    Upload,
    X,
} from 'lucide-react';

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
    pendingCount: number;
    isExistingGroup: boolean;
    panelColor: string;
    onApply: (
        material: GroupMaterial,
        opts?: {
            color?: string;
            thicknessMm?: number;
            standoffDistanceMm?: number;
        },
    ) => void;
    onCancel: () => void;
}) {
    const [material, setMaterial] =
        useState<Exclude<GroupMaterial, 'cut'>>(initialMaterial);
    const [color, setColor] = useState<string>(initialColor);
    const [thickness, setThickness] = useState<number>(initialThickness);
    const [standoff, setStandoff] = useState<number>(initialStandoff);

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

    const hasColor = material !== 'solid';
    const hasThickness = material === 'acrylic' || material === 'standoff';
    const hasStandoff = material === 'standoff';

    return (
        <div className="rounded-md border border-orange-300 bg-orange-50 p-2.5 space-y-2">
            <p className="text-[11px] text-orange-900">
                {isExistingGroup
                    ? `Editing group · ${pendingCount} path${pendingCount === 1 ? '' : 's'}`
                    : `Building new group · ${pendingCount} path${pendingCount === 1 ? '' : 's'}`}
            </p>
            <p className="text-[10px] text-orange-800">
                Click paths on the canvas to add or remove them, then
                pick the material below.
            </p>

            <div className="grid grid-cols-5 overflow-hidden rounded-md border border-orange-300 text-[10px] font-medium">
                {(
                    [
                        ['cut', 'Cut'],
                        ['solid', 'Solid'],
                        ['vinyl', 'Vinyl'],
                        ['acrylic', 'Acrylic'],
                        ['standoff', 'Stood off'],
                    ] as const
                ).map(([v, label], k) => (
                    <button
                        key={v}
                        type="button"
                        onClick={() => {
                            if (v === 'cut') onApply('cut');
                            else pickMaterial(v);
                        }}
                        className={`py-1.5 ${
                            k > 0 ? 'border-l border-orange-300' : ''
                        } ${
                            v === 'cut'
                                ? 'bg-white text-red-600 hover:bg-red-50'
                                : material === v
                                  ? 'bg-black text-white'
                                  : 'bg-white text-neutral-700 hover:bg-neutral-100'
                        }`}
                        title={
                            v === 'cut'
                                ? 'Revert the selected paths to the default-for-ungrouped behaviour.'
                                : v === 'solid'
                                  ? 'Leave as panel material — no cut. Used for inner letter counters.'
                                  : v === 'standoff'
                                    ? 'Extruded letter mounted with studs at a distance from the panel face.'
                                    : undefined
                        }
                    >
                        {label}
                    </button>
                ))}
            </div>

            {hasColor && (
                <label className="block">
                    <span className="text-[10px] text-orange-900">
                        Colour
                    </span>
                    <div className="mt-0.5 flex items-center gap-1.5">
                        <input
                            type="color"
                            value={color}
                            onChange={(e) => setColor(e.target.value)}
                            className="h-7 w-9 cursor-pointer rounded border border-orange-300 bg-white p-0.5"
                        />
                        <input
                            type="text"
                            value={color}
                            onChange={(e) => {
                                const v = e.target.value.trim();
                                if (/^#[0-9a-fA-F]{6}$/.test(v)) setColor(v);
                            }}
                            className="flex-1 rounded border border-orange-300 px-2 py-1 font-mono text-[11px] uppercase focus:border-black focus:outline-none"
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
                        })
                    }
                    disabled={pendingCount === 0}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-black px-3 py-1.5 text-[11px] font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    <Check size={12} /> Apply{' '}
                    {material === 'standoff'
                        ? 'Stood off'
                        : material.charAt(0).toUpperCase() +
                          material.slice(1)}
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    className="rounded-md border border-orange-300 px-3 py-1.5 text-[11px] font-medium text-orange-900 hover:bg-orange-100"
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
        },
    ) => void;
    updateGroupProps: (
        id: string,
        patch: {
            color?: string;
            thicknessMm?: number;
            standoffDistanceMm?: number;
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
                        className="flex items-center gap-1 rounded-md bg-black px-2 py-1 text-[11px] font-medium text-white hover:bg-neutral-800"
                        title="Click paths on the canvas to bundle them into a new group"
                    >
                        <Pencil size={11} /> Edit cuts
                    </button>
                )}
            </div>

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
                    No groups yet. Click "Edit cuts" to pull SVG paths
                    out of the production cut as solid panel material,
                    vinyl appliqué, or extruded acrylic.
                </p>
            )}
            <ul className="space-y-1.5">
                {groups.map((g, i) => {
                    const palette =
                        GROUP_HIGHLIGHT_PALETTE[
                            i % GROUP_HIGHLIGHT_PALETTE.length
                        ];
                    const isThisOne = editingGroupId === g.id;
                    return (
                        <li
                            key={g.id}
                            className={`rounded-md border bg-white p-2 ${
                                isThisOne
                                    ? 'border-orange-400 ring-1 ring-orange-300'
                                    : 'border-neutral-200 hover:border-neutral-300'
                            }`}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <button
                                    type="button"
                                    onClick={() => startEditingGroup(g.id)}
                                    disabled={isEditing && !isThisOne}
                                    className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50"
                                    title="Edit members and material"
                                >
                                    <span
                                        className="h-3 w-3 shrink-0 rounded-sm border border-neutral-300"
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
                                    className="rounded p-1 text-neutral-500 hover:bg-red-50 hover:text-red-600"
                                    title="Delete group (paths revert to cut)"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>

                            {/* Inline colour / thickness — live edits while
                                not in selection edit, no Apply needed.
                                Stacked vertically so the hex code has
                                room to breathe and the thickness field
                                doesn't get squeezed. */}
                            {!isEditing && g.material !== 'solid' && (
                                <div className="mt-2 space-y-2">
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
                                                        color: e.target.value,
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
                                    {(g.material === 'acrylic' ||
                                        g.material === 'standoff') && (
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
        setSvg,
        clearSvg,
        setPlacement,
        setParam,
        fixingMode,
        setFixingMode,
        clearManualFixings,
        editingGroupId,
        pendingPaths,
        startNewGroupEdit,
        startEditingGroup,
        cancelGroupEdit,
        applyEditMaterial,
        updateGroupProps,
        deleteGroup,
    } = useVisualiser();
    const inputRef = useRef<HTMLInputElement>(null);
    const [error, setError] = useState<string | null>(null);

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
            setSvg(text, result);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not read SVG');
        }
    };

    const placement = params.aperturePlacement;

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Aperture artwork
                </span>
                {svgSource && (
                    <button
                        type="button"
                        onClick={clearSvg}
                        className="flex items-center gap-1 text-xs text-neutral-500 hover:text-red-600"
                    >
                        <X size={12} /> Remove
                    </button>
                )}
            </div>

            {!svgSource ? (
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="flex w-full flex-col items-center gap-1 rounded-lg border-2 border-dashed border-neutral-300 px-4 py-6 text-neutral-400 hover:border-neutral-400 hover:text-neutral-600"
                >
                    <Upload size={20} />
                    <span className="text-xs">Upload an SVG to cut from the panel</span>
                </button>
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

                    {/* Quick default — sets the material every ungrouped
                        SVG path falls back to. Groups override on a
                        per-path basis, so the typical flow is "pick the
                        one material most of the sign is, then group the
                        exceptions". Without a quick default, everything
                        in an all-standoff sign would need an explicit
                        group, which adds clicks for the common case. */}
                    <div className="pt-2 border-t border-neutral-100 space-y-2">
                        <div>
                            <span className="text-[10px] text-neutral-500">
                                Quick default
                            </span>
                            <div className="mt-0.5">
                                <Segmented<ApertureMode>
                                    options={[
                                        ['aperture', 'Cut'],
                                        ['standoff', 'Stood off'],
                                    ]}
                                    value={params.apertureMode ?? 'aperture'}
                                    onChange={(v) =>
                                        setParam('apertureMode', v)
                                    }
                                />
                            </div>
                            <p className="mt-1 text-[10px] text-neutral-400">
                                Any path not put into a Material Group below
                                renders as this. Override individual paths
                                with their own material in the group editor.
                            </p>
                        </div>
                        {imported && (
                            <MaterialGroupsPanel
                                groups={params.materialGroups ?? []}
                                editingGroupId={editingGroupId}
                                pendingPaths={pendingPaths}
                                panelColor={params.panelColor ?? '#d6d6d6'}
                                startNewGroupEdit={startNewGroupEdit}
                                startEditingGroup={startEditingGroup}
                                cancelGroupEdit={cancelGroupEdit}
                                applyEditMaterial={applyEditMaterial}
                                updateGroupProps={updateGroupProps}
                                deleteGroup={deleteGroup}
                            />
                        )}
                        {/* Standoff defaults + fixings — shown whenever any
                            path is rendered as stood off, regardless of
                            whether that's via the quick default or via an
                            explicit group. Fixings are a single global
                            set applied across every standoff path so the
                            shop only configures the diameter / density
                            once per sign. */}
                        {anyStandoffPath && (
                            <>
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
                                            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors ${
                                                fixingMode === 'place'
                                                    ? 'bg-black text-white'
                                                    : 'border border-neutral-300 text-neutral-700 hover:bg-neutral-100'
                                            }`}
                                            title="Click anywhere on the lettering to drop a fixing. Manual fixings track the lettering across placement changes."
                                        >
                                            <Crosshair size={12} />
                                            {fixingMode === 'place'
                                                ? 'Done placing'
                                                : 'Place'}
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
                                            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                                                fixingMode === 'delete'
                                                    ? 'bg-red-600 text-white'
                                                    : 'border border-neutral-300 text-neutral-700 hover:bg-neutral-100'
                                            }`}
                                            title="Click on a manually-placed fixing to remove it."
                                        >
                                            <Eraser size={12} />
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
                                                className="rounded-md border border-neutral-300 px-2 py-1.5 text-[11px] font-medium text-neutral-500 hover:bg-neutral-100"
                                                title="Remove every manually-placed fixing"
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
                                    {fixingMode === 'place' && (
                                        <p className="text-[10px] text-neutral-500">
                                            Tap the 3D scene or flat preview
                                            to drop a fixing at that point.
                                            Anchored to the lettering, so it
                                            follows when you re-align the
                                            artwork.
                                        </p>
                                    )}
                                    {fixingMode === 'delete' && (
                                        <p className="text-[10px] text-red-600">
                                            Tap a manually-placed fixing to
                                            remove it.
                                        </p>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
