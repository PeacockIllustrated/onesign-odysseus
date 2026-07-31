import { continueRender, delayRender, staticFile } from 'remotion';

// Bundled brand face, loaded via FontFace with delayRender — called ONCE from a
// component body, never at module scope (module-scope delayRender crashes the
// render at webpack startup). Bebas Neue is bundled as woff2 (Google Fonts,
// gstatic — the only webfont host reachable in this sandbox).
// Bebas Neue is the whole type system — the real Pro cuts supplied by the brand:
// Book (light headline/sub line), Regular (logo tagline), Bold (heavy line).
const FACES: Array<{ family: string; file: string; weight: string }> = [
    { family: 'Bebas Neue Book', file: 'fonts/BebasNeueBook.woff2', weight: '400' },
    { family: 'Bebas Neue', file: 'fonts/BebasNeueRegular.woff2', weight: '400' },
    { family: 'Bebas Neue Bold', file: 'fonts/BebasNeueBold.woff2', weight: '400 700' },
];

let started = false;

export function ensureFonts(): void {
    if (started) return;
    if (typeof document === 'undefined' || typeof FontFace === 'undefined') return;
    started = true;
    FACES.forEach(({ family, file, weight }) => {
        const handle = delayRender(`font:${family}`);
        const face = new FontFace(family, `url(${staticFile(file)}) format('woff2')`, {
            weight,
        });
        face
            .load()
            .then((f) => {
                document.fonts.add(f);
                continueRender(handle);
            })
            .catch(() => continueRender(handle));
    });
}
