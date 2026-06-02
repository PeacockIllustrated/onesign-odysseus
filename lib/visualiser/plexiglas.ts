/**
 * PLEXIGLAS® GS colour library (Evonik / Röhm cast acrylic) — the second
 * acrylic range Onesign stocks, alongside Perspex (see acrylic.ts).
 *
 * Codes follow Evonik's GS system: a colour-family digit, then a finish letter
 * — C = transparent (tint, backlights coloured), H = translucent/opaque, WH =
 * white/opal — then two digits (e.g. "Rot 3H15", "Creme 1H02", "Weiß WH01").
 * Names are German (as etched on the fan deck) with the English in brackets so
 * the picker search matches either.
 *
 * Codes + light-transmission notes are from the official Evonik / distributor
 * GS colour listings (researched 2026). Evonik publishes NO RGB, so every `hex`
 * is a hand-set sRGB APPROXIMATION for preview only — confirm against the fan.
 *
 * Sources: plexiglas.de, distributor charts (kehrenp.de, thyssenkrupp-plastics,
 * transparentdesign.at).
 */

import type { AcrylicColour } from './acrylic';

const RAW: Array<Omit<AcrylicColour, 'brand'>> = [
    // --- White / Opal (WH — diffusing, for illuminated push-through) ---
    { name: 'White / Weiß (opal, opaque)', code: 'WH01', hex: '#f1f1ec', finish: 'opal' },
    { name: 'White / Weiß (opal 24%)', code: 'WH73', hex: '#eeeee8', finish: 'opal' },
    { name: 'White / Weiß (opal 45%)', code: 'WH02', hex: '#f4f4f0', finish: 'opal' },
    { name: 'White / Weiß (opal 68%)', code: 'WH10', hex: '#f7f7f3', finish: 'opal' },
    { name: 'White / Weiß (opal 90%)', code: 'WH017', hex: '#fafaf6', finish: 'opal' },
    { name: 'Cream / Creme', code: '1H02', hex: '#f3e7c8', finish: 'opal' },

    // --- Clear ---
    { name: 'Clear / Transparent', code: '0F00', hex: '#e9f2f5', finish: 'clear' },

    // --- Transparent tints (C — colour transmits when backlit) ---
    { name: 'Yellow / Gelb (tint)', code: '1C33', hex: '#f2c200', finish: 'tinted' },
    { name: 'Orange (tint)', code: '2C04', hex: '#e8761c', finish: 'tinted' },
    { name: 'Red / Rot (tint)', code: '3C01', hex: '#cc1f2b', finish: 'tinted' },
    { name: 'Blue / Blau (tint, light)', code: '5C18', hex: '#1f8fc4', finish: 'tinted' },
    { name: 'Blue / Blau (tint, deep)', code: '5C01', hex: '#0b2f7a', finish: 'tinted' },
    { name: 'Green / Grün (tint)', code: '6C77', hex: '#3aa64a', finish: 'tinted' },
    { name: 'Brown / Braun (tint)', code: '8C01', hex: '#6a4326', finish: 'tinted' },
    { name: 'Umbra / Grey (tint)', code: '7C22', hex: '#6b6258', finish: 'tinted' },
    { name: 'Grey / Grau (tint)', code: '7C14', hex: '#8a8d8a', finish: 'tinted' },

    // --- Translucent / opaque (H) + solid ---
    { name: 'Yellow / Gelb', code: '1H01', hex: '#f4c200', finish: 'solid' },
    { name: 'Yellow / Gelb (light)', code: '1H14', hex: '#f6cf3a', finish: 'solid' },
    { name: 'Yellow / Gelb (deep)', code: '1H20', hex: '#e0a800', finish: 'solid' },
    { name: 'Orange', code: '2H02', hex: '#e8631c', finish: 'solid' },
    { name: 'Red / Rot', code: '3H15', hex: '#d11f2a', finish: 'solid' },
    { name: 'Red / Rot (10%)', code: '3H00', hex: '#c01f2a', finish: 'solid' },
    { name: 'Red / Rot (deep)', code: '3H25', hex: '#a8121f', finish: 'solid' },
    { name: 'Red / Rot (darkest)', code: '3H67', hex: '#8e1620', finish: 'solid' },
    { name: 'Green / Grün', code: '6H01', hex: '#0f6b34', finish: 'solid' },
    { name: 'Green / Grün (light)', code: '6H02', hex: '#1f8a46', finish: 'solid' },
    { name: 'Blue / Blau (deep)', code: '5H01', hex: '#13235f', finish: 'solid' },
    { name: 'Blue / Blau', code: '5H21', hex: '#1a4e9c', finish: 'solid' },
    { name: 'Blue / Blau (mid)', code: '5H22', hex: '#16407f', finish: 'solid' },
    { name: 'Grey / Grau', code: '7H32', hex: '#3a3f42', finish: 'solid' },
    { name: 'Black / Schwarz', code: '9H01', hex: '#141619', finish: 'solid' },
];

export const PLEXIGLAS_COLOURS: AcrylicColour[] = RAW.map((c) => ({
    ...c,
    brand: 'Plexiglas' as const,
}));
