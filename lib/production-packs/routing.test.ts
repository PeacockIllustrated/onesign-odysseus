import { describe, it, expect } from 'vitest';
import {
    routeForPiece,
    assemblySteps,
    DEPT,
    CNC_THICKNESS_MM,
} from './routing';

describe('routeForPiece', () => {
    it('routes push-through acrylic Cut list → Laser → Plastic fab → Assembly', () => {
        expect(routeForPiece('pushthrough')).toEqual([
            DEPT.cutList,
            DEPT.laser,
            DEPT.plasticFab,
            DEPT.assembly,
        ]);
    });

    it('sends thick work to the CNC instead of the laser', () => {
        const thin = routeForPiece('acrylic', { thicknessMm: 5 });
        const thick = routeForPiece('acrylic', { thicknessMm: CNC_THICKNESS_MM + 10 });
        expect(thin).toContain(DEPT.laser);
        expect(thin).not.toContain(DEPT.cnc);
        expect(thick).toContain(DEPT.cnc);
        expect(thick).not.toContain(DEPT.laser);
    });

    it('adds Painters to a painted stood-off run only', () => {
        expect(routeForPiece('standoff', { painted: true })).toContain(DEPT.painters);
        expect(routeForPiece('standoff', { painted: false })).not.toContain(
            DEPT.painters,
        );
    });

    it('routes the tray through metal fab → painters → assembly → goods out', () => {
        expect(routeForPiece('panel')).toEqual([
            DEPT.metalFab,
            DEPT.painters,
            DEPT.assembly,
            DEPT.goodsOut,
        ]);
    });

    it('routes returns through metal fab; printed vinyl through digital print', () => {
        expect(routeForPiece('returns')).toContain(DEPT.metalFab);
        expect(routeForPiece('vinylPrint')[0]).toBe(DEPT.digitalPrint);
        expect(routeForPiece('vinylCut')[0]).toBe(DEPT.vinyl);
    });
});

describe('assemblySteps', () => {
    it('orders the present pieces and always finishes with QC + goods out', () => {
        const steps = assemblySteps(['vinylCut', 'panel', 'pushthrough']);
        // Tray first, vinyl last-before-QC, regardless of input order.
        expect(steps[0]).toMatch(/tray/i);
        expect(steps[steps.length - 1]).toMatch(/goods out/i);
        const trayIdx = steps.findIndex((s) => /tray/i.test(s));
        const pushIdx = steps.findIndex((s) => /push-through/i.test(s));
        const vinylIdx = steps.findIndex((s) => /vinyl/i.test(s));
        expect(trayIdx).toBeLessThan(pushIdx);
        expect(pushIdx).toBeLessThan(vinylIdx);
    });

    it('de-duplicates the shared opal/lighting step', () => {
        const steps = assemblySteps(['opalBacking', 'backlit', 'panel']);
        const lighting = steps.filter((s) => /opal backing & lighting/i.test(s));
        expect(lighting).toHaveLength(1);
    });
});
