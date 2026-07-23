import { describe, it, expect, beforeEach } from 'vitest';
import { useVisualiser } from './store';

// Exercise the group actions the public upload modal + finish accordion rely
// on, straight against the zustand store (no React needed).

function groups() {
    return useVisualiser.getState().params.materialGroups ?? [];
}

beforeEach(() => {
    useVisualiser.setState((s) => ({
        params: { ...s.params, materialGroups: [] },
        editingGroupId: null,
        pendingPaths: [],
    }));
});

describe('addMaterialGroups', () => {
    it('creates one group per definition with defaults filled in', () => {
        useVisualiser.getState().addMaterialGroups([
            { pathIndices: [0, 1], material: 'standoff', color: '#cc1b2a' },
            { pathIndices: [2], material: 'backlight' },
        ]);
        const list = groups();
        expect(list).toHaveLength(2);
        expect(list[0]).toMatchObject({
            material: 'standoff',
            color: '#cc1b2a',
            pathIndices: [0, 1],
        });
        // Backlight defaults its glow when unspecified.
        expect(list[1]).toMatchObject({
            material: 'backlight',
            glowIntensity: 1,
            pathIndices: [2],
        });
        expect(list[0].id).not.toBe(list[1].id);
    });

    it('claims paths from existing groups (one group per path)', () => {
        const store = useVisualiser.getState();
        store.addMaterialGroups([
            { pathIndices: [0, 1, 2], material: 'vinyl', printFullColor: true },
        ]);
        store.addMaterialGroups([{ pathIndices: [1], material: 'acrylic' }]);
        const list = groups();
        expect(list).toHaveLength(2);
        expect(list.find((g) => g.material === 'vinyl')?.pathIndices).toEqual([
            0, 2,
        ]);
        expect(
            list.find((g) => g.material === 'acrylic')?.pathIndices,
        ).toEqual([1]);
    });

    it('ignores empty definitions', () => {
        useVisualiser
            .getState()
            .addMaterialGroups([{ pathIndices: [], material: 'acrylic' }]);
        expect(groups()).toHaveLength(0);
    });
});

describe('updateGroupProps material switch', () => {
    it('switches the material in place, keeping membership', () => {
        useVisualiser.getState().addMaterialGroups([
            { pathIndices: [0, 1], material: 'standoff', thicknessMm: 5 },
        ]);
        const id = groups()[0].id;
        useVisualiser
            .getState()
            .updateGroupProps(id, { material: 'pushthrough', color: '#f5f5f0' });
        const g = groups()[0];
        expect(g.material).toBe('pushthrough');
        expect(g.color).toBe('#f5f5f0');
        expect(g.pathIndices).toEqual([0, 1]);
        expect(g.thicknessMm).toBe(5);
    });
});
