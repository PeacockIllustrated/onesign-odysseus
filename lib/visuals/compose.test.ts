import { describe, expect, it } from 'vitest';
import { composePrompt } from './compose';
import type { MockupRequest, SignSpec } from './types';

const baseSpec: SignSpec = {
    text: 'ONESIGN',
    form: 'built_up_letters',
    faceMaterial: 'brushed_aluminium',
    colour: 'RAL 9005 black returns',
    illumination: 'halo',
    mounting: 'stood_off',
    dimensions: '2400 × 600 mm',
    notes: ['10mm acrylic returns', 'IP65 LEDs'],
};

const req = (over: Partial<MockupRequest> = {}): MockupRequest => ({
    spec: baseSpec,
    scene: 'modern_storefront',
    timeOfDay: 'overcast',
    ...over,
});

describe('composePrompt', () => {
    it('renders the sign wording as quoted literal text', () => {
        const { prompt } = composePrompt(req());
        expect(prompt).toContain('"ONESIGN"');
    });

    it('falls back to a generic phrase when wording is unknown', () => {
        const { prompt } = composePrompt(req({ spec: { ...baseSpec, text: '   ' } }));
        expect(prompt).toContain('the brand name');
        expect(prompt).not.toContain('""');
    });

    it('includes a clause for every enum dimension', () => {
        const { prompt } = composePrompt(req());
        expect(prompt).toContain('built-up three-dimensional letters');
        expect(prompt).toContain('brushed satin aluminium');
        expect(prompt).toContain('halo glow');
        expect(prompt).toContain('locator studs');
        expect(prompt).toContain('modern glass-fronted commercial storefront');
        expect(prompt).toContain('overcast');
    });

    it('folds in colour, dimensions and free-text notes', () => {
        const { prompt } = composePrompt(req());
        expect(prompt).toContain('finished in RAL 9005 black returns');
        expect(prompt).toContain('approximately 2400 × 600 mm');
        expect(prompt).toContain('additional details: 10mm acrylic returns; IP65 LEDs');
    });

    it('always ends with the quality scaffold and a full stop', () => {
        const { prompt } = composePrompt(req());
        expect(prompt.trim().endsWith('proportions.')).toBe(true);
    });

    it('omits optional clauses cleanly when absent (no stray commas)', () => {
        const lean: SignSpec = {
            text: 'ACME',
            form: 'fascia_panel',
            faceMaterial: 'printed_vinyl',
            illumination: 'none',
            mounting: 'flush',
        };
        const { prompt } = composePrompt(req({ spec: lean }));
        expect(prompt).not.toContain(', ,');
        expect(prompt).not.toContain('finished in');
        expect(prompt).not.toContain('approximately');
        expect(prompt).not.toContain('additional details');
    });

    it('is deterministic — same input, same output', () => {
        expect(composePrompt(req()).prompt).toBe(composePrompt(req()).prompt);
    });

    it('exposes the ordered clauses used to build the prompt', () => {
        const { clauses } = composePrompt(req());
        expect(clauses[0]).toContain('built-up three-dimensional letters');
        expect(clauses.at(-1)).toBe(
            'professional architectural photography, eye-level street view, realistic materials and reflections, sharp focus, high detail, true-to-life proportions',
        );
    });
});
