'use client';

import { useMemo, useRef, useState } from 'react';
import { useVisualiser } from './store';
import { importSvg, detectInnerCounters } from '@/lib/visualiser/svg-import';
import { composeLayers } from '@/lib/visualiser/compose';
import { TraceImage } from './TraceImage';
import { BinderButton } from '@/components/admin/BinderPicker';
import { Section } from './Section';
import { SwatchPicker, type SwatchItem } from './SwatchPicker';
import {
    UploadFinishModal,
    type PendingUpload,
    type UploadFinishChoice,
} from './UploadFinishModal';
import { ACRYLIC_COLOURS, nearestAcrylic } from '@/lib/visualiser/acrylic';
import { RAL_CLASSIC } from '@/lib/visualiser/ral';
import {
    ACRYLIC_THICKNESSES_MM,
    clusterByColour,
    matchedStockColour,
} from '@/lib/visualiser/upload-finish';
import {
    GROUP_HIGHLIGHT_PALETTE,
    type AlignH,
    type AlignV,
    type FlatPath,
    type ImportedSvg,
    type PanelParams,
    type FaceMaterial,
} from '@/lib/visualiser/types';
import { FACE_MATERIALS, FACE_MATERIAL_ORDER } from '@/lib/visualiser/extra-face';

const ACRYLIC_ITEMS: SwatchItem[] = ACRYLIC_COLOURS.map((c) => ({
    hex: c.hex,
    label: c.name,
    sublabel: `${c.brand}${c.code ? ' ' + c.code : ''} · ${c.finish}`,
}));

