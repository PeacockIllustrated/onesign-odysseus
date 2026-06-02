/**
 * Acrylic colour library — Onesign stocks Perspex® cast acrylic, so the
 * face-stuck / push-through colours are specced against the real Perspex range
 * (the CODE is what's ordered, e.g. "Red 4401", "Opal 030").
 *
 * Codes + names are from the official Perspex® / 3A Composites cast-acrylic
 * range (Clear & Frost, transparent Tints, Opal/White, Solid & Translucent).
 * Perspex does NOT publish RGB/hex (screen colour never matches the sheet), so
 * every `hex` here is a hand-set sRGB APPROXIMATION for the on-screen preview
 * only — confirm the actual shade against the physical fan deck. `finish`
 * distinguishes clear / frost / tint (transparent, backlights coloured) /
 * opal (diffusing white, for illuminated push-through) / solid.
 *
 * Sources: perspex.co.uk + display.3acomposites.com cast-acrylic colour pages
 * (researched 2026); see also theplasticshop.co.uk Perspex colour swatch.
 */

export type AcrylicFinish = 'opal' | 'solid' | 'clear' | 'tinted';

export interface AcrylicColour {
    name: string;
    /** Perspex range code, e.g. '4401', '030', '000'. */
    code?: string;
    hex: string;
    finish: AcrylicFinish;
}

export const ACRYLIC_COLOURS: AcrylicColour[] = [
    // --- Clear & Frost ---
    { name: 'Clear', code: '000', hex: '#e9f2f5', finish: 'clear' },
    { name: 'Clear Silk (frost)', code: '000', hex: '#dde5e6', finish: 'clear' },

    // --- Opal / White (diffusing — illuminated push-through) ---
    { name: 'Opal white', code: '030', hex: '#f3f3ee', finish: 'opal' },
    { name: 'Opal', code: '040', hex: '#eef0eb', finish: 'opal' },
    { name: 'Opal', code: '050', hex: '#f6f5f0', finish: 'opal' },
    { name: 'Opal', code: '028', hex: '#eae9e3', finish: 'opal' },
    { name: 'Opal', code: '069', hex: '#f0efe8', finish: 'opal' },
    { name: 'Opal (constant transmission)', code: '1T04', hex: '#f2f2ec', finish: 'opal' },
    { name: 'Opal Spectrum LED', code: '1TL2', hex: '#f7f6f1', finish: 'opal' },

    // --- Transparent tints (colour transmits when backlit) ---
    { name: 'Red (tint)', code: '4401', hex: '#cc1b2a', finish: 'tinted' },
    { name: 'Yellow (tint)', code: '2202', hex: '#f3c200', finish: 'tinted' },
    { name: 'Amber (tint)', code: '300', hex: '#e8920c', finish: 'tinted' },
    { name: 'Blue (tint)', code: '7703', hex: '#0a59a8', finish: 'tinted' },
    { name: 'Blue (tint)', code: '7704', hex: '#0b3f8c', finish: 'tinted' },
    { name: 'Green (tint)', code: '6T21', hex: '#0a8a4a', finish: 'tinted' },
    { name: 'Green (tint)', code: '6600', hex: '#1b7a3a', finish: 'tinted' },

    // --- Solid & translucent ---
    { name: 'Ivory', code: '133', hex: '#efe7d2', finish: 'solid' },
    { name: 'Cream', code: '128', hex: '#f0e2c0', finish: 'solid' },
    { name: 'Yellow', code: '229', hex: '#f5c211', finish: 'solid' },
    { name: 'Yellow', code: '260', hex: '#f0b400', finish: 'solid' },
    { name: 'Yellow', code: '261', hex: '#f7d000', finish: 'solid' },
    { name: 'Yellow', code: '2252', hex: '#f3cf3a', finish: 'solid' },
    { name: 'Orange', code: '363', hex: '#e8631c', finish: 'solid' },
    { name: 'Red', code: '431', hex: '#c01f2a', finish: 'solid' },
    { name: 'Red', code: '440', hex: '#a51122', finish: 'solid' },
    { name: 'Red', code: '4403', hex: '#9e1b2a', finish: 'solid' },
    { name: 'Red', code: '4415', hex: '#d22030', finish: 'solid' },
    { name: 'Brown', code: '543', hex: '#5a3a26', finish: 'solid' },
    { name: 'Green', code: '650', hex: '#1f7a3e', finish: 'solid' },
    { name: 'Green', code: '692', hex: '#0f5a32', finish: 'solid' },
    { name: 'Green', code: '6205', hex: '#2f8f4f', finish: 'solid' },
    { name: 'Blue', code: '727', hex: '#1f4e9c', finish: 'solid' },
    { name: 'Blue', code: '743', hex: '#163e86', finish: 'solid' },
    { name: 'Blue', code: '744', hex: '#0e2f6b', finish: 'solid' },
    { name: 'Blue', code: '750', hex: '#1a5fa6', finish: 'solid' },
    { name: 'Blue', code: '751', hex: '#0f74b4', finish: 'solid' },
    { name: 'Violet', code: '886', hex: '#5e2d83', finish: 'solid' },
    { name: 'Grey', code: '9981', hex: '#7c8285', finish: 'solid' },
    { name: 'Black', code: '962', hex: '#15171a', finish: 'solid' },
    { name: 'Black (constant transmission)', code: '9T30', hex: '#1b1d20', finish: 'solid' },
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
