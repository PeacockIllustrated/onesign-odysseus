import { describe, expect, it } from 'vitest';
import type { SignSection } from '../production-packs/types';
import { sectionToSignSpec } from './from-pack';

/** A realistic halo-lit fascia section, spec captured as free text. */
const fasciaSection: SignSection = {
    id: 'sec_1',
    title: 'Fascia sign',
    signRef: 'Sign Ref 1',
    keepWith: [],
    blocks: [
        {
            id: 'st_1',
            type: 'specTable',
            title: 'Specification',
            rows: [
                { label: 'Overall size', value: '2400 x 600 mm' },
                { label: 'Material', value: '3mm brushed aluminium tray' },
                { label: 'Finish', value: 'RAL 7016 anthracite' },
                { label: 'Illumination', value: 'Halo illuminated, warm white LEDs' },
                { label: 'Fixing', value: '20mm stainless standoffs' },
            ],
        },
        { id: 'c_1', type: 'callouts', title: 'Materials & construction', items: ['10mm acrylic returns', 'IP65 drivers'] },
        { id: 't_1', type: 'text', title: 'Construction', body: 'Welded tray, folded edges' },
    ],
};

describe('sectionToSignSpec', () => {
    it('normalises free-text spec rows into enum tags', () => {
        const spec = sectionToSignSpec(fasciaSection);
        expect(spec.form).toBe('fascia_panel');
        expect(spec.faceMaterial).toBe('brushed_aluminium');
        expect(spec.illumination).toBe('halo');
        expect(spec.mounting).toBe('stood_off');
    });

    it('preserves free-text size, colour and notes verbatim', () => {
        const spec = sectionToSignSpec(fasciaSection);
        expect(spec.dimensions).toBe('2400 x 600 mm');
        expect(spec.colour).toBe('RAL 7016 anthracite');
        expect(spec.notes).toContain('10mm acrylic returns');
        expect(spec.notes).toContain('IP65 drivers');
        expect(spec.notes).toContain('Construction: Welded tray, folded edges');
    });

    it('drops a purely structural title to empty wording', () => {
        // "Fascia sign" is all structural words → no usable lettering.
        expect(sectionToSignSpec(fasciaSection).text).toBe('');
    });

    it('derives wording from a descriptive title', () => {
        const s: SignSection = { ...fasciaSection, title: 'QUEEN BEE letters' };
        expect(sectionToSignSpec(s).text).toBe('QUEEN BEE');
    });

    it('lets an explicit wording override win over the title', () => {
        expect(sectionToSignSpec(fasciaSection, 'THE GEORGE').text).toBe('THE GEORGE');
    });

    it('classifies push-through acrylic letters and infers face-lighting', () => {
        const s: SignSection = {
            ...fasciaSection,
            title: 'Letters',
            blocks: [
                {
                    id: 'st_2',
                    type: 'specTable',
                    title: 'Specification',
                    rows: [
                        { label: 'Material', value: 'Push-through acrylic letters' },
                        { label: 'Illumination', value: '' },
                        { label: 'Fixing', value: 'Direct screw fix to wall' },
                    ],
                },
            ],
        };
        const spec = sectionToSignSpec(s);
        expect(spec.form).toBe('push_through_letters');
        expect(spec.faceMaterial).toBe('acrylic');
        expect(spec.illumination).toBe('face_lit'); // inferred from "push-through"
        expect(spec.mounting).toBe('flush');
    });

    it('falls back to safe defaults when there is no spec table', () => {
        const bare: SignSection = { id: 's', title: 'Sign 1', signRef: '', keepWith: [], blocks: [] };
        const spec = sectionToSignSpec(bare);
        expect(spec.form).toBe('fascia_panel');
        expect(spec.faceMaterial).toBe('painted_aluminium');
        expect(spec.illumination).toBe('none');
        expect(spec.mounting).toBe('flush');
        expect(spec.notes).toEqual([]);
        expect(spec.text).toBe(''); // "Sign 1" is structural + a number
    });
});
