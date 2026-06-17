import { describe, it, expect } from 'vitest';
import { summariseSignPieces } from './piece-summary';
import type { PanelParams } from './types';

function params(extra: Partial<PanelParams>): PanelParams {
    return {
        panelWidthMm: 2400,
        panelHeightMm: 600,
        panelRal: 'RAL 9005',
        materialGroups: [],
        ...extra,
    } as unknown as PanelParams;
}

describe('summariseSignPieces', () => {
    it('always leads with the tray (with colour)', () => {
        const out = summariseSignPieces(params({}));
        expect(out[0]).toBe('Folded aluminium tray (RAL 9005)');
    });

    it('lists each distinct material in friendly language, no duplicates', () => {
        const out = summariseSignPieces(
            params({
                materialGroups: [
                    { id: 'a', material: 'pushthrough', color: '#fff', pathIndices: [0] },
                    { id: 'b', material: 'pushthrough', color: '#fff', pathIndices: [1] },
                    { id: 'c', material: 'vinyl', color: '#000', printFullColor: false, pathIndices: [2] },
                ],
            } as unknown as Partial<PanelParams>),
        );
        expect(out).toContain('Push-through acrylic letters');
        expect(out).toContain('Cut vinyl graphics');
        // de-duped despite two push-through groups
        expect(out.filter((l) => l === 'Push-through acrylic letters')).toHaveLength(1);
    });

    it('names a metal face finish and the keyline halo', () => {
        const out = summariseSignPieces(
            params({
                illumination: { keyline: { enabled: true, color: '#fff' } },
                materialGroups: [
                    {
                        id: 'a',
                        material: 'pushthrough',
                        color: '#fff',
                        pathIndices: [0],
                        extraFace: { material: 'brass', thicknessMm: 1.5 },
                    },
                ],
            } as unknown as Partial<PanelParams>),
        );
        expect(out.some((l) => /brass faces/i.test(l))).toBe(true);
        expect(out).toContain('Halo-illuminated (keyline)');
    });

    it('does not surface the tray-only cut/solid groups as pieces', () => {
        const out = summariseSignPieces(
            params({
                materialGroups: [
                    { id: 'a', material: 'cut', color: '#000', pathIndices: [0] },
                    { id: 'b', material: 'solid', color: '#000', pathIndices: [1] },
                ],
            } as unknown as Partial<PanelParams>),
        );
        // Just the tray — nothing else.
        expect(out).toHaveLength(1);
    });
});
