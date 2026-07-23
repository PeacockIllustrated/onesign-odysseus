import { describe, it, expect } from 'vitest';
import {
    toHex6,
    pathColour,
    clusterByColour,
    matchedStockColour,
} from './upload-finish';
import type { FlatPath } from './types';

function path(stroke?: string): FlatPath {
    return {
        points: [
            [0, 0],
            [10, 0],
            [10, 10],
        ],
        closed: true,
        stroke,
    };
}

describe('toHex6', () => {
    it('passes through 6-digit hex, lowercased', () => {
        expect(toHex6('#FF2D95')).toBe('#ff2d95');
    });
    it('expands 3-digit hex', () => {
        expect(toHex6('#f0a')).toBe('#ff00aa');
    });
    it('parses rgb()', () => {
        expect(toHex6('rgb(255, 45, 149)')).toBe('#ff2d95');
    });
    it('maps common named colours', () => {
        expect(toHex6('Red')).toBe('#ff0000');
        expect(toHex6('black')).toBe('#000000');
    });
    it('returns null for unreadable values', () => {
        expect(toHex6('url(#grad)')).toBeNull();
        expect(toHex6(undefined)).toBeNull();
        expect(toHex6('')).toBeNull();
    });
});

describe('pathColour', () => {
    it('defaults to black when the importer resolved no colour', () => {
        expect(pathColour(path(undefined))).toBe('#000000');
    });
    it('normalises the resolved colour', () => {
        expect(pathColour(path('RGB(0, 89, 168)'))).toBe('#0059a8');
    });
});

describe('clusterByColour', () => {
    it('groups indices by colour, first-seen order, equivalent forms merged', () => {
        const paths = [
            path('#cc1b2a'), // red
            path('#0a59a8'), // blue
            path('#CC1B2A'), // red again, different case
            path('rgb(204, 27, 42)'), // red again, rgb form
            path(undefined), // black default
        ];
        const clusters = clusterByColour(paths, [0, 1, 2, 3, 4]);
        expect(clusters).toEqual([
            { colour: '#cc1b2a', indices: [0, 2, 3] },
            { colour: '#0a59a8', indices: [1] },
            { colour: '#000000', indices: [4] },
        ]);
    });

    it('only clusters the given indices and skips missing paths', () => {
        const paths = [path('#111111'), path('#222222'), path('#111111')];
        const clusters = clusterByColour(paths, [0, 2, 9]);
        expect(clusters).toEqual([
            { colour: '#111111', indices: [0, 2] },
        ]);
    });
});

describe('matchedStockColour', () => {
    it('snaps acrylic-based finishes to a real stock sheet', () => {
        // Perspex Red 4401 is #cc1b2a — a near-red input should land on a
        // library hex, not the raw artwork colour.
        const hex = matchedStockColour('standoff', '#c81e2c');
        expect(hex).toMatch(/^#[0-9a-f]{6}$/);
        expect(hex).not.toBe('#c81e2c');
    });
    it('solid vinyl snaps to a RAL reference', () => {
        const hex = matchedStockColour('vinyl', '#0a59a8', {
            printFullColor: false,
        });
        expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    });
    it('printed full-colour vinyl carries no spot colour', () => {
        expect(
            matchedStockColour('vinyl', '#0a59a8', { printFullColor: true }),
        ).toBeUndefined();
        expect(matchedStockColour('vinyl', '#0a59a8')).toBeUndefined();
    });
    it('backlight keeps the artwork colour as the glow', () => {
        expect(matchedStockColour('backlight', '#ff2d95')).toBe('#ff2d95');
    });
    it('cut and solid carry no colour', () => {
        expect(matchedStockColour('cut', '#ff2d95')).toBeUndefined();
        expect(matchedStockColour('solid', '#ff2d95')).toBeUndefined();
    });
});
