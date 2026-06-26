import { describe, expect, it } from 'vitest';
import { specToBlocks } from './geometry';
import { DEFAULT_TEMPLATE, type StorefrontSpec } from './types';

const blocksByName = (spec: StorefrontSpec) => {
    const map = new Map(specToBlocks(spec).map((b) => [b.name, b]));
    return map;
};

describe('specToBlocks (default blue template)', () => {
    it('produces the expected named blocks', () => {
        const m = blocksByName(DEFAULT_TEMPLATE);
        for (const name of [
            'Back_Wall',
            'Fascia_Surround',
            'Fascia_SignMount',
            'Keyline_Top',
            'Left_Jamb',
            'Right_Pilaster',
            'Mid_Post',
            'Transom',
            'Door_BottomPanel',
            'Door_Glass',
            'Door_Handle',
            'Stallriser',
            'Window_Glass',
        ]) {
            expect(m.has(name)).toBe(true);
        }
    });

    it('places the empty sign mount inside the fascia banner', () => {
        const m = blocksByName(DEFAULT_TEMPLATE);
        const mount = m.get('Fascia_SignMount')!;
        const shopTop = DEFAULT_TEMPLATE.heightMm - DEFAULT_TEMPLATE.fasciaHeightMm;
        expect(mount.material).toBe('signField');
        expect(mount.z).toBeGreaterThan(shopTop); // sits within the fascia zone
        expect(mount.z + mount.h).toBeLessThanOrEqual(DEFAULT_TEMPLATE.heightMm);
    });

    it('builds an N-1 × M-1 interior mullion grid from cols/rows', () => {
        const m = blocksByName(DEFAULT_TEMPLATE); // 3 cols, 5 rows
        const verticals = [...m.keys()].filter((k) => k.startsWith('Door_Mullion_V'));
        const horizontals = [...m.keys()].filter((k) => k.startsWith('Door_Mullion_H'));
        expect(verticals).toHaveLength(2); // cols - 1
        expect(horizontals).toHaveLength(4); // rows - 1
    });

    it('keeps the mid-post exactly between the door and the window', () => {
        const m = blocksByName(DEFAULT_TEMPLATE);
        const post = m.get('Mid_Post')!;
        const doorRight = DEFAULT_TEMPLATE.door.xMm + DEFAULT_TEMPLATE.door.widthMm;
        expect(post.x).toBe(doorRight);
        expect(post.x + post.w).toBe(DEFAULT_TEMPLATE.window.xMm);
    });

    it('never extends a block beyond the frontage width/height', () => {
        for (const b of specToBlocks(DEFAULT_TEMPLATE)) {
            expect(b.x + b.w).toBeLessThanOrEqual(DEFAULT_TEMPLATE.widthMm + 0.01);
            expect(b.z + b.h).toBeLessThanOrEqual(DEFAULT_TEMPLATE.heightMm + 0.01);
        }
    });

    it('scales the door grid count with cols/rows', () => {
        const spec: StorefrontSpec = {
            ...DEFAULT_TEMPLATE,
            door: { ...DEFAULT_TEMPLATE.door, cols: 2, rows: 3 },
        };
        const m = blocksByName(spec);
        expect([...m.keys()].filter((k) => k.startsWith('Door_Mullion_V'))).toHaveLength(1);
        expect([...m.keys()].filter((k) => k.startsWith('Door_Mullion_H'))).toHaveLength(2);
    });
});
