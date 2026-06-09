import { describe, it, expect } from 'vitest';
import { buildSurveySketch } from './sketch';

describe('buildSurveySketch', () => {
    it('returns a placeholder when width/height are missing', () => {
        const svg = buildSurveySketch({});
        expect(svg).toContain('<svg');
        expect(svg).toContain('Enter width');
        // No dimension labels on the placeholder.
        expect(svg).not.toContain(' mm</text>');
    });

    it('renders a front elevation with rounded width + height labels', () => {
        const svg = buildSurveySketch({ width_mm: 2400, height_mm: 600 });
        expect(svg).toContain('<svg');
        expect(svg).toContain('>2400 mm<');
        expect(svg).toContain('>600 mm<');
        expect(svg).toContain('FRONT');
        // No side elevation without a depth/return/shadow-gap.
        expect(svg).not.toContain('SIDE');
    });

    it('rounds fractional millimetres', () => {
        const svg = buildSurveySketch({ width_mm: 2399.6, height_mm: 600.4 });
        expect(svg).toContain('>2400 mm<');
        expect(svg).toContain('>600 mm<');
    });

    it('draws a side elevation with a depth dimension when depth is given', () => {
        const svg = buildSurveySketch({
            width_mm: 1000,
            height_mm: 500,
            depth_mm: 120,
        });
        expect(svg).toContain('SIDE');
        expect(svg).toContain('>120 mm<');
    });

    it('draws the side elevation when returns are flagged even without a depth', () => {
        const svg = buildSurveySketch(
            { width_mm: 1000, height_mm: 500 },
            { hasReturns: true },
        );
        expect(svg).toContain('SIDE');
        expect(svg).toContain('RETURNS');
    });

    it('includes a double-headed arrow marker definition', () => {
        const svg = buildSurveySketch({ width_mm: 1000, height_mm: 500 });
        expect(svg).toContain('id="svy-arrow"');
        expect(svg).toContain('orient="auto-start-reverse"');
        expect(svg).toContain('marker-start="url(#svy-arrow)"');
    });

    it('escapes the title into the aria-label', () => {
        const svg = buildSurveySketch(
            { width_mm: 1000, height_mm: 500 },
            { title: 'Fascia <main> & "trim"' },
        );
        expect(svg).toContain('aria-label="Sketch — Fascia &lt;main&gt; &amp; &quot;trim&quot;"');
    });

    it('keeps the drawing within a sane aspect for extreme ratios', () => {
        // A very wide, short sign should still produce a valid viewBox.
        const svg = buildSurveySketch({ width_mm: 6000, height_mm: 150 });
        const m = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
        expect(m).not.toBeNull();
        const [, vbw, vbh] = m!;
        expect(Number(vbw)).toBeGreaterThan(Number(vbh));
    });
});
