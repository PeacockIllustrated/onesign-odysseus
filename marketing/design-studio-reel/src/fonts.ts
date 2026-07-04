import { continueRender, delayRender, staticFile } from 'remotion';

// Local display faces bundled under public/fonts. Loaded via the FontFace API
// with delayRender so headless rendering waits until they're ready.
//
// IMPORTANT: delayRender() must be called *during a render*, not at module
// eval time (that throws at webpack startup on `remotion render`). So this is a
// guarded function called once from a component body, not module-scope code.
const FACES: Array<{ family: string; file: string; weight: string }> = [
    { family: 'Archivo Black', file: 'fonts/ArchivoBlack.woff2', weight: '900' },
    { family: 'Anton', file: 'fonts/Anton.woff2', weight: '400' },
    { family: 'Archivo', file: 'fonts/Archivo.woff2', weight: '800 900' },
];

let started = false;

export function ensureFonts(): void {
    if (started) return;
    if (typeof document === 'undefined' || typeof FontFace === 'undefined') return;
    started = true;
    FACES.forEach(({ family, file, weight }) => {
        const handle = delayRender(`font:${family}`);
        const face = new FontFace(
            family,
            `url(${staticFile(file)}) format('woff2')`,
            { weight },
        );
        face
            .load()
            .then((f) => {
                document.fonts.add(f);
                continueRender(handle);
            })
            .catch(() => continueRender(handle));
    });
}
