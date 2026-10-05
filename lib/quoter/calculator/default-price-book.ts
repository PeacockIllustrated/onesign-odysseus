/**
 * The price book the calculator ships with: Mak's spreadsheet figures, as they
 * stood in his standalone tool (price book v1.1), converted to pence.
 *
 * The pound figures are kept exactly as he supplied them and converted here,
 * so they can be checked line for line against his file. Letter and
 * illumination prices carry fractions of a penny in the original (e.g.
 * £63.404); they round to the nearest penny per letter.
 *
 * This is only the starting point. The live book is whatever was last saved in
 * `calculator_price_books`; these figures are used until the first save, and
 * by "Reset to Mak's figures" in the price book editor.
 */

import type { PriceBook } from './types';
import { SettingsSchema } from './types';

const p = (pounds: number) => Math.round(pounds * 100);
const ps = (pounds: number[]) => pounds.map(p);

export const DEFAULT_HEIGHTS = [
    50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800, 850, 900, 950,
    1000,
];

export function defaultPriceBook(): PriceBook {
    return {
        heights: DEFAULT_HEIGHTS.slice(),
        sheets: [
            { id: 'alu-2440', material: 'Aluminium 2.5mm', w: 2440, h: 1220, price_pence: p(61), use: 'panel', active: true },
            { id: 'alu-3000', material: 'Aluminium 2.5mm', w: 3000, h: 1500, price_pence: p(87), use: 'panel', active: true },
            { id: 'dibond-2440', material: 'Dibond 3mm', w: 2440, h: 1220, price_pence: p(23), use: 'panel', active: false },
            { id: 'opal5-2440', material: 'Opal 5mm', w: 2440, h: 1220, price_pence: p(88), use: 'aperture', active: true },
            { id: 'opal10-2440', material: 'Opal 10mm', w: 2440, h: 1220, price_pence: p(120), use: 'aperture', active: true },
        ],
        panel_finishes: [
            { id: 'none', name: 'None', cost_per_m2_pence: 0 },
            { id: 'powder', name: 'Powder coating', cost_per_m2_pence: p(25.4) },
        ],
        labour: [
            { id: 'router', name: 'Router', rate_pence: p(94), is_fabrication: false },
            { id: 'fabrication', name: 'Fabrication', rate_pence: p(65), is_fabrication: true },
            { id: 'assembly', name: 'Assembly', rate_pence: p(65), is_fabrication: false },
            { id: 'vinyl', name: 'Vinyl', rate_pence: p(90), is_fabrication: false },
            { id: 'print', name: 'Digital printing', rate_pence: p(90), is_fabrication: false },
        ],
        letter_types: [
            {
                id: 'fabricated',
                name: 'Fabricated',
                finishes: [
                    { id: 'unfinished', name: 'Unfinished', prices_pence: ps([58.3, 59.4, 60.5, 61.6, 63.8, 78.1, 80.3, 83.6, 92.4, 96.8, 105.05, 112.2, 119.35, 128.7, 135.85, 156.2, 164.45, 172.7, 180.95, 189.2]) },
                    { id: 'powder', name: 'Powder coated', prices_pence: ps([63.404, 67.936, 73.326, 75.636, 79.068, 94.908, 98.648, 104.192, 115.302, 123.046, 134.838, 144.254, 153.714, 165.638, 175.846, 197.802, 210.848, 221.804, 233.178, 244.156]) },
                    { id: 'wet-paint', name: 'Wet paint', prices_pence: ps([65.406, 70.07, 76.406, 79.134, 82.852, 99.088, 103.202, 109.406, 121, 129.602, 142.274, 152.262, 162.294, 174.9, 187.88, 213.224, 222.42, 234.124, 246.224, 255.706]) },
                ],
            },
            {
                id: 'komacel',
                name: 'Komacel',
                finishes: [
                    { id: 'unfinished', name: 'Unfinished', prices_pence: ps([17.05, 20.878, 24.706, 28.556, 35.266, 41.998, 48.708, 59.84, 65.78, 89.32, 101.86, 114.4, 134.2, 154, 173.8, 193.6, 213.4, 233.2, 253, 272.8]) },
                    { id: 'face-fitted', name: 'Face fitted', prices_pence: ps([20.68, 28.138, 35.002, 41.888, 54.164, 66.484, 78.76, 95.48, 111.474, 145.09, 167.134, 190.3, 226.05, 261.8, 297, 332.2, 367.664, 403.15, 438.614, 474.1]) },
                    { id: 'rim-return', name: 'Rim and return', prices_pence: ps([23.98, 34.738, 44.902, 55.088, 70.664, 86.284, 101.86, 121.88, 141.174, 178.09, 203.434, 229.9, 268.95, 308, 346.5, 385, 423.764, 462.55, 501.314, 540.1]) },
                ],
            },
            {
                id: 'acrylic',
                name: 'Acrylic',
                finishes: [
                    { id: 'unfinished', name: 'Unfinished', prices_pence: ps([12.4, 15.184, 17.968, 20.768, 25.648, 30.544, 35.424, 43.52, 47.84, 64.96, 74.08, 83.2, 97.6, 112, 126.4, 140.8, 155.2, 169.6, 184, 198.4]) },
                    { id: 'face-fitted', name: 'Face fitted', prices_pence: ps([15.04, 20.464, 25.456, 30.464, 39.392, 48.352, 57.28, 69.44, 81.072, 105.52, 121.552, 138.4, 164.4, 190.4, 216, 241.6, 267.392, 293.2, 318.992, 344.8]) },
                    { id: 'rim-return', name: 'Rim and return', prices_pence: ps([17.44, 25.264, 32.656, 40.064, 51.392, 62.752, 74.08, 88.64, 102.672, 129.52, 147.952, 167.2, 195.6, 224, 252, 280, 308.192, 336.4, 364.592, 392.8]) },
                ],
            },
        ],
        illumination: {
            leds_per_letter: [2, 3, 5, 7, 9, 12, 14, 15, 17, 18, 20, 21, 28, 36, 43, 51, 54, 57, 59, 62],
            price_per_letter_pence: ps([9.43, 11.7, 14.76, 18.56, 21.72571429, 26.26285714, 31.12, 38.2, 46.79692308, 53.08, 60.95, 71.36, 86.88, 107.26, 133.88, 143.16, 183.64, 187.12, 189.44, 192.92]),
        },
        transformers: [
            { id: '20w', name: '20W', max_leds: 40, price_pence: p(28.88) },
            { id: '60w', name: '60W', max_leds: 120, price_pence: p(32.24) },
            { id: '100w', name: '100W', max_leds: 200, price_pence: p(50.82) },
            { id: '150w', name: '150W', max_leds: 300, price_pence: p(88.94) },
        ],
        settings: SettingsSchema.parse({}),
    };
}
