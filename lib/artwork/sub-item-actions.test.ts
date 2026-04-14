// lib/artwork/sub-item-actions.test.ts
// Schema-level + pure-function tests for sub-item server actions.

import { describe, it, expect } from 'vitest';
import {
    CreateSubItemInputSchema,
    UpdateSubItemInputSchema,
    SubItemMeasurementInputSchema,
} from './types';
import { nextItemLabel } from './utils';

const COMPONENT_UUID = '11111111-1111-4111-8111-111111111111';
const STAGE_UUID = '22222222-2222-4222-8222-222222222222';

describe('CreateSubItemInputSchema', () => {
    it('accepts minimal input and defaults quantity to 1', () => {
        const res = CreateSubItemInputSchema.safeParse({ component_id: COMPONENT_UUID });
        expect(res.success).toBe(true);
        if (res.success) expect(res.data.quantity).toBe(1);
    });

    it('accepts full spec input', () => {
        const res = CreateSubItemInputSchema.safeParse({
            component_id: COMPONENT_UUID,
            name: 'QUEEN BEE letters',
            material: '5mm rose-gold mirrored acrylic',
            application_method: 'stuck to face',
            finish: 'rose gold mirror',
            quantity: 1,
            width_mm: 1500,
            height_mm: 280,
            target_stage_id: STAGE_UUID,
        });
        expect(res.success).toBe(true);
    });

    it('rejects invalid component_id', () => {
        const res = CreateSubItemInputSchema.safeParse({ component_id: 'not-a-uuid' });
        expect(res.success).toBe(false);
    });

    it('rejects quantity below 1', () => {
        const res = CreateSubItemInputSchema.safeParse({
            component_id: COMPONENT_UUID,
            quantity: 0,
        });
        expect(res.success).toBe(false);
    });

    it('rejects negative width', () => {
        const res = CreateSubItemInputSchema.safeParse({
            component_id: COMPONENT_UUID,
            width_mm: -5,
        });
        expect(res.success).toBe(false);
    });
});

describe('UpdateSubItemInputSchema', () => {
    it('accepts an empty patch (noop)', () => {
        const res = UpdateSubItemInputSchema.safeParse({});
        expect(res.success).toBe(true);
    });

    it('accepts nulling a field', () => {
        const res = UpdateSubItemInputSchema.safeParse({
            material: null,
            target_stage_id: null,
        });
        expect(res.success).toBe(true);
    });

    it('rejects quantity of 0', () => {
        const res = UpdateSubItemInputSchema.safeParse({ quantity: 0 });
        expect(res.success).toBe(false);
    });
});

describe('SubItemMeasurementInputSchema', () => {
    it('accepts positive measurements', () => {
        const res = SubItemMeasurementInputSchema.safeParse({
            measured_width_mm: 1501,
            measured_height_mm: 279,
            material_confirmed: true,
            rip_no_scaling_confirmed: true,
        });
        expect(res.success).toBe(true);
    });

    it('rejects zero measurements', () => {
        const res = SubItemMeasurementInputSchema.safeParse({
            measured_width_mm: 0,
            measured_height_mm: 100,
            material_confirmed: true,
            rip_no_scaling_confirmed: true,
        });
        expect(res.success).toBe(false);
    });

    it('rejects missing confirm flags', () => {
        const res = SubItemMeasurementInputSchema.safeParse({
            measured_width_mm: 100,
            measured_height_mm: 100,
        });
        expect(res.success).toBe(false);
    });
});

describe('nextItemLabel', () => {
    it('returns A for empty list', () => {
        expect(nextItemLabel([])).toBe('A');
    });
    it('returns B when A exists', () => {
        expect(nextItemLabel(['A'])).toBe('B');
    });
    it('fills gaps first', () => {
        expect(nextItemLabel(['A', 'B', 'D'])).toBe('C');
    });
    it('returns AA after Z is consumed', () => {
        const full = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
        expect(nextItemLabel(full)).toBe('AA');
    });
});