// Solid (plotter-cut) vinyl is colour-matched to a RAL reference, so its
// swatch picks from the RAL library rather than a free hex value.
const RAL_ITEMS: SwatchItem[] = RAL_CLASSIC.map((r) => ({
    hex: r.hex,
    label: r.code,
    sublabel: r.name,
}));
import {
    AlertTriangle,
    Check,
    ChevronRight,
    Crosshair,
    Eraser,
    ImageUp,
    Plus,
    RotateCcw,
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

/** Customer-facing names for each finish (the simplified tile labels). */
const SIMPLE_LABELS: Record<GroupMaterial, string> = {
    cut: 'Cut out',
    solid: 'Keep solid',
    vinyl: 'Printed',
    acrylic: 'Acrylic',
    standoff: 'Raised letters',
    pushthrough: 'Push-through',
    backlight: 'Backlit glow',
};

/**
 * The public studio's acrylic thickness choice — the stocked sheets only
 * (3 / 5 / 20 mm), instead of a free mm field a layman can't answer.
 */
function ThicknessChoice({
    value,
    onChange,
}: {
    value: number;
    onChange: (n: number) => void;
}) {
    return (
        <div>
            <span
                className="text-[10px] font-medium"
                style={{ color: ACCENT_DARK }}
            >
                Acrylic thickness
            </span>
            <div
                className="mt-0.5 grid grid-cols-3 overflow-hidden rounded-md border text-[10px] font-medium"
                style={{ borderColor: ACCENT_TINT_BORDER }}
            >
                {ACRYLIC_THICKNESSES_MM.map((t, k) => {
                    const on = value === t;
                    return (
                        <button
                            key={t}
                            type="button"
                            onClick={() => onChange(t)}
                            aria-pressed={on}
                            className={`min-h-[32px] py-1.5 ${
                                k > 0 ? 'border-l' : ''
                            } ${on ? 'text-white' : 'bg-white text-neutral-700 hover:bg-neutral-100'}`}
                            style={{
                                borderColor:
                                    k > 0 ? ACCENT_TINT_BORDER : undefined,
                                background: on ? ACCENT : undefined,
                            }}
                        >
                            {t} mm
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

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
    if (material === 'backlight') return '#fff4e0';
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
    initialGlowIntensity,
    initialExtraFace,
    initialFaceVinyl,
    pendingCount,
    isExistingGroup,
    panelColor,
    onApply,
    onCancel,
    simplified = false,
}: {
    initialMaterial: Exclude<GroupMaterial, 'cut'>;
    initialColor: string;
    initialThickness: number;
    initialStandoff: number;
    initialKeylineOffset: number;
    initialProtrusion: number;
    initialPrintFullColor: boolean;
    initialGlowIntensity: number;
    initialExtraFace: { material: FaceMaterial; thicknessMm: number } | null;
    initialFaceVinyl: { svgSource: string; wMm: number; hMm: number } | null;
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
            glowIntensity?: number;
            extraFace?: { material: FaceMaterial; thicknessMm: number } | null;
            faceVinyl?: { svgSource: string; wMm: number; hMm: number } | null;
        },
    ) => void;
    onCancel: () => void;
    /**
     * Public-studio mode: same engine + appearance controls, but plain-language
     * finish labels/help and a friendlier header. The shop tool leaves this off
     * and keeps the production vocabulary.
     */
    simplified?: boolean;
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
    const [glowIntensity, setGlowIntensity] = useState<number>(
        initialGlowIntensity,
    );
    const [extraFace, setExtraFace] = useState<{
        material: FaceMaterial;
        thicknessMm: number;
    } | null>(initialExtraFace);
    const [faceVinyl, setFaceVinyl] = useState<{
        svgSource: string;
        wMm: number;
        hMm: number;
    } | null>(initialFaceVinyl);

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
    const hasGlow = material === 'backlight';
    // An extra metal face can sit on letters that mount on the panel — the
    // push-through opal letters and backlit cuts. (Same surfacing in the staff
    // tool and the public studio: it lives in the shared editor.)
    const canFace = hasPushThrough || hasGlow;
    // A printed face vinyl can sit on any letter face that reads from the
    // front: face-stuck acrylic too, not just push-through / backlit.
    const canVinylFace = material === 'acrylic' || hasPushThrough || hasGlow;

    const materialHelp: Record<Exclude<GroupMaterial, 'cut'>, string> = simplified
        ? {
              solid: 'Left as solid panel — not cut out. Handy for the holes inside letters like “O” or “A”.',
              vinyl: 'Your design printed in full colour (or a single colour) straight onto the sign face.',
              acrylic: 'A coloured acrylic shape stuck onto the face for a crisp, glossy finish.',
              standoff:
                  'Raised letters mounted a little off the face on hidden studs — a premium, dimensional look.',
              pushthrough:
                  'Acrylic letters pushed through the face so they sit slightly proud — and glow beautifully when lit.',
              backlight:
                  'The shape is cut out and lit from behind so it glows. Pick the glow colour and brightness, then flip to night to see it.',
          }
        : {
              solid: 'Kept as panel material — not cut. Use for inner counters of letters.',
              vinyl: 'Vinyl bonded to the panel face — printed full colour, or a solid cut colour.',
              acrylic: 'Acrylic sheet face-stuck to the panel.',
              standoff:
                  'Extruded letter mounted with studs at a distance from the face.',
              pushthrough:
                  'Acrylic letter pressed through the panel from behind. Outer letter + each counter are cut as separate pieces, mounted to a backing board, and pressed through a keyline hole in the panel face.',
              backlight:
                  'Aperture cut with an opal diffuser behind it, lit from behind — the solid cut shape glows. Same back panel as keyline illumination. Pick the glow colour + brightness; switch the lit preview on to see it.',
          };

    // Finish picker tiles. Shop tool keeps the production vocabulary; the public
    // studio gets plain-language outcomes for the SAME materials (one palette).
    const materialTiles = simplified
        ? ([
              ['cut', 'Cut out'],
              ['solid', 'Keep solid'],
              ['vinyl', 'Printed'],
              ['acrylic', 'Acrylic'],
              ['standoff', 'Raised letters'],
              ['pushthrough', 'Push-through'],
              ['backlight', 'Backlit glow'],
          ] as const)
        : ([
              ['cut', 'Cut'],
              ['solid', 'Solid'],
              ['vinyl', 'Vinyl'],
              ['acrylic', 'Acrylic'],
              ['standoff', 'Stood off'],
              ['pushthrough', 'Push through'],
              ['backlight', 'Backlight'],
          ] as const);
    return (
        <div
            className="rounded-md border p-2.5 space-y-2"
            style={{
                borderColor: ACCENT_TINT_BORDER,
                background: ACCENT_TINT_BG,
            }}
        >
            <p className="text-[11px] font-medium" style={{ color: ACCENT_DARK }}>
                {simplified
                    ? `Choose a finish · ${pendingCount} shape${pendingCount === 1 ? '' : 's'} selected`
                    : isExistingGroup
                      ? `Editing group · ${pendingCount} path${pendingCount === 1 ? '' : 's'} selected`
                      : `New material group · ${pendingCount} path${pendingCount === 1 ? '' : 's'} selected`}
            </p>
            <p className="text-[10px]" style={{ color: ACCENT_DARK }}>
                {simplified
                    ? 'Tap shapes on the sign to add or remove them, then pick a finish below.'
                    : 'Click paths on the canvas to add or remove them, then pick the material below.'}
            </p>

            <div
                className="grid grid-cols-3 overflow-hidden rounded-md border text-[10px] font-medium"
                style={{ borderColor: ACCENT_TINT_BORDER }}
            >
                {materialTiles.map(([v, label], k) => {
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
                        {hasGlow ? 'Glow colour' : 'Colour'}
                    </span>
                    {material === 'acrylic' ||
                    material === 'pushthrough' ||
                    material === 'standoff' ? (
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
                                From our acrylic stock library.
                            </span>
                        </div>
                    ) : hasVinyl ? (
                        <div className="mt-0.5">
                            <SwatchPicker
                                items={RAL_ITEMS}
                                value={color}
                                placeholder="Pick a vinyl colour (RAL)…"
                                onPick={(i) => setColor(i.hex)}
                            />
                            <span
                                className="mt-0.5 block text-[10px]"
                                style={{ color: ACCENT_DARK }}
                            >
                                Plotter-cut vinyl, matched to a RAL colour.
                            </span>
                        </div>
                    ) : (
                        // Backlight glow is emissive light, not a stock
                        // material — any colour is valid.
                        <div className="mt-0.5 flex items-center gap-1.5">
                            <input
                                type="color"
                                value={color}
                                onChange={(e) => setColor(e.target.value)}
                                className="h-11 w-14 cursor-pointer rounded border bg-white p-0.5"
                                style={{ borderColor: ACCENT_TINT_BORDER }}
                                aria-label="Glow colour"
                            />
                            <input
                                type="text"
                                value={color}
                                onChange={(e) => {
                                    const v = e.target.value.trim();
                                    if (/^#[0-9a-fA-F]{6}$/.test(v)) setColor(v);
                                }}
                                className="flex-1 rounded border px-2 py-2 font-mono text-[11px] uppercase focus:border-[var(--accent)] focus:outline-none"
                                style={{ borderColor: ACCENT_TINT_BORDER }}
                            />
                        </div>
                    )}
                </label>
            )}

            {hasThickness &&
                (simplified ? (
                    <ThicknessChoice value={thickness} onChange={setThickness} />
                ) : (
                    <NumField
                        label="Thickness (mm)"
                        step={0.5}
                        value={thickness}
                        onChange={(n) => setThickness(n > 0 ? n : 0.5)}
                    />
                ))}

            {hasStandoff && (
                <NumField
                    label={
                        simplified
                            ? 'Gap off the face (mm)'
                            : 'Standoff distance (mm)'
                    }
                    step={1}
                    value={standoff}
                    onChange={(n) => setStandoff(n >= 0 ? n : 0)}
                />
            )}

            {hasGlow && (
                <NumField
                    label={simplified ? 'Glow brightness' : 'Glow intensity'}
                    step={0.1}
                    value={glowIntensity}
                    onChange={(n) => setGlowIntensity(n >= 0 ? n : 0)}
                />
            )}

            {hasPushThrough && (
                <>
                    <NumField
                        label={
                            simplified
                                ? 'Halo gap around letters (mm)'
                                : 'Keyline offset (mm)'
                        }
                        step={0.5}
                        value={keylineOffset}
                        onChange={(n) =>
                            setKeylineOffset(n >= 0 ? n : 0)
                        }
                    />
                    {/* Protrusion is redundant next to thickness for a
                        customer — the shop sets it. Staff keep the field. */}
                    {!simplified && (
                        <NumField
                            label="Protrusion (mm)"
                            step={1}
                            value={protrusion}
                            onChange={(n) => setProtrusion(n >= 0 ? n : 0)}
                        />
                    )}
                    <p className="text-[10px] text-neutral-500">
                        {simplified
                            ? 'We cut the acrylic letters and mount them through the face so they sit proud — and glow when lit.'
                            : 'Outer letter + each counter are cut as separate pieces. Mount both on a backing board behind the panel.'}
                    </p>
                </>
            )}

            {canFace && (
                <div
                    className="space-y-1.5 rounded-md border p-2"
                    style={{ borderColor: ACCENT_TINT_BORDER }}
                >
                    <label className="flex items-center gap-2 text-[11px] font-medium text-neutral-700">
                        <input
                            type="checkbox"
                            checked={extraFace !== null}
                            onChange={(e) =>
                                setExtraFace(
                                    e.target.checked
                                        ? {
                                              material: 'brass',
                                              thicknessMm:
                                                  FACE_MATERIALS.brass
                                                      .defaultThicknessMm,
                                          }
                                        : null,
                                )
                            }
                        />
                        {simplified
                            ? 'Add a metal face (brass, steel…) — premium'
                            : 'Extra face (cut from metal, laminated on front)'}
                    </label>
                    {extraFace && (
                        <div className="grid grid-cols-2 gap-1.5">
                            <label className="block">
                                <span className="mb-0.5 block text-[10px] text-neutral-500">
                                    Material
                                </span>
                                <select
                                    value={extraFace.material}
                                    onChange={(e) => {
                                        const m = e.target
                                            .value as FaceMaterial;
                                        setExtraFace({
                                            material: m,
                                            thicknessMm:
                                                FACE_MATERIALS[m]
                                                    .defaultThicknessMm,
                                        });
                                    }}
                                    className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-xs focus:border-[var(--accent)] focus:outline-none"
                                >
                                    {FACE_MATERIAL_ORDER.map((m) => (
                                        <option key={m} value={m}>
                                            {FACE_MATERIALS[m].label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <NumField
                                label="Face thick. (mm)"
                                step={0.5}
                                value={extraFace.thicknessMm}
                                onChange={(n) =>
                                    setExtraFace({
                                        ...extraFace,
                                        thicknessMm: n > 0 ? n : 0.5,
                                    })
                                }
                            />
                        </div>
                    )}
                    {extraFace && (
                        <p className="text-[10px] text-neutral-500">
                            {simplified
                                ? `A real ${FACE_MATERIALS[extraFace.material].label.toLowerCase()} face on the front of each letter — a high-end architectural finish.`
                                : `${FACE_MATERIALS[extraFace.material].label} faces cut to the letter shape (counters as holes) — exported as cut files and sent to the nester like acrylic.`}
                        </p>
                    )}
                </div>
            )}

            {/* Printed face vinyl — a second SVG (the print art) of the same
                proportions, clipped to these letters + laminated on the front.
                Exported as a print + a letter-outline cut. */}
            {canVinylFace && (
                <div
                    className="space-y-1 rounded-md border p-2"
                    style={{ borderColor: ACCENT_TINT_BORDER }}
                >
                    <span className="block text-[11px] font-medium text-neutral-700">
                        Printed face vinyl
                    </span>
                    {faceVinyl ? (
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-medium text-emerald-700">
                                Print attached ({Math.round(faceVinyl.wMm)}×
                                {Math.round(faceVinyl.hMm)})
                            </span>
                            <button
                                type="button"
                                onClick={() => setFaceVinyl(null)}
                                className="rounded border border-neutral-300 px-2 py-0.5 text-[10px] text-neutral-600 hover:bg-neutral-100"
                            >
                                Remove
                            </button>
                        </div>
                    ) : (
                        <label className="inline-flex cursor-pointer items-center gap-1.5">
                            <input
                                type="file"
                                accept=".svg,image/svg+xml"
                                className="hidden"
                                onChange={async (e) => {
                                    const f = e.target.files?.[0];
                                    if (!f) return;
                                    try {
                                        const text = await f.text();
                                        const b = importSvg(text).bbox;
                                        setFaceVinyl({
                                            svgSource: text,
                                            wMm: b.w,
                                            hMm: b.h,
                                        });
                                    } catch {
                                        /* ignore an unreadable SVG */
                                    }
                                    e.target.value = '';
                                }}
                            />
                            <span className="rounded-md border border-neutral-300 px-2 py-1 text-[10px] text-neutral-700 hover:bg-neutral-100">
                                Upload print SVG…
                            </span>
                        </label>
                    )}
                    <p className="text-[10px] text-neutral-500">
                        A same-proportion print SVG, auto-aligned to these letters
                        and printed on their faces (print + cut on export).
                    </p>
                </div>
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
                            glowIntensity: hasGlow
                                ? glowIntensity
                                : undefined,
                            extraFace: canFace ? extraFace : null,
                            faceVinyl: canVinylFace ? faceVinyl : null,
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

/* ------------------------------------------------------------------ *
 * Materials — per-shape overrides
 * ------------------------------------------------------------------ */

const MATERIAL_LABELS: Record<GroupMaterial, string> = {
    cut: 'Cut-out',
    solid: 'Solid (kept)',
    vinyl: 'Vinyl',
    acrylic: 'Acrylic',
    standoff: 'Stand-off',
    pushthrough: 'Push-through',
    backlight: 'Backlit',
};

/** Human label for the whole-sign default (apertureMode). */
function defaultModeLabel(mode: 'aperture' | 'vinyl' | 'standoff'): string {
    return mode === 'standoff'
        ? 'Stand-off'
        : mode === 'vinyl'
          ? 'Printed vinyl'
          : 'Cut-out';
}

/** Chip text for one shape's resolved material (override → its material; else the default). */
function shapeMaterialChip(
    group: MaterialGroup | undefined,
    mode: 'aperture' | 'vinyl' | 'standoff',
): { label: string; isDefault: boolean } {
    if (!group) return { label: defaultModeLabel(mode), isDefault: true };
    if (group.material === 'vinyl')
        return {
            label:
                group.printFullColor !== false ? 'Printed vinyl' : 'Solid vinyl',
            isDefault: false,
        };
    return { label: MATERIAL_LABELS[group.material], isDefault: false };
}

const polyCentroid = (p: FlatPath): [number, number] => {
    let sx = 0;
    let sy = 0;
    for (const [x, y] of p.points) {
        sx += x;
        sy += y;
    }
    const n = p.points.length || 1;
    return [sx / n, sy / n];
};

const pointInPoly = (ring: FlatPath, [px, py]: [number, number]): boolean => {
    let inside = false;
    const r = ring.points;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const [xi, yi] = r[i];
        const [xj, yj] = r[j];
        if (
            yi > py !== yj > py &&
            px < ((xj - xi) * (py - yi)) / (yj - yi || 1e-12) + xi
        ) {
            inside = !inside;
        }
    }
    return inside;
};

/**
 * Tiny silhouette of one imported shape (its outer outline + any counters
 * sitting inside it, punched as even-odd holes) so the operator can recognise
 * which part of the artwork a row refers to. Pure SVG scaled by its own
 * viewBox — the coordinate space (native mm vs composed mm) doesn't matter.
 */
function ShapeThumb({
    paths,
    index,
    counters,
    fill,
}: {
    paths: FlatPath[];
    index: number;
    counters: number[];
    fill: string;
}) {
    const outer = paths[index];
    if (!outer || outer.points.length < 2) {
        return (
            <span
                className="block h-7 w-7 shrink-0 rounded bg-neutral-100"
                aria-hidden
            />
        );
    }
    const subs: FlatPath[] = [outer];
    for (const c of counters) {
        const cp = paths[c];
        if (cp && pointInPoly(outer, polyCentroid(cp))) subs.push(cp);
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const s of subs) {
        for (const [x, y] of s.points) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }
    }
    const w = maxX - minX || 1;
    const h = maxY - minY || 1;
    const pad = Math.max(w, h) * 0.1;
    const d = subs
        .map((s) => {
            const [f, ...rest] = s.points;
            return (
                `M ${f[0]} ${f[1]} ` +
                rest.map(([x, y]) => `L ${x} ${y}`).join(' ') +
                (s.closed ? ' Z' : '')
            );
        })
        .join(' ');
    return (
        <svg
            viewBox={`${minX - pad} ${minY - pad} ${w + pad * 2} ${h + pad * 2}`}
            className="h-7 w-7 shrink-0 rounded border border-neutral-200 bg-white"
            preserveAspectRatio="xMidYMid meet"
            aria-hidden
        >
            <path d={d} fill={fill} fillRule="evenodd" />
        </svg>
    );
}

/**
 * The per-shape override list. Each artwork shape is a row showing a
 * thumbnail + its resolved material; clicking a row opens the material
 * picker for just that shape (or, while a group edit is open, toggles the
 * shape in/out of the current selection — mirroring canvas clicks). The
 * underlying storage is unchanged: rows read/write `materialGroups`, and
 * un-overridden shapes follow the whole-sign default (`apertureMode`).
 */
function ShapeMaterialsPanel({
    paths,
    outerShapes,
    counters,
    groups,
    apertureMode,
    panelColor,
    editingGroupId,
    pendingPaths,
    startGroupEditFromPath,
    togglePendingPath,
    startNewGroupEdit,
    cancelGroupEdit,
    applyEditMaterial,
    removePathFromGroups,
    simplified = false,
    onSelectAll,
}: {
    paths: FlatPath[];
    outerShapes: number[];
    counters: number[];
    groups: MaterialGroup[];
    apertureMode: 'aperture' | 'vinyl' | 'standoff';
    panelColor: string;
    editingGroupId: string | null;
    pendingPaths: number[];
    startGroupEditFromPath: (pathIndex: number) => void;
    togglePendingPath: (pathIndex: number) => void;
    startNewGroupEdit: () => void;
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
            glowIntensity?: number;
        },
    ) => void;
    removePathFromGroups: (pathIndex: number) => void;
    /**
     * Public-studio mode: this panel becomes the SINGLE material control (the
     * separate whole-sign default tier is hidden by the parent), so it grows a
     * "finish the whole sign" entry point and plain-language copy.
     */
    simplified?: boolean;
    /** Open the finish picker with EVERY shape selected (whole-sign finish). */
    onSelectAll?: () => void;
}) {
    const isEditing = editingGroupId !== null;
    const pendingSet = new Set(pendingPaths);
    const groupById = new Map(groups.map((g) => [g.id, g] as const));
    const groupPos = new Map(groups.map((g, i) => [g.id, i] as const));
    const groupByPath = new Map<number, MaterialGroup>();
    for (const g of groups) for (const i of g.pathIndices) groupByPath.set(i, g);

    const editingExisting =
        editingGroupId && editingGroupId !== 'new'
            ? groupById.get(editingGroupId)
            : null;

    const overridden = outerShapes.filter((i) => groupByPath.has(i)).length;
    const total = outerShapes.length;

    return (
        <div className="space-y-2 border-t border-neutral-100 pt-2">
            {/* Public studio: one button finishes the whole sign in a couple of
                taps. It opens the SAME picker as a per-shape change, just with
                every shape selected — so there's a single finish vocabulary
                everywhere (no separate "default material" tier to reconcile). */}
            {simplified && !isEditing && total > 0 && (
                <button
                    type="button"
                    onClick={onSelectAll}
                    className="flex w-full min-h-[40px] items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[12px] font-semibold text-white shadow-sm transition-colors"
                    style={{ background: ACCENT }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = ACCENT_DARK;
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = ACCENT;
                    }}
                >
                    Choose a finish for the whole sign…
                </button>
            )}

            <div className="flex items-center justify-between gap-2">
                <h4 className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                    {simplified
                        ? total > 1
                            ? 'Or finish each part'
                            : 'Finish'
                        : 'Override individual shapes'}
                </h4>
                {!simplified && !isEditing && total > 1 && (
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
                        <Plus size={12} aria-hidden /> Group several
                    </button>
                )}
            </div>

            <p className="text-[10px] text-neutral-500">
                {simplified
                    ? overridden > 0
                        ? `${overridden} of ${total} shape${total === 1 ? '' : 's'} given their own finish. Tap any shape to change just that part.`
                        : 'Tap a shape to give just that part a different finish — or use the button above for the whole sign.'
                    : overridden > 0
                      ? `${overridden} of ${total} shape${total === 1 ? '' : 's'} overridden — the rest are ${defaultModeLabel(apertureMode)}. Overrides win over the whole-sign material.`
                      : `Every shape is ${defaultModeLabel(apertureMode)}. Pick a shape to make just that part a different material.`}
            </p>

            {isEditing && (
                <GroupEditControls
                    // Remount on target change so inputs re-seed cleanly.
                    key={editingGroupId}
                    initialMaterial={
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
                    initialKeylineOffset={editingExisting?.keylineOffsetMm ?? 1.5}
                    initialProtrusion={editingExisting?.protrusionMm ?? 5}
                    initialPrintFullColor={
                        editingExisting?.printFullColor !== false
                    }
                    initialGlowIntensity={editingExisting?.glowIntensity ?? 1}
                    initialExtraFace={editingExisting?.extraFace ?? null}
                    initialFaceVinyl={editingExisting?.faceVinyl ?? null}
                    pendingCount={pendingPaths.length}
                    isExistingGroup={!!editingExisting}
                    panelColor={panelColor}
                    onApply={applyEditMaterial}
                    onCancel={cancelGroupEdit}
                    simplified={simplified}
                />
            )}

            {total === 0 ? (
                <p className="text-[10px] text-neutral-400">
                    No separate shapes detected in this artwork.
                </p>
            ) : (
                <ul className="space-y-1.5">
                    {outerShapes.map((i, n) => {
                        const g = groupByPath.get(i);
                        const chip = shapeMaterialChip(g, apertureMode);
                        const pos = g ? (groupPos.get(g.id) ?? 0) : -1;
                        const swatch =
                            pos >= 0
                                ? GROUP_HIGHLIGHT_PALETTE[
                                      pos % GROUP_HIGHLIGHT_PALETTE.length
                                  ]
                                : null;
                        const selected = pendingSet.has(i);
                        const isEditTarget =
                            isEditing && !!g && g.id === editingGroupId;
                        return (
                            <li
                                key={i}
                                className={`flex items-center gap-2 rounded-md border bg-white p-1.5 ${
                                    selected || isEditTarget
                                        ? 'ring-1'
                                        : 'border-neutral-200 hover:border-neutral-300'
                                }`}
                                style={
                                    selected || isEditTarget
                                        ? {
                                              borderColor: ACCENT,
                                              // @ts-expect-error CSS custom prop for ring
                                              '--tw-ring-color': ACCENT_TINT_BORDER,
                                          }
                                        : undefined
                                }
                            >
                                <button
                                    type="button"
                                    onClick={() =>
                                        isEditing
                                            ? togglePendingPath(i)
                                            : startGroupEditFromPath(i)
                                    }
                                    className="flex min-h-[40px] min-w-0 flex-1 items-center gap-2 text-left"
                                    aria-label={
                                        isEditing
                                            ? `${selected ? 'Remove' : 'Add'} shape ${n + 1}`
                                            : `Change material for shape ${n + 1}`
                                    }
                                    aria-pressed={isEditing ? selected : undefined}
                                >
                                    <ShapeThumb
                                        paths={paths}
                                        index={i}
                                        counters={counters}
                                        fill={swatch ?? '#1a1f23'}
                                    />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[11px] font-medium text-neutral-700">
                                            Shape {n + 1}
                                        </span>
                                        <span className="mt-0.5 flex items-center gap-1">
                                            <span
                                                className={`truncate text-[10px] ${
                                                    chip.isDefault
                                                        ? 'text-neutral-400'
                                                        : 'font-medium'
                                                }`}
                                                style={
                                                    chip.isDefault
                                                        ? undefined
                                                        : { color: ACCENT_DARK }
                                                }
                                            >
                                                {chip.isDefault
                                                    ? simplified
                                                        ? chip.label
                                                        : `Default · ${chip.label}`
                                                    : chip.label}
                                            </span>
                                        </span>
                                    </span>
                                    {!isEditing && (
                                        <ChevronRight
                                            size={14}
                                            aria-hidden
                                            className="shrink-0 text-neutral-300"
                                        />
                                    )}
                                </button>
                                {!isEditing && g && (
                                    <button
                                        type="button"
                                        onClick={() => removePathFromGroups(i)}
                                        aria-label={`Reset shape ${n + 1} to the default material`}
                                        title="Reset to default"
                                        className="flex min-h-[36px] min-w-[36px] shrink-0 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                                    >
                                        <RotateCcw size={13} aria-hidden />
                                    </button>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            {isEditing && (
                <p className="text-[10px] text-neutral-400">
                    {simplified
                        ? 'Tap shapes above or on the sign to add or remove them, then pick a finish in the panel.'
                        : 'Click shapes above or on the canvas to add or remove them, then choose a material in the panel.'}
                </p>
            )}

            {/* Public studio: existing finishes stay open for adjustment —
                no re-selecting shapes to tweak a colour or thickness. Hidden
                while a selection edit is in flight so two editors never fight
                over the same group. */}
            {simplified && !isEditing && (
                <FinishAccordion groups={groups} panelColor={panelColor} />
            )}
        </div>
    );
}

/**
 * Public-studio finish accordion — every material group as an always-available
 * card that opens to its full options, editing the group LIVE (no re-selecting
 * shapes, no Apply). This is the "go back and adjust" path: the transient
 * GroupEditControls flow above stays for choosing WHICH shapes get a finish;
 * this is for tuning a finish that already exists.
 */
function FinishAccordion({
    groups,
    panelColor,
}: {
    groups: MaterialGroup[];
    panelColor: string;
}) {
    const { updateGroupProps, deleteGroup } = useVisualiser();
    if (groups.length === 0) return null;

    const switchMaterial = (g: MaterialGroup, next: GroupMaterial) => {
        if (next === g.material) return;
        // "Cut out" = no override group at all — the shapes fall back to the
        // whole-sign default (cut-out on the public studio).
        if (next === 'cut') {
            deleteGroup(g.id);
            return;
        }
        const patch: {
            material: Exclude<GroupMaterial, 'cut'>;
            color?: string;
            thicknessMm?: number;
            glowIntensity?: number;
        } = { material: next };
        // Snap the colour to the new finish's stock palette so a vinyl white
        // doesn't silently become an "acrylic" nobody stocks.
        if (
            next === 'acrylic' ||
            next === 'standoff' ||
            next === 'pushthrough'
        ) {
            patch.color = nearestAcrylic(g.color ?? panelColor).colour.hex;
            if (g.thicknessMm == null) patch.thicknessMm = 5;
        } else if (next === 'solid') {
            patch.color = panelColor;
        } else if (next === 'vinyl') {
            patch.color = g.color ?? '#ffffff';
        } else if (next === 'backlight') {
            patch.color = g.color ?? '#fff4e0';
            if (g.glowIntensity == null) patch.glowIntensity = 1;
        }
        updateGroupProps(g.id, patch);
    };

    return (
        <div className="space-y-1.5 border-t border-neutral-100 pt-2">
            <h4 className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                Your finishes
            </h4>
            <p className="text-[10px] text-neutral-500">
                Open a finish to adjust it — changes apply to every shape in
                that group straight away.
            </p>
            {groups.map((g, pos) => {
                const isVinyl = g.material === 'vinyl';
                const printed = isVinyl && g.printFullColor !== false;
                const acrylicBased =
                    g.material === 'acrylic' ||
                    g.material === 'standoff' ||
                    g.material === 'pushthrough';
                const canFace =
                    g.material === 'pushthrough' || g.material === 'backlight';
                const dot =
                    g.color ??
                    GROUP_HIGHLIGHT_PALETTE[
                        pos % GROUP_HIGHLIGHT_PALETTE.length
                    ];
                const title = isVinyl
                    ? printed
                        ? 'Printed (full colour)'
                        : 'Printed (single colour)'
                    : SIMPLE_LABELS[g.material];
                return (
                    <details
                        key={g.id}
                        className="group rounded-md border border-neutral-200 bg-white"
                    >
                        <summary className="flex min-h-[44px] cursor-pointer items-center gap-2 px-2.5 py-2 [&::-webkit-details-marker]:hidden">
                            <span
                                className="h-4 w-4 shrink-0 rounded-full border border-black/10"
                                style={{ background: dot }}
                                aria-hidden
                            />
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[12px] font-semibold text-neutral-800">
                                    {title}
                                </span>
                                <span className="block text-[10px] text-neutral-400">
                                    {g.pathIndices.length} shape
                                    {g.pathIndices.length === 1 ? '' : 's'}
                                </span>
                            </span>
                            <ChevronRight
                                size={14}
                                aria-hidden
                                className="shrink-0 text-neutral-400 transition-transform group-open:rotate-90"
                            />
                        </summary>
                        <div className="space-y-2 border-t border-neutral-100 px-2.5 py-2.5">
                            {/* Switch the finish in place. */}
                            <div
                                className="grid grid-cols-3 overflow-hidden rounded-md border text-[10px] font-medium"
                                style={{ borderColor: ACCENT_TINT_BORDER }}
                            >
                                {(
                                    [
                                        'cut',
                                        'solid',
                                        'vinyl',
                                        'acrylic',
                                        'standoff',
                                        'pushthrough',
                                        'backlight',
                                    ] as const
                                ).map((m, k) => {
                                    const on = g.material === m;
                                    return (
                                        <button
                                            key={m}
                                            type="button"
                                            onClick={() => switchMaterial(g, m)}
                                            aria-pressed={on}
                                            className={`min-h-[32px] py-1.5 ${
                                                k % 3 !== 0 ? 'border-l' : ''
                                            } ${k >= 3 ? 'border-t' : ''} ${
                                                m === 'cut'
                                                    ? 'bg-white text-red-600 hover:bg-red-50'
                                                    : on
                                                      ? 'text-white'
                                                      : 'bg-white text-neutral-700 hover:bg-neutral-100'
                                            }`}
                                            style={{
                                                borderColor:
                                                    k % 3 !== 0 || k >= 3
                                                        ? ACCENT_TINT_BORDER
                                                        : undefined,
                                                background:
                                                    m !== 'cut' && on
                                                        ? ACCENT
                                                        : undefined,
                                            }}
                                        >
                                            {SIMPLE_LABELS[m]}
                                        </button>
                                    );
                                })}
                            </div>

                            {isVinyl && (
                                <div
                                    className="grid grid-cols-2 overflow-hidden rounded-md border text-[10px] font-medium"
                                    style={{ borderColor: ACCENT_TINT_BORDER }}
                                >
                                    {(
                                        [
                                            [true, 'Full colour'],
                                            [false, 'Single colour'],
                                        ] as const
                                    ).map(([v, label], k) => (
                                        <button
                                            key={label}
                                            type="button"
                                            onClick={() =>
                                                updateGroupProps(g.id, {
                                                    printFullColor: v,
                                                })
                                            }
                                            aria-pressed={printed === v}
                                            className={`min-h-[32px] py-1.5 ${
                                                k > 0 ? 'border-l' : ''
                                            } ${
                                                printed === v
                                                    ? 'text-white'
                                                    : 'bg-white text-neutral-700 hover:bg-neutral-100'
                                            }`}
                                            style={{
                                                borderColor:
                                                    k > 0
                                                        ? ACCENT_TINT_BORDER
                                                        : undefined,
                                                background:
                                                    printed === v
                                                        ? ACCENT
                                                        : undefined,
                                            }}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {(acrylicBased || (isVinyl && !printed)) && (
                                <div>
                                    <span
                                        className="text-[10px] font-medium"
                                        style={{ color: ACCENT_DARK }}
                                    >
                                        Colour
                                    </span>
                                    <div className="mt-0.5">
                                        <SwatchPicker
                                            items={
                                                acrylicBased
                                                    ? ACRYLIC_ITEMS
                                                    : RAL_ITEMS
                                            }
                                            value={g.color}
                                            placeholder="Pick a colour…"
                                            onPick={(i) =>
                                                updateGroupProps(g.id, {
                                                    color: i.hex,
                                                })
                                            }
                                        />
                                    </div>
                                </div>
                            )}

                            {g.material === 'backlight' && (
                                <div>
                                    <span
                                        className="text-[10px] font-medium"
                                        style={{ color: ACCENT_DARK }}
                                    >
                                        Glow colour
                                    </span>
                                    <div className="mt-0.5 flex items-center gap-1.5">
                                        <input
                                            type="color"
                                            value={g.color ?? '#fff4e0'}
                                            onChange={(e) =>
                                                updateGroupProps(g.id, {
                                                    color: e.target.value,
                                                })
                                            }
                                            className="h-11 w-14 cursor-pointer rounded border bg-white p-0.5"
                                            style={{
                                                borderColor:
                                                    ACCENT_TINT_BORDER,
                                            }}
                                            aria-label="Glow colour"
                                        />
                                        <NumField
                                            label="Glow brightness"
                                            step={0.1}
                                            value={g.glowIntensity ?? 1}
                                            onChange={(n) =>
                                                updateGroupProps(g.id, {
                                                    glowIntensity:
                                                        n >= 0 ? n : 0,
                                                })
                                            }
                                        />
                                    </div>
                                </div>
                            )}

                            {acrylicBased && (
                                <ThicknessChoice
                                    value={g.thicknessMm ?? 5}
                                    onChange={(n) =>
                                        updateGroupProps(g.id, {
                                            thicknessMm: n,
                                        })
                                    }
                                />
                            )}

                            {g.material === 'standoff' && (
                                <NumField
                                    label="Gap off the face (mm)"
                                    step={1}
                                    value={g.standoffDistanceMm ?? 25}
                                    onChange={(n) =>
                                        updateGroupProps(g.id, {
                                            standoffDistanceMm: n >= 0 ? n : 0,
                                        })
                                    }
                                />
                            )}

                            {g.material === 'pushthrough' && (
                                <NumField
                                    label="Halo gap around letters (mm)"
                                    step={0.5}
                                    value={g.keylineOffsetMm ?? 1.5}
                                    onChange={(n) =>
                                        updateGroupProps(g.id, {
                                            keylineOffsetMm: n >= 0 ? n : 0,
                                        })
                                    }
                                />
                            )}

                            {canFace && (
                                <div
                                    className="space-y-1.5 rounded-md border p-2"
                                    style={{ borderColor: ACCENT_TINT_BORDER }}
                                >
                                    <label className="flex items-center gap-2 text-[11px] font-medium text-neutral-700">
                                        <input
                                            type="checkbox"
                                            checked={!!g.extraFace}
                                            onChange={(e) =>
                                                updateGroupProps(g.id, {
                                                    extraFace: e.target.checked
                                                        ? {
                                                              material: 'brass',
                                                              thicknessMm:
                                                                  FACE_MATERIALS
                                                                      .brass
                                                                      .defaultThicknessMm,
                                                          }
                                                        : null,
                                                })
                                            }
                                        />
                                        Add a metal face (brass, steel…) —
                                        premium
                                    </label>
                                    {g.extraFace && (
                                        <div className="grid grid-cols-2 gap-1.5">
                                            <label className="block">
                                                <span className="mb-0.5 block text-[10px] text-neutral-500">
                                                    Material
                                                </span>
                                                <select
                                                    value={g.extraFace.material}
                                                    onChange={(e) => {
                                                        const m = e.target
                                                            .value as FaceMaterial;
                                                        updateGroupProps(g.id, {
                                                            extraFace: {
                                                                material: m,
                                                                thicknessMm:
                                                                    FACE_MATERIALS[
                                                                        m
                                                                    ]
                                                                        .defaultThicknessMm,
                                                            },
                                                        });
                                                    }}
                                                    className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-xs focus:border-[var(--accent)] focus:outline-none"
                                                >
                                                    {FACE_MATERIAL_ORDER.map(
                                                        (m) => (
                                                            <option
                                                                key={m}
                                                                value={m}
                                                            >
                                                                {
                                                                    FACE_MATERIALS[
                                                                        m
                                                                    ].label
                                                                }
                                                            </option>
                                                        ),
                                                    )}
                                                </select>
                                            </label>
                                            <NumField
                                                label="Face thick. (mm)"
                                                step={0.5}
                                                value={g.extraFace.thicknessMm}
                                                onChange={(n) =>
                                                    updateGroupProps(g.id, {
                                                        extraFace: {
                                                            material:
                                                                g.extraFace!
                                                                    .material,
                                                            thicknessMm:
                                                                n > 0
                                                                    ? n
                                                                    : 0.5,
                                                        },
                                                    })
                                                }
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </details>
                );
            })}
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
                            ? 'bg-[var(--accent)] text-white'
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
    // Draft-and-commit (blur / Enter), matching ControlsPanel's NumberField:
    // committing per keystroke turned select-all + retype into a 0 that the
    // param clamps rejected, fighting the user mid-type.
    const [draft, setDraft] = useState<string | null>(null);
    const shown = draft ?? String(value);
    const commit = () => {
        if (draft !== null) {
            const n = parseFloat(draft);
            if (Number.isFinite(n)) onChange(n);
        }
        setDraft(null);
    };
    return (
        <label className="block">
            <span className="text-[10px] text-neutral-500">{label}</span>
            <input
                type="number"
                inputMode="decimal"
                step={step}
                value={shown}
                onFocus={() => setDraft(shown)}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    else if (e.key === 'Escape') setDraft(null);
                }}
                className="mt-0.5 w-full rounded border border-neutral-300 px-1.5 py-1 text-xs focus:border-[var(--accent)] focus:outline-none"
            />
        </label>
    );
}

export function SvgDropzone({ simplified = false }: { simplified?: boolean } = {}) {
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
        selectAllPaths,
        startGroupEditFromPath,
        cancelGroupEdit,
        applyEditMaterial,
        togglePendingPath,
        removePathFromGroups,
        addArtworkLayer,
        addMaterialGroups,
        updateArtworkLayer,
        removeArtworkLayer,
        reorderArtworkLayer,
        selectLayer,
        selectedLayerId,
    } = useVisualiser();
    const inputRef = useRef<HTMLInputElement>(null);
    const [error, setError] = useState<string | null>(null);
    const [traceMode, setTraceMode] = useState(false);
    // Public studio: an upload waits here for its finish choice (the modal)
    // instead of landing on the sign raw.
    const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(
        null,
    );

    const layers = params.artworkLayers ?? [];
    const composite = layers.length > 0;
    const hasArtwork = !!svgSource || composite;

    // The indexed shape set the rest of the pipeline works on. In composite
    // mode that's the composed layers (NOT the store's single `imported`, which
    // is null then) — built with the SAME pure helper the derivation uses so
    // path indices line up 1:1 with materialGroups / pendingPaths / the canvas.
    const layersKey = JSON.stringify(layers);
    const shapesSvg = useMemo<ImportedSvg | null>(() => {
        if (composite)
            return composeLayers(
                layers,
                params.panelWidthMm,
                params.panelHeightMm,
            );
        return imported;
        // layers is captured via layersKey to keep the dep array statically checkable
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        composite,
        layersKey,
        params.panelWidthMm,
        params.panelHeightMm,
        imported,
    ]);

    // Inner counters (holes in a compound letter) follow their parent shape, so
    // they're hidden from the override list and only rendered inside a shape's
    // thumbnail. The outer shapes are everything else.
    const counters = useMemo(
        () => detectInnerCounters(shapesSvg?.paths ?? []),
        [shapesSvg],
    );
    const outerShapes = useMemo(() => {
        const set = new Set(counters);
        return (shapesSvg?.paths ?? [])
            .map((_, i) => i)
            .filter((i) => !set.has(i));
    }, [shapesSvg, counters]);

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
            const cleanName = file.name.replace(/\.svg$/i, '');
            // Public studio: hold the upload and ask for a finish first, so
            // the artwork never appears on the sign before the customer has
            // said how it should be made.
            if (simplified) {
                setPendingUpload({
                    text,
                    name: cleanName || 'Your artwork',
                    imported: result,
                });
                return;
            }
            // Staff flow: each upload is an artwork layer — add it to the
            // composition so several pieces (icon + wordmark, …) can sit
            // on the sign and move independently.
            addArtworkLayer(text, cleanName || undefined);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not read SVG');
        }
    };

    // Land a pending public upload with its chosen finish: add the layer,
    // then group the layer's shapes per artwork colour so each part arrives
    // matched to the nearest stock swatch (see lib/visualiser/upload-finish).
    // The new layer appends at the end of the composition, so its paths take
    // the tail indices after the current composed set.
    const confirmPendingUpload = (choice: UploadFinishChoice) => {
        const up = pendingUpload;
        if (!up) return;
        setPendingUpload(null);
        const base = shapesSvg?.paths.length ?? 0;
        addArtworkLayer(up.text, up.name);
        if (choice.material === 'cut') return; // whole-sign default already
        const localCounters = new Set(detectInnerCounters(up.imported.paths));
        const outer = up.imported.paths
            .map((_, i) => i)
            .filter((i) => !localCounters.has(i));
        if (outer.length === 0) return;
        if (choice.material === 'vinyl' && choice.printFullColor !== false) {
            addMaterialGroups([
                {
                    pathIndices: outer.map((i) => base + i),
                    material: 'vinyl',
                    printFullColor: true,
                    label: up.name,
                },
            ]);
            return;
        }
        const clusters = clusterByColour(up.imported.paths, outer);
        addMaterialGroups(
            clusters.map((c) => ({
                pathIndices: c.indices.map((i) => base + i),
                material: choice.material as Exclude<GroupMaterial, 'cut'>,
                color:
                    (clusters.length === 1 ? choice.colourOverride : undefined) ??
                    matchedStockColour(choice.material, c.colour, {
                        printFullColor: choice.printFullColor,
                    }),
                thicknessMm: choice.thicknessMm,
                printFullColor:
                    choice.material === 'vinyl'
                        ? choice.printFullColor
                        : undefined,
                label: up.name,
            })),
        );
    };

    const placement = params.aperturePlacement;

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                    {/* The numbered chip is the STAFF rail's workflow ordering —
                        meaningless (and clashing with the wizard's own 1–4
                        stepper) in the public studio. */}
                    {!simplified && (
                        <span
                            className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white"
                            style={{ background: hasArtwork ? '#4e7e8c' : '#9ca3af' }}
                            aria-hidden
                        >
                            3
                        </span>
                    )}
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
                <TraceImage
                    onClose={() => setTraceMode(false)}
                    simplified={simplified}
                />
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
                    {/* The binder is the INTERNAL client-logo library (super-
                        admin actions) — on the unauth public studio it can only
                        error, so it's staff-only. */}
                    {!simplified && (
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
                    )}
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
                                        <>
                                            <div className="mt-2 grid grid-cols-2 gap-1.5">
                                                <NumField
                                                    label="X (mm)"
                                                    step={5}
                                                    value={Math.round(l.xMm)}
                                                    onChange={(n) =>
                                                        updateArtworkLayer(
                                                            l.id,
                                                            { xMm: n },
                                                        )
                                                    }
                                                />
                                                <NumField
                                                    label="Y (mm)"
                                                    step={5}
                                                    value={Math.round(l.yMm)}
                                                    onChange={(n) =>
                                                        updateArtworkLayer(
                                                            l.id,
                                                            { yMm: n },
                                                        )
                                                    }
                                                />
                                                {/* Real-world size in mm (aspect-locked). Setting W or
                                                    H derives the uniform scale from the layer's native
                                                    bbox — mm-precise sizing instead of a blind %. The
                                                    other dimension follows automatically. Rescale about
                                                    the layer centre so it grows/shrinks in place. */}
                                                <NumField
                                                    label="W (mm)"
                                                    step={5}
                                                    value={Math.round(
                                                        l.wMm * l.scale,
                                                    )}
                                                    onChange={(n) => {
                                                        const newScale =
                                                            n > 0
                                                                ? n /
                                                                  Math.max(
                                                                      1,
                                                                      l.wMm,
                                                                  )
                                                                : 0.01;
                                                        const cx =
                                                            l.xMm +
                                                            (l.wMm * l.scale) /
                                                                2;
                                                        const cy =
                                                            l.yMm +
                                                            (l.hMm * l.scale) /
                                                                2;
                                                        updateArtworkLayer(
                                                            l.id,
                                                            {
                                                                scale: newScale,
                                                                xMm:
                                                                    cx -
                                                                    (l.wMm *
                                                                        newScale) /
                                                                        2,
                                                                yMm:
                                                                    cy -
                                                                    (l.hMm *
                                                                        newScale) /
                                                                        2,
                                                            },
                                                        );
                                                    }}
                                                />
                                                <NumField
                                                    label="H (mm)"
                                                    step={5}
                                                    value={Math.round(
                                                        l.hMm * l.scale,
                                                    )}
                                                    onChange={(n) => {
                                                        const newScale =
                                                            n > 0
                                                                ? n /
                                                                  Math.max(
                                                                      1,
                                                                      l.hMm,
                                                                  )
                                                                : 0.01;
                                                        const cx =
                                                            l.xMm +
                                                            (l.wMm * l.scale) /
                                                                2;
                                                        const cy =
                                                            l.yMm +
                                                            (l.hMm * l.scale) /
                                                                2;
                                                        updateArtworkLayer(
                                                            l.id,
                                                            {
                                                                scale: newScale,
                                                                xMm:
                                                                    cx -
                                                                    (l.wMm *
                                                                        newScale) /
                                                                        2,
                                                                yMm:
                                                                    cy -
                                                                    (l.hMm *
                                                                        newScale) /
                                                                        2,
                                                            },
                                                        );
                                                    }}
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    updateArtworkLayer(l.id, {
                                                        xMm:
                                                            params.panelWidthMm /
                                                                2 -
                                                            (l.wMm * l.scale) /
                                                                2,
                                                        yMm:
                                                            params.panelHeightMm /
                                                                2 -
                                                            (l.hMm * l.scale) /
                                                                2,
                                                    })
                                                }
                                                className="mt-1.5 flex min-h-[28px] w-full items-center justify-center gap-1 rounded-md border border-neutral-300 px-2 py-1 text-[10px] font-medium text-neutral-600 hover:bg-neutral-100"
                                            >
                                                <Crosshair
                                                    size={11}
                                                    aria-hidden
                                                />
                                                Centre on panel
                                            </button>
                                        </>
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
                        {!simplified && (
                            <BinderButton
                                label="Binder"
                                onPick={(a) =>
                                    void handleFile(
                                        new File([a.svgSource], `${a.name}.svg`, {
                                            type: 'image/svg+xml',
                                        }),
                                    )
                                }
                                className="flex min-h-[32px] flex-1 items-center justify-center gap-1 rounded-md border border-neutral-300 px-2 py-1.5 text-[11px] font-medium text-neutral-600 hover:bg-neutral-100"
                            />
                        )}
                    </div>
                    <p className="text-[10px] text-neutral-400">
                        {/* The Flat development tab only exists in the staff
                            tool — pointing a customer at it is a dead end. */}
                        {simplified
                            ? 'Select a piece to set its size and position on the sign, or centre it with one tap.'
                            : 'Select a layer, then drag its handle on the Flat development tab to move it.'}
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
                    {/* Global placement (align / size / nudge) — for the
                        legacy single artwork. In composite mode each
                        layer is positioned individually, so these are
                        hidden and the whole composite maps 1:1 to the
                        face. */}
                    {!composite && (
                      <>
                    <button
                        type="button"
                        onClick={() =>
                            setPlacement({
                                alignH: 'center',
                                alignV: 'middle',
                                nudgeXMm: 0,
                                nudgeYMm: 0,
                            })
                        }
                        className="flex min-h-[28px] w-full items-center justify-center gap-1 rounded-md border border-neutral-300 px-2 py-1 text-[10px] font-medium text-neutral-600 hover:bg-neutral-100"
                    >
                        <Crosshair size={11} aria-hidden /> Centre artwork
                    </button>
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

                    {/* Materials — one section: the whole-sign default at the
                        top, then per-shape overrides. Collapsible so the rail
                        isn't a wall of always-open panels. */}
                    <div className="space-y-2">
                        {hasArtwork && (
                            <Section
                                title={simplified ? 'Finish' : 'Materials'}
                                step={simplified ? undefined : 4}
                                accent
                            >
                                {/* Whole-sign default (shop tool only) — the
                                    single choice that drives every shape unless
                                    it's overridden in the list below. Hidden in
                                    the public studio, where the per-shape picker
                                    is the ONLY material control (one finish
                                    vocabulary) with a "whole sign" shortcut baked
                                    into it — no separate default tier to confuse
                                    a customer. */}
                                {!simplified && (
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
                                        Default material
                                    </span>
                                    <span
                                        className="mt-0.5 block text-[10px]"
                                        style={{ color: ACCENT_DARK }}
                                    >
                                        The starting material for every shape on
                                        the sign. Make any individual shape a
                                        different material in the list below.
                                    </span>
                                    <div className="mt-1">
                                        <Segmented<
                                            'aperture' | 'vinyl' | 'standoff'
                                        >
                                            options={[
                                                ['aperture', 'Cut-out'],
                                                ['vinyl', 'Printed vinyl'],
                                                ['standoff', 'Stand-off'],
                                            ]}
                                            value={
                                                (params.apertureMode ??
                                                    'aperture') as
                                                    | 'aperture'
                                                    | 'vinyl'
                                                    | 'standoff'
                                            }
                                            onChange={(v) =>
                                                setParam('apertureMode', v)
                                            }
                                        />
                                    </div>
                                    <p
                                        className="mt-1 text-[10px]"
                                        style={{ color: ACCENT_DARK }}
                                    >
                                        {(params.apertureMode ?? 'aperture') ===
                                        'vinyl'
                                            ? 'Printed full-colour vinyl on the panel face — gradients kept, nothing is cut.'
                                            : (params.apertureMode ??
                                                    'aperture') === 'standoff'
                                              ? 'Lettering stood off the face on studs.'
                                              : 'Cut out of the panel as apertures (holes).'}
                                    </p>

                                    {/* Stand-off appearance defaults live with
                                        the default control (not in a third
                                        place); the stud hardware + fixing holes
                                        stay under Stand-off & fixings. */}
                                    {(params.apertureMode ?? 'aperture') ===
                                        'standoff' && (
                                        <div className="mt-2 space-y-2 border-t border-[#b8d0d8] pt-2">
                                            <div className="grid grid-cols-2 gap-2">
                                                <NumField
                                                    label="Thickness (mm)"
                                                    step={0.5}
                                                    value={
                                                        params.letterThicknessMm ??
                                                        5
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
                                                <span
                                                    className="text-[10px]"
                                                    style={{ color: ACCENT_DARK }}
                                                >
                                                    Letter colour
                                                </span>
                                                <div className="mt-0.5">
                                                    <SwatchPicker
                                                        items={ACRYLIC_ITEMS}
                                                        value={
                                                            params.letterColor ??
                                                            '#1a1f23'
                                                        }
                                                        placeholder="Pick from acrylic stock…"
                                                        onPick={(i) =>
                                                            setParam(
                                                                'letterColor',
                                                                i.hex,
                                                            )
                                                        }
                                                    />
                                                </div>
                                            </label>
                                            <p className="text-[10px] text-neutral-500">
                                                Studs &amp; fixing holes are set
                                                in Stand-off &amp; fixings below.
                                            </p>
                                        </div>
                                    )}
                                </div>
                                )}

                                <ShapeMaterialsPanel
                                    paths={shapesSvg?.paths ?? []}
                                    outerShapes={outerShapes}
                                    counters={counters}
                                    groups={params.materialGroups ?? []}
                                    apertureMode={
                                        (params.apertureMode ?? 'aperture') as
                                            | 'aperture'
                                            | 'vinyl'
                                            | 'standoff'
                                    }
                                    panelColor={params.panelColor ?? '#d6d6d6'}
                                    editingGroupId={editingGroupId}
                                    pendingPaths={pendingPaths}
                                    startGroupEditFromPath={
                                        startGroupEditFromPath
                                    }
                                    togglePendingPath={togglePendingPath}
                                    startNewGroupEdit={startNewGroupEdit}
                                    cancelGroupEdit={cancelGroupEdit}
                                    applyEditMaterial={applyEditMaterial}
                                    removePathFromGroups={removePathFromGroups}
                                    simplified={simplified}
                                    onSelectAll={() =>
                                        selectAllPaths(
                                            shapesSvg?.paths.length ?? 0,
                                        )
                                    }
                                />
                            </Section>
                        )}
                        {/* Stud hardware + fixings — shown whenever any path is
                            rendered as stood off (via the default or an explicit
                            override). Stand-off appearance (thickness / distance
                            / colour) lives with the default material above; this
                            section is the procurement + fixing-hole spec, a
                            single global set applied across every standoff path
                            so the shop configures the diameter / density once. */}
                        {/* Production-only fixing/procurement spec — hidden in the
                            public studio (`simplified`); the shop sets these. */}
                        {!simplified && anyStandoffPath && (
                            <Section
                                title="Stand-off & fixings"
                                defaultOpen={false}
                            >
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
                                                className="mt-0.5 w-full rounded border border-neutral-300 px-1.5 py-1 text-xs focus:border-[var(--accent)] focus:outline-none"
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
                                            className="mt-0.5 w-full rounded border border-neutral-300 px-1.5 py-1 text-xs focus:border-[var(--accent)] focus:outline-none"
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
                                            className="mt-0.5 w-full rounded border border-neutral-300 px-1.5 py-1 text-xs focus:border-[var(--accent)] focus:outline-none"
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
                        {!simplified && hasArtwork && (
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

            {/* Public-studio upload gate — finish first, then the artwork
                lands already made the way the customer chose. */}
            {pendingUpload && (
                <UploadFinishModal
                    upload={pendingUpload}
                    onCancel={() => setPendingUpload(null)}
                    onConfirm={confirmPendingUpload}
                />
            )}
        </div>
    );
}
