/**
 * Acrylic colour library — the sheet colours we actually stock / order, so a
 * face-stuck acrylic or push-through letter is specced against a real product
 * rather than an arbitrary hex. The visualiser picks the group colour from
 * here; the NAME/CODE is what goes on the production docs.
 *
 * ⚠️ STARTER LIST — replace these with Onesign's real acrylic range (the
 * supplier's colour names/codes + the closest sRGB hex). Names + finish drive
 * the spec; hex drives the on-screen preview. `finish` distinguishes opal
 * (diffusing, for illuminated push-through) from solid/gloss face material.
 */

export type AcrylicFinish = 'opal' | 'solid' | 'clear' | 'tinted';

export interface AcrylicColour {
    name: string;
    /** Optional supplier/range code, e.g. a Perspex/Plexiglas number. */
    code?: string;
    hex: string;
    finish: AcrylicFinish;
}

export const ACRYLIC_COLOURS: AcrylicColour[] = [
    { name: 'Opal white', code: 'Opal', hex: '#f5f5f0', finish: 'opal' },
    { name: 'Snow white', hex: '#ffffff', finish: 'solid' },
    { name: 'Black', hex: '#15171a', finish: 'solid' },
    { name: 'Traffic red', hex: '#c8102e', finish: 'solid' },
    { name: 'Bright red', hex: '#e3262f', finish: 'solid' },
    { name: 'Orange', hex: '#ff6a13', finish: 'solid' },
    { name: 'Amber', hex: '#ffb000', finish: 'tinted' },
    { name: 'Golden yellow', hex: '#ffc20e', finish: 'solid' },
    { name: 'Light blue', hex: '#0093d0', finish: 'solid' },
    { name: 'Mid blue', hex: '#0061af', finish: 'solid' },
    { name: 'Royal blue', hex: '#10069f', finish: 'solid' },
    { name: 'Green', hex: '#00843d', finish: 'solid' },
    { name: 'Light green', hex: '#43b02a', finish: 'solid' },
    { name: 'Pink', hex: '#e93cac', finish: 'solid' },
    { name: 'Purple', hex: '#5f259f', finish: 'solid' },
    { name: 'Grey', hex: '#7c878e', finish: 'solid' },
    { name: 'Warm white (opal)', code: 'Opal warm', hex: '#fbf3df', finish: 'opal' },
    { name: 'Clear', hex: '#e8f4f8', finish: 'clear' },
];

function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    return [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16),
    ];
}

/** Exact (case-insensitive) hex match in the library, or null. */
export function acrylicByHex(hex: string | undefined | null): AcrylicColour | null {
    if (!hex) return null;
    const norm = hex.trim().toLowerCase();
    return ACRYLIC_COLOURS.find((c) => c.hex.toLowerCase() === norm) ?? null;
}

/** Nearest library colour to an arbitrary hex (RGB distance) + the distance. */
export function nearestAcrylic(
    hex: string,
): { colour: AcrylicColour; dist: number } {
    const [r, g, b] = hexToRgb(hex);
    let best = ACRYLIC_COLOURS[0];
    let bestD = Infinity;
    for (const c of ACRYLIC_COLOURS) {
        const [cr, cg, cb] = hexToRgb(c.hex);
        const d = (cr - r) ** 2 + (cg - g) ** 2 + (cb - b) ** 2;
        if (d < bestD) {
            bestD = d;
            best = c;
        }
    }
    return { colour: best, dist: Math.sqrt(bestD) };
}
