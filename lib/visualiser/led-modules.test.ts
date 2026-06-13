import { describe, it, expect } from 'vitest';
import { resolveSpacing, findModule, LED_MODULE_CATALOG } from './led-modules';

const prism12 = findModule('prism12')!; // 75mm→250, 100mm→300

describe('resolveSpacing', () => {
    it('returns the published spacing at a depth point', () => {
        const r = resolveSpacing(prism12, 75, 'standard');
        expect(r.modulePitchMm).toBe(250);
        expect(r.wattsPerModule).toBe(0.92);
        expect(r.cascadeLimit).toBe(40);
        expect(r.voltageV).toBe(12);
    });

    it('interpolates between depth points (wider with depth)', () => {
        expect(resolveSpacing(prism12, 87.5, 'standard').modulePitchMm).toBe(275);
        expect(resolveSpacing(prism12, 100, 'standard').modulePitchMm).toBe(300);
    });

    it('clamps below the shallowest and above the deepest can', () => {
        expect(resolveSpacing(prism12, 30, 'standard').modulePitchMm).toBe(250);
        expect(resolveSpacing(prism12, 250, 'standard').modulePitchMm).toBe(300);
    });

    it('tightens spacing for darker / perforated faces', () => {
        const std = resolveSpacing(prism12, 100, 'standard').modulePitchMm;
        const dark = resolveSpacing(prism12, 100, 'dark').modulePitchMm;
        const perf = resolveSpacing(prism12, 100, 'perforated').modulePitchMm;
        expect(dark).toBeLessThan(std);
        expect(perf).toBeLessThan(dark);
        expect(dark).toBe(240); // 300 × 0.8
        expect(perf).toBe(195); // 300 × 0.65
    });

    it('carries voltage + cascade from the module (24 V doubles cascade)', () => {
        const r = resolveSpacing(findModule('prism24')!, 100, 'standard');
        expect(r.voltageV).toBe(24);
        expect(r.cascadeLimit).toBe(80);
    });
});

describe('findModule', () => {
    it('resolves catalogue ids and rejects unknowns', () => {
        expect(findModule('mini12')?.id).toBe('mini12');
        expect(findModule(null)).toBeNull();
        expect(findModule('nope')).toBeNull();
        expect(LED_MODULE_CATALOG.length).toBeGreaterThan(3);
    });
});
