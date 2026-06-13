/**
 * LED module catalogue + spacing resolver.
 *
 * Module spacing isn't a fixed millimetres-per-stroke — it's a lookup keyed on
 * (module × can depth × face translucency): for the same module, on-centre
 * spacing widens with can depth and tightens behind darker / perforated faces.
 * This is the research's highest-value accuracy upgrade.
 *
 * Seeded from the SloanLED Channel-Letter Density Guidelines + HanleyLED
 * fundamentals cited in the LED research. Values are sensible defaults to ship
 * and override per datasheet — spacing assumes a standard ~translucent face;
 * the face factor tightens it for dark or perforated vinyl. Pure data, so the
 * resolver is Vitest-covered.
 */

export type FaceType = 'standard' | 'dark' | 'perforated';

/** On-centre + row spacing published for one can depth. */
export interface ModuleDepth {
    depthMm: number;
    onCentreMm: number;
    rowMm: number;
}

export interface LedModuleSpec {
    id: string;
    name: string;
    voltageV: 12 | 24;
    wattsPerModule: number;
    cascadeLimit: number;
    /** Depth → spacing points (sorted; interpolated between). */
    depths: ModuleDepth[];
    note?: string;
}

/** Spacing multiplier by face translucency — darker/perforated → denser. */
export const FACE_FACTORS: Record<FaceType, number> = {
    standard: 1,
    dark: 0.8,
    perforated: 0.65,
};

export const FACE_LABELS: Record<FaceType, string> = {
    standard: 'Standard / clear',
    dark: 'Dark vinyl',
    perforated: 'Perforated',
};

export const LED_MODULE_CATALOG: LedModuleSpec[] = [
    {
        id: 'prism12',
        name: 'SloanLED Prism12 (12 V)',
        voltageV: 12,
        wattsPerModule: 0.92,
        cascadeLimit: 40,
        depths: [
            { depthMm: 75, onCentreMm: 250, rowMm: 250 },
            { depthMm: 100, onCentreMm: 300, rowMm: 300 },
        ],
    },
    {
        id: 'prism24',
        name: 'SloanLED Prism24 (24 V)',
        voltageV: 24,
        wattsPerModule: 0.86,
        cascadeLimit: 80,
        depths: [
            { depthMm: 75, onCentreMm: 175, rowMm: 175 },
            { depthMm: 100, onCentreMm: 250, rowMm: 250 },
        ],
    },
    {
        id: 'mini12',
        name: 'SloanLED Mini (12 V)',
        voltageV: 12,
        wattsPerModule: 0.4,
        cascadeLimit: 40,
        depths: [
            { depthMm: 50, onCentreMm: 125, rowMm: 125 },
            { depthMm: 75, onCentreMm: 160, rowMm: 160 },
            { depthMm: 100, onCentreMm: 200, rowMm: 200 },
        ],
        note: 'small letters / shallow cans',
    },
    {
        id: 'vl5',
        name: 'SloanLED VL5 (12 V, cabinet)',
        voltageV: 12,
        wattsPerModule: 0.96,
        cascadeLimit: 40,
        depths: [
            { depthMm: 50, onCentreMm: 175, rowMm: 250 },
            { depthMm: 75, onCentreMm: 250, rowMm: 400 },
            { depthMm: 125, onCentreMm: 250, rowMm: 400 },
        ],
        note: 'light-box / cabinet — separate row spacing',
    },
    {
        id: 'ho12',
        name: 'SloanLED HO / Super HO (12 V)',
        voltageV: 12,
        wattsPerModule: 1.3,
        cascadeLimit: 30,
        depths: [
            { depthMm: 100, onCentreMm: 300, rowMm: 300 },
            { depthMm: 150, onCentreMm: 380, rowMm: 430 },
            { depthMm: 200, onCentreMm: 430, rowMm: 430 },
        ],
        note: 'large cabinets / deep cans',
    },
    {
        id: 'phoenix-pe2',
        name: 'HanleyLED PhoenixNRG PE-2 (12 V)',
        voltageV: 12,
        wattsPerModule: 0.62,
        cascadeLimit: 40,
        depths: [
            { depthMm: 75, onCentreMm: 250, rowMm: 250 },
            { depthMm: 100, onCentreMm: 300, rowMm: 300 },
        ],
    },
    {
        id: 'phoenix-pn2',
        name: 'HanleyLED PhoenixNRG PN-2 (24 V)',
        voltageV: 24,
        wattsPerModule: 0.62,
        cascadeLimit: 80,
        depths: [
            { depthMm: 75, onCentreMm: 300, rowMm: 300 },
            { depthMm: 100, onCentreMm: 350, rowMm: 350 },
        ],
    },
];

export interface ResolvedSpacing {
    modulePitchMm: number;
    rowPitchMm: number;
    wattsPerModule: number;
    cascadeLimit: number;
    voltageV: 12 | 24;
}

export function findModule(id: string | null | undefined): LedModuleSpec | null {
    if (!id) return null;
    return LED_MODULE_CATALOG.find((m) => m.id === id) ?? null;
}

/** Resolve on-centre + row spacing for a module at a can depth + face, with the
 *  module's watts / cascade / voltage. Interpolates between published depths,
 *  clamping at the ends; the face factor tightens spacing for darker faces. */
export function resolveSpacing(m: LedModuleSpec, depthMm: number, face: FaceType): ResolvedSpacing {
    const ds = [...m.depths].sort((a, b) => a.depthMm - b.depthMm);
    let onCentre: number;
    let row: number;
    if (depthMm <= ds[0].depthMm) {
        onCentre = ds[0].onCentreMm;
        row = ds[0].rowMm;
    } else if (depthMm >= ds[ds.length - 1].depthMm) {
        onCentre = ds[ds.length - 1].onCentreMm;
        row = ds[ds.length - 1].rowMm;
    } else {
        let i = 0;
        while (i < ds.length - 1 && ds[i + 1].depthMm < depthMm) i++;
        const a = ds[i];
        const b = ds[i + 1];
        const t = (depthMm - a.depthMm) / (b.depthMm - a.depthMm || 1);
        onCentre = a.onCentreMm + (b.onCentreMm - a.onCentreMm) * t;
        row = a.rowMm + (b.rowMm - a.rowMm) * t;
    }
    const f = FACE_FACTORS[face] ?? 1;
    return {
        modulePitchMm: Math.round(onCentre * f),
        rowPitchMm: Math.round(row * f),
        wattsPerModule: m.wattsPerModule,
        cascadeLimit: m.cascadeLimit,
        voltageV: m.voltageV,
    };
}
