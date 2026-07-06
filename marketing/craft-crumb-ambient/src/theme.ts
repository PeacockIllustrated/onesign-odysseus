// Craft & Crumb visual language — pulled from the brand pack (RAL 9005 jet
// black fascia, white acrylic detail, warm coffee-brown accent, Bebas Neue).
// Artisan, warm, premium, minimal: monochrome + one warm accent.

export const CC = {
    // RAL 9005 'Jet Black' reads slightly warm on powder-coated aluminium.
    ink: '#0e0d0b',
    inkDeep: '#070605',
    // Warm off-white — the "5mm white acrylic detail", softer than pure white.
    cream: '#f4efe6',
    white: '#ffffff',
    // The coffee-brown accent from the logo (& and full-stop) + a lit tan glint.
    brown: '#995c28',
    brownLit: '#c98a4e',
    brownDeep: '#6f421c',
} as const;

// Menu screens are landscape displays — 16:9. (Switch to 1080×1920 for
// portrait screens; layouts use relative positioning so it's a small change.)
export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

// Bebas Neue is THE brand face (tall condensed all-caps). Loaded in fonts.ts
// from a bundled woff2; a condensed fallback stack keeps type on-brand if it
// somehow doesn't load.
export const BEBAS =
    "'Bebas Neue', 'Oswald', 'Anton', 'Arial Narrow', sans-serif";
// Tiny supporting text (rare) — a clean, quiet humanist sans.
export const SANS =
    "'Inter', -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

/** The warm, dim-café stage backdrop. A soft warm pool over near-black. */
export function stage(): string {
    return `radial-gradient(120% 100% at 50% 34%, #1b1512 0%, ${CC.ink} 52%, ${CC.inkDeep} 100%)`;
}

// House easings — slow, confident, nothing snappy (this is ambient).
export const EASE = {
    out: [0.16, 1, 0.3, 1] as [number, number, number, number],
    inOut: [0.65, 0, 0.35, 1] as [number, number, number, number],
    gentle: [0.4, 0, 0.2, 1] as [number, number, number, number],
} as const;

// ── colour helpers (accept #rrggbb and rgb(...) — mixers return rgb()) ──────
function clamp(n: number) {
    return Math.max(0, Math.min(255, Math.round(n)));
}
export function toRgb(color: string): [number, number, number] {
    const m = color.match(/rgba?\(([^)]+)\)/i);
    if (m) {
        const [r, g, b] = m[1].split(',').map((n) => parseFloat(n.trim()));
        return [r, g, b];
    }
    const h = color.replace('#', '');
    const v =
        h.length === 3
            ? h
                  .split('')
                  .map((c) => c + c)
                  .join('')
            : h;
    return [
        parseInt(v.slice(0, 2), 16),
        parseInt(v.slice(2, 4), 16),
        parseInt(v.slice(4, 6), 16),
    ];
}
export function withAlpha(color: string, a: number): string {
    const [r, g, b] = toRgb(color);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}
/** amt > 0 lightens toward white, < 0 darkens toward black. */
export function shade(color: string, amt: number): string {
    const [r, g, b] = toRgb(color);
    const t = amt < 0 ? 0 : 255;
    const p = Math.abs(amt);
    return `rgb(${clamp(r + (t - r) * p)}, ${clamp(g + (t - g) * p)}, ${clamp(b + (t - b) * p)})`;
}
