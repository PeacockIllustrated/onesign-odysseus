import { describe, it, expect } from 'vitest';
import { computeNextSubItem, type SubItemForStage } from './shop-floor-utils';

const stageId = 'stage-cnc';

function si(overrides: Partial<SubItemForStage>): SubItemForStage {
    return {
        id: overrides.id ?? 'x',
        label: overrides.label ?? 'A',
        target_stage_id: stageId,
        as_built_signed_off_at: null,
        ...overrides,
    };
}

describe('computeNextSubItem', () => {
    it('returns 0 when nothing signed off yet', () => {
        const items = [si({ id: 'a' }), si({ id: 'b' })];
        expect(computeNextSubItem(items)).toBe(0);
    });

    it('skips the first sub-item if already signed off', () => {
        const items = [
            si({ id: 'a', as_built_signed_off_at: '2026-04-15T10:00:00Z' }),
            si({ id: 'b' }),
        ];
        expect(computeNextSubItem(items)).toBe(1);
    });

    it('returns null when every sub-item is signed off', () => {
        const items = [
            si({ id: 'a', as_built_signed_off_at: '2026-04-15T10:00:00Z' }),
            si({ id: 'b', as_built_signed_off_at: '2026-04-15T10:05:00Z' }),
        ];
        expect(computeNextSubItem(items)).toBeNull();
    });

    it('returns null for an empty list', () => {
        expect(computeNextSubItem([])).toBeNull();
    });

    it('ignores order of sub-items and returns the first pending by array index', () => {
        const items = [
            si({ id: 'a', as_built_signed_off_at: '2026-04-15T10:00:00Z' }),
            si({ id: 'b' }),
            si({ id: 'c', as_built_signed_off_at: '2026-04-15T11:00:00Z' }),
        ];
        expect(computeNextSubItem(items)).toBe(1);
    });
});
