// Shared visual language for the reel — a 1:1 lift of the real Onesign Studio
// tokens (components/studio/tokens.ts) so the film is brand-exact.

export const BRAND = {
    accent: '#4e7e8c', // steel teal
    accentDark: '#3a5f6a',
    accentGlow: '#9ed0dc', // brightened teal for HUD glints / lit states
    light: '#e8f0f3',
    onAccent: '#0c1114',
    ink: '#1a1f23', // dark UI background
    white: '#ffffff',
} as const;

/** The cinematic stage backdrop — matches stageBackground(night) exactly. */
export function stageBackground(night: boolean): string {
    return night
        ? 'radial-gradient(120% 90% at 50% 0%, #0a1014 0%, #04070a 60%, #020405 100%)'
        : 'radial-gradient(120% 90% at 50% 0%, #1a242a 0%, #0d1418 55%, #080c0f 100%)';
}

// Vertical reel canvas.
export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

// A shared system font stack (Geist-like) — the app uses Geist Sans; the
// closest always-available stack keeps the type feeling native without a
// webfont fetch during render.
export const FONT =
    "'Geist', 'Inter', -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
export const MONO =
    "'Geist Mono', ui-monospace, 'SF Mono', 'Roboto Mono', Menlo, monospace";

// Bold display faces (bundled under public/fonts, loaded in src/fonts.ts).
// CONDENSED (Anton) is the tall, punchy caption face; DISPLAY (Archivo Black)
// is the heavy grotesque for brand/hero titles.
export const CONDENSED =
    "'Anton', 'Oswald', 'Arial Narrow', 'Impact', sans-serif";
export const DISPLAY =
    "'Archivo Black', 'Archivo', 'Arial Black', system-ui, sans-serif";

// Standard easings (cubic-bezier control points) used across scenes for a
// coherent motion signature — confident, springy-but-controlled.
export const EASE = {
    // Decisive settle — the house easing for entrances.
    out: [0.16, 1, 0.3, 1] as [number, number, number, number],
    // Smooth both-ends — for camera drifts and cross-dissolves.
    inOut: [0.65, 0, 0.35, 1] as [number, number, number, number],
    // Slight overshoot — for chips, ticks, pop-ins.
    pop: [0.34, 1.56, 0.64, 1] as [number, number, number, number],
} as const;
