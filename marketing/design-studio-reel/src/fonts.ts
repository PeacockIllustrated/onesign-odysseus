import { continueRender, delayRender, staticFile } from 'remotion';

// Local display faces bundled under public/fonts, loaded via FontFace with
// delayRender (called once from a component body, never at module eval).
//
// GILROY: the brand's font (commercial — not fetchable in this sandbox). Drop
// `public/fonts/Gilroy-ExtraBold.woff2` in and it's used automatically; until
// then the `Gilroy` load 404s (caught) and the CSS stack falls back to
// Montserrat, the closest free geometric match.
const FACES: Array<{ family: string; file: string; weight: string }> = [
    { family: 'Gilroy', file: 'fonts/Gilroy-ExtraBold.woff2', weight: '800 900' },
    { family: 'Montserrat', file: 'fonts/Montserrat-800.woff2', weight: '800 900' },
    { family: 'Montserrat', file: 'fonts/Montserrat-600.woff2', weight: '500 700' },
    { family: 'Anton', file: 'fonts/Anton.woff2', weight: '400' },
    { family: 'Archivo Black', file: 'fonts/ArchivoBlack.woff2', weight: '900' },
];

let started = false;

export function ensureFonts(): void {
    if (started) return;
    if (typeof document === 'undefined' || typeof FontFace === 'undefined') return;
    started = true;
    FACES.forEach(({ family, file, weight }) => {
        const handle = delayRender(`font:${family}:${weight}`);
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
