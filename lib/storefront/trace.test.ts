import { describe, expect, it } from 'vitest';
import { traceToSpec, type TraceInput } from './trace';
import { specToBlocks } from './geometry';

// A clean calibration: scale = 10 mm/px (anchor 2000mm over 200px).
// Facade 420×310 px → 4200×3100 mm. Boxes chosen to land on round mm.
const base: TraceInput = {
    anchorMm: 2000,
    anchorPx: 200,
    facade: { x: 10, y: 20, w: 420, h: 310 }, // bottom edge at y=330
    fascia: { x: 10, y: 20, w: 420, h: 77 }, // 770 mm tall banner
    door: { x: 25, y: 125, w: 100, h: 205 }, // x→150, head→2050, width 1000
    window: { x: 140, y: 125, w: 250, h: 160 }, // x→1300, width 2500
    stallriser: { x: 140, y: 285, w: 250, h: 45 }, // 450 mm
};

describe('traceToSpec', () => {
    it('converts traced pixels to mm via the anchor scale', () => {
        const spec = traceToSpec(base);
        expect(spec.widthMm).toBe(4200);
        expect(spec.heightMm).toBe(3100);
        expect(spec.fasciaHeightMm).toBe(770);
        expect(spec.doorHeadMm).toBe(2050);
        expect(spec.stallriserHeightMm).toBe(450);
        expect(spec.door.xMm).toBe(150);
        expect(spec.door.widthMm).toBe(1000);
        expect(spec.window.xMm).toBe(1300);
        expect(spec.window.widthMm).toBe(2500);
    });

    it('derives the fascia proportion from the trace, not a prior', () => {
        const spec = traceToSpec(base);
        expect(spec.fasciaHeightMm / spec.heightMm).toBeCloseTo(0.248, 2); // ~25%
    });

    it('derives jamb + pilaster widths from gaps when not traced', () => {
        const spec = traceToSpec(base);
        expect(spec.jambWidthMm).toBe(150); // facade-left → door-left
        // pilaster = frontage − (window right) = 4200 − (1300+2500)
        expect(spec.pilasterWidthMm).toBe(400);
    });

    it('honours an explicit stallriser/door-panel/grid trace', () => {
        const spec = traceToSpec({
            ...base,
            doorBottomPanel: { x: 25, y: 280, w: 100, h: 50 }, // 500 mm
            doorCols: 2,
            doorRows: 4,
        });
        expect(spec.door.bottomPanelMm).toBe(500);
        expect(spec.door.cols).toBe(2);
        expect(spec.door.rows).toBe(4);
    });

    it('rejects a zero/negative anchor', () => {
        expect(() => traceToSpec({ ...base, anchorPx: 0 })).toThrow();
        expect(() => traceToSpec({ ...base, anchorMm: -5 })).toThrow();
    });

    it('feeds straight into the geometry builder', () => {
        const spec = traceToSpec(base);
        const blocks = specToBlocks(spec);
        expect(blocks.find((b) => b.name === 'Fascia_SignMount')).toBeTruthy();
        // a 2000mm anchor door → the model is to that scale
        expect(blocks.find((b) => b.name === 'Back_Wall')!.w).toBe(4200);
    });
});
