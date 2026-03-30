/**
 * Panel Letters V1 Engine Tests
 * 
 * Fixture-based tests for pricing engine calculations.
 */

import { describe, it, expect } from 'vitest';
import { calculatePanelLettersV1, validatePanelLettersV1 } from './panel-letters-v1';
import { RateCard, PanelLettersV1Input, TransformerSpec } from '../types';
import fixtures from './fixtures.json';

// =============================================================================
// MOCK RATE CARD
// =============================================================================

/**
 * Create a test rate card matching seed data structure.
 */
function createTestRateCard(): RateCard {
    const panelPriceByMaterialAndSize = new Map<string, number>([
        ['Aluminium 2.5mm::2.4 x 1.2', 8500],
        ['Aluminium 2.5mm::3 x 1.5', 12500],
        ['Aluminium 3mm::2.4 x 1.2', 9500],
        ['Aluminium 3mm::3 x 1.5', 14000],
    ]);

    const finishCostPerM2ByFinish = new Map<string, number>([
        ['Powder Coating', 2500],
        ['Wet Spray', 3500],
        ['Vinyl Wrap', 1800],
    ]);

    const manufacturingRateByTask = new Map<string, number>([
        ['router', 4500],
        ['fabrication', 5000],
        ['assembly', 4000],
        ['vinyl', 3500],
        ['print', 6000],
    ]);

    const ledsPerLetterByHeight = new Map<number, number>([
        [50, 2],
        [100, 3],
        [150, 4],
        [200, 5],
        [250, 6],
        [300, 8],
        [350, 10],
        [400, 12],
        [450, 14],
        [500, 16],
        [520, 18],
        [600, 20],
        [700, 24],
        [800, 28],
        [900, 32],
        [1000, 36],
    ]);

    const transformerByType = new Map<string, TransformerSpec>([
        ['20W', { ledCapacity: 20, unitCostPence: 1500 }],
        ['60W', { ledCapacity: 60, unitCostPence: 2500 }],
        ['100W', { ledCapacity: 100, unitCostPence: 3500 }],
        ['150W', { ledCapacity: 150, unitCostPence: 4500 }],
    ]);

    const opalByTypeAndSheetSize = new Map<string, number>([
        ['Opal (5mm)::2.4 x 1.2', 6500],
        ['Opal (10mm)::2.4 x 1.2', 9500],
    ]);

    const consumablesByKey = new Map<string, number>([
        ['led_unit_cost', 50],
    ]);

    const letterUnitPriceByTypeFinishHeight = new Map<string, number>([
        // Fabricated - Powder Coating
        ['Fabricated::Powder Coating::50', 1500],
        ['Fabricated::Powder Coating::100', 2200],
        ['Fabricated::Powder Coating::150', 3000],
        ['Fabricated::Powder Coating::200', 4000],
        ['Fabricated::Powder Coating::250', 5200],
        ['Fabricated::Powder Coating::300', 6500],
        ['Fabricated::Powder Coating::400', 8500],
        ['Fabricated::Powder Coating::500', 11000],
        // Komacel - Painted
        ['Komacel::Painted::50', 800],
        ['Komacel::Painted::100', 1200],
        ['Komacel::Painted::150', 1600],
        ['Komacel::Painted::200', 2200],
        ['Komacel::Painted::250', 2800],
        ['Komacel::Painted::300', 3500],
        // Acrylic - Clear
        ['Acrylic::Clear::50', 600],
        ['Acrylic::Clear::100', 900],
        ['Acrylic::Clear::150', 1300],
        ['Acrylic::Clear::200', 1800],
        ['Acrylic::Clear::250', 2400],
        ['Acrylic::Clear::300', 3000],
    ]);

    const finishRulesByType = new Map<string, Set<string>>([
        ['Fabricated', new Set(['Powder Coating', 'Wet Spray', 'Brushed', 'Polished'])],
        ['Komacel', new Set(['Painted', 'Vinyl Faced'])],
        ['Acrylic', new Set(['Clear', 'Opal', 'Coloured'])],
    ]);

    return {
        pricingSetId: 'test-pricing-set-001',
        pricingSetName: 'Test Rate Card',
        panelPriceByMaterialAndSize,
        finishCostPerM2ByFinish,
        manufacturingRateByTask,
        ledsPerLetterByHeight,
        transformerByType,
        opalByTypeAndSheetSize,
        consumablesByKey,
        letterUnitPriceByTypeFinishHeight,
        finishRulesByType,
    };
}

// =============================================================================
// FIXTURE TESTS
// =============================================================================

interface FixtureExpected {
    ok: boolean;
    panels_needed?: number;
    panels_x?: number;
    panels_y?: number;
    area_m2?: number;
    aperture_leds?: number;
    letters_total_leds?: number;
    total_leds?: number;
    transformers_needed?: number;
    panel_material_cost_pence?: number;
    panel_finish_cost_pence?: number;
    letters_total_cost_pence?: number;
    materials_markup_pence?: number;
    line_total_pence_min?: number;
    line_total_pence_max?: number;
    has_warning?: boolean;
    error_contains?: string;
}

