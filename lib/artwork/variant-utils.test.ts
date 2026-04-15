import { describe, it, expect } from 'vitest';
import { mapVariantToSubItemInput } from './variant-utils';
import type { ArtworkVariant } from './variant-types';

const base: ArtworkVariant = {
    id: '11111111-1111-4111-8111-111111111111',
    component_id: '22222222-2222-4222-8222-222222222222',
    label: 'A',
    sort_order: 0,
    name: 'Gold foil',
    description: 'premium look',
    thumbnail_url: null,
    material: 'ACM 3mm',
    application_method: 'routed + folded',
    finish: 'RAL 9010',
    width_mm: 2400,
    height_mm: 400,
    returns_mm: 50,
    is_chosen: true,
    chosen_at: '2026-04-15T10:00:00Z',
    notes: 'gold leaf across the letters',
    created_at: '2026-04-15T09:00:00Z',
    updated_at: '2026-04-15T09:00:00Z',
};

describe('mapVariantToSubItemInput', () => {
    it('copies all spec fields across when present', () => {
        const si = mapVariantToSubItemInput(base);
        expect(si.name).toBe('Gold foil');
        expect(si.material).toBe('ACM 3mm');
        expect(si.application_method).toBe('routed + folded');
        expect(si.finish).toBe('RAL 9010');
        expect(si.width_mm).toBe(2400);
        expect(si.height_mm).toBe(400);
        expect(si.returns_mm).toBe(50);
        expect(si.notes).toBe('gold leaf across the letters');
    });

    it('passes null through for missing spec fields', () => {
        const bare: ArtworkVariant = {
            ...base,
            name: null,
            material: null,
            application_method: null,
            finish: null,
            width_mm: null,
            height_mm: null,
            returns_mm: null,
            notes: null,
        };
        const si = mapVariantToSubItemInput(bare);
        expect(si.name).toBeNull();
        expect(si.material).toBeNull();
        expect(si.application_method).toBeNull();
        expect(si.finish).toBeNull();
        expect(si.width_mm).toBeNull();
        expect(si.height_mm).toBeNull();
        expect(si.returns_mm).toBeNull();
        expect(si.notes).toBeNull();
    });

    it('always defaults quantity to 1 and label to "A"', () => {
        const si = mapVariantToSubItemInput(base);
        expect(si.quantity).toBe(1);
        expect(si.label).toBe('A');
        expect(si.sort_order).toBe(0);
    });
});