interface Fixture {
    name: string;
    input: PanelLettersV1Input;
    expected: FixtureExpected;
}

describe('Panel Letters V1 Engine', () => {
    const rateCard = createTestRateCard();
    const fixtureData = fixtures as { fixtures: Fixture[] };

    describe('Fixture tests', () => {
        for (const fixture of fixtureData.fixtures) {
            it(fixture.name, () => {
                const result = calculatePanelLettersV1(fixture.input, rateCard);

                // Check ok status
                expect(result.ok).toBe(fixture.expected.ok);

                if (fixture.expected.ok) {
                    // Happy path assertions
                    if (fixture.expected.panels_needed !== undefined) {
                        expect(result.derived.panels_needed).toBe(fixture.expected.panels_needed);
                    }
                    if (fixture.expected.panels_x !== undefined) {
                        expect(result.derived.panels_x).toBe(fixture.expected.panels_x);
                    }
                    if (fixture.expected.panels_y !== undefined) {
                        expect(result.derived.panels_y).toBe(fixture.expected.panels_y);
                    }
                    if (fixture.expected.area_m2 !== undefined) {
                        expect(result.derived.area_m2).toBeCloseTo(fixture.expected.area_m2, 2);
                    }
                    if (fixture.expected.aperture_leds !== undefined) {
                        expect(result.derived.aperture_leds).toBe(fixture.expected.aperture_leds);
                    }
                    if (fixture.expected.letters_total_leds !== undefined) {
                        expect(result.derived.letters_total_leds).toBe(fixture.expected.letters_total_leds);
                    }
                    if (fixture.expected.total_leds !== undefined) {
                        expect(result.derived.total_leds).toBe(fixture.expected.total_leds);
                    }
                    if (fixture.expected.transformers_needed !== undefined) {
                        expect(result.derived.transformers_needed).toBe(fixture.expected.transformers_needed);
                    }
                    if (fixture.expected.panel_material_cost_pence !== undefined) {
                        expect(result.costs.panel_material_cost_pence).toBe(fixture.expected.panel_material_cost_pence);
                    }
                    if (fixture.expected.panel_finish_cost_pence !== undefined) {
                        expect(result.costs.panel_finish_cost_pence).toBe(fixture.expected.panel_finish_cost_pence);
                    }
                    if (fixture.expected.letters_total_cost_pence !== undefined) {
                        expect(result.costs.letters_total_cost_pence).toBe(fixture.expected.letters_total_cost_pence);
                    }
                    if (fixture.expected.materials_markup_pence !== undefined) {
                        expect(result.costs.materials_markup_pence).toBe(fixture.expected.materials_markup_pence);
                    }
                    if (fixture.expected.line_total_pence_min !== undefined && fixture.expected.line_total_pence_max !== undefined) {
                        expect(result.line_total_pence).toBeGreaterThanOrEqual(fixture.expected.line_total_pence_min);
                        expect(result.line_total_pence).toBeLessThanOrEqual(fixture.expected.line_total_pence_max);
                    }
                    if (fixture.expected.has_warning) {
                        expect(result.warnings.length).toBeGreaterThan(0);
                    }
                } else {
                    // Error path assertions
                    expect(result.errors.length).toBeGreaterThan(0);
                    if (fixture.expected.error_contains) {
                        const hasMatchingError = result.errors.some(e =>
                            e.toLowerCase().includes(fixture.expected.error_contains!.toLowerCase())
                        );
                        expect(hasMatchingError).toBe(true);
                    }
                }
            });
        }
    });

    describe('Validation function', () => {
        it('returns ok:true for valid input', () => {
            const input: PanelLettersV1Input = {
                width_mm: 2400,
                height_mm: 1200,
                allowance_mm: 0,
                panel_size: '2.4 x 1.2',
                panel_material: 'Aluminium 2.5mm',
                panel_finish: 'Powder Coating',
                letter_sets: [{ type: 'Fabricated', qty: 5, height_mm: 200, finish: 'Powder Coating', illuminated: false }],
                labour_hours: { router: 1, fabrication: 1, assembly: 1, vinyl: 0, print: 0 },
                transformer_type: '60W',
                markup_percent: 20,
            };

            const result = validatePanelLettersV1(input, rateCard);
            expect(result.ok).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('returns errors for missing rate card keys', () => {
            const incompleteRateCard = { ...rateCard, consumablesByKey: new Map<string, number>() };

            const input: PanelLettersV1Input = {
                width_mm: 2400,
                height_mm: 1200,
                allowance_mm: 0,
                panel_size: '2.4 x 1.2',
                panel_material: 'Aluminium 2.5mm',
                panel_finish: 'Powder Coating',
                letter_sets: [{ type: 'Fabricated', qty: 5, height_mm: 200, finish: 'Powder Coating', illuminated: false }],
                labour_hours: { router: 1, fabrication: 1, assembly: 1, vinyl: 0, print: 0 },
                transformer_type: '60W',
                markup_percent: 20,
            };

            const result = validatePanelLettersV1(input, incompleteRateCard);
            expect(result.ok).toBe(false);
            expect(result.errors.some(e => e.includes('led_unit_cost'))).toBe(true);
        });
    });

    describe('Edge cases', () => {
        it('handles zero labour hours', () => {
            const input: PanelLettersV1Input = {
                width_mm: 2400,
                height_mm: 1200,
                allowance_mm: 0,
                panel_size: '2.4 x 1.2',
                panel_material: 'Aluminium 2.5mm',
                panel_finish: 'Powder Coating',
                letter_sets: [{ type: 'Fabricated', qty: 5, height_mm: 100, finish: 'Powder Coating', illuminated: false }],
                labour_hours: { router: 0, fabrication: 0, assembly: 0, vinyl: 0, print: 0 },
                transformer_type: '60W',
                markup_percent: 20,
            };

            const result = calculatePanelLettersV1(input, rateCard);
            expect(result.ok).toBe(true);
            expect(result.costs.labour_cost_pence).toBe(0);
        });

        it('handles non-illuminated letters with zero LEDs', () => {
            const input: PanelLettersV1Input = {
                width_mm: 2400,
                height_mm: 1200,
                allowance_mm: 0,
                panel_size: '2.4 x 1.2',
                panel_material: 'Aluminium 2.5mm',
                panel_finish: 'Powder Coating',
                letter_sets: [{ type: 'Fabricated', qty: 10, height_mm: 200, finish: 'Powder Coating', illuminated: false }],
                labour_hours: { router: 1, fabrication: 1, assembly: 1, vinyl: 0, print: 0 },
                transformer_type: '60W',
                markup_percent: 20,
            };

            const result = calculatePanelLettersV1(input, rateCard);
            expect(result.ok).toBe(true);
            expect(result.derived.letters_total_leds).toBe(0);
            expect(result.derived.transformers_needed).toBe(0);
            expect(result.costs.transformer_cost_pence).toBe(0);
        });

        it('correctly calculates panel count for exact fit', () => {
            const input: PanelLettersV1Input = {
                width_mm: 2400,
                height_mm: 1200,
                allowance_mm: 0,
                panel_size: '2.4 x 1.2',
                panel_material: 'Aluminium 2.5mm',
                panel_finish: 'Powder Coating',
                letter_sets: [{ type: 'Fabricated', qty: 5, height_mm: 100, finish: 'Powder Coating', illuminated: false }],
                labour_hours: { router: 1, fabrication: 1, assembly: 1, vinyl: 0, print: 0 },
                transformer_type: '60W',
                markup_percent: 20,
            };

            const result = calculatePanelLettersV1(input, rateCard);
            expect(result.ok).toBe(true);
            expect(result.derived.panels_x).toBe(1);
            expect(result.derived.panels_y).toBe(1);
            expect(result.derived.panels_needed).toBe(1);
        });

        it('correctly calculates panel count for just over fit', () => {
            const input: PanelLettersV1Input = {
                width_mm: 2401,
                height_mm: 1201,
                allowance_mm: 0,
                panel_size: '2.4 x 1.2',
                panel_material: 'Aluminium 2.5mm',
                panel_finish: 'Powder Coating',
                letter_sets: [{ type: 'Fabricated', qty: 5, height_mm: 100, finish: 'Powder Coating', illuminated: false }],
                labour_hours: { router: 1, fabrication: 1, assembly: 1, vinyl: 0, print: 0 },
                transformer_type: '60W',
                markup_percent: 20,
            };

            const result = calculatePanelLettersV1(input, rateCard);
            expect(result.ok).toBe(true);
            expect(result.derived.panels_x).toBe(2);
            expect(result.derived.panels_y).toBe(2);
            expect(result.derived.panels_needed).toBe(4);
        });
    });

    describe('Overrides', () => {
        it('should apply markup override', () => {
            const baseInput = fixtureData.fixtures[0].input;
            const result = calculatePanelLettersV1({
                ...baseInput,
                overrides: {
                    markup_percent: {
                        original: 20,
                        override: 50,
                        reason_code: 'customer_discount',
                        note: 'Test override'
                    }
                }
            }, rateCard);

            expect(result.ok).toBe(true);
            expect(result.overrides?.markup_percent?.override).toBe(50);

            // Re-calculate without override to compare
            const normalResult = calculatePanelLettersV1(baseInput, rateCard);
            expect(result.costs.materials_markup_pence).toBeGreaterThan(normalResult.costs.materials_markup_pence);
        });

        it('should apply labour hour override', () => {
            const baseInput = fixtureData.fixtures[0].input;
            const result = calculatePanelLettersV1({
                ...baseInput,
                overrides: {
                    labour_hours: {
                        fabrication: {
                            original: 2,
                            override: 10,
                            reason_code: 'labour_variance',
                            note: 'Complex job'
                        }
                    }
                }
            }, rateCard);

            expect(result.ok).toBe(true);
            expect(result.overrides?.labour_hours?.fabrication?.override).toBe(10);

            // Re-calculate without override to compare
            const normalResult = calculatePanelLettersV1(baseInput, rateCard);
            expect(result.line_total_pence).toBeGreaterThan(normalResult.line_total_pence);
        });
    });
});
