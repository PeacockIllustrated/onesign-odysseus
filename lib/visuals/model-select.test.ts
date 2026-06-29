import { describe, expect, it } from 'vitest';
import { buildModelInput, resolveMockupModel, SOUL_ENDPOINT } from './model-select';

describe('resolveMockupModel', () => {
    it('defaults both tiers to Soul when unconfigured', () => {
        expect(resolveMockupModel('preview', {})).toEqual({ endpoint: SOUL_ENDPOINT, style: 'soul' });
        expect(resolveMockupModel('final', {})).toEqual({ endpoint: SOUL_ENDPOINT, style: 'soul' });
    });

    it('uses the tier-specific endpoint when configured', () => {
        const endpoints = { preview: '/v1/text2image/soul', final: 'flux-pro/kontext/max/edit' };
        expect(resolveMockupModel('preview', endpoints).endpoint).toBe('/v1/text2image/soul');
        expect(resolveMockupModel('final', endpoints).endpoint).toBe('flux-pro/kontext/max/edit');
    });

    it('infers the "edit" input style for non-Soul endpoints', () => {
        expect(resolveMockupModel('final', { final: 'gpt-image/edit' }).style).toBe('edit');
        expect(resolveMockupModel('final', { final: '/v1/text2image/soul' }).style).toBe('soul');
    });

    it('falls back to Soul on blank/whitespace config', () => {
        expect(resolveMockupModel('final', { final: '   ' }).endpoint).toBe(SOUL_ENDPOINT);
        expect(resolveMockupModel('preview', { preview: null }).endpoint).toBe(SOUL_ENDPOINT);
    });
});

describe('buildModelInput', () => {
    const args = { prompt: 'a sign on a wall', referenceUrl: 'https://cdn/x.png', size: '1536x864' };

    it('builds the Soul shape with image_reference + width_and_height', () => {
        const input = buildModelInput('soul', args);
        expect(input.image_reference).toEqual({ type: 'image_url', image_url: 'https://cdn/x.png' });
        expect(input.width_and_height).toBe('1536x864');
        expect(input.input_images).toBeUndefined();
    });

    it('builds the edit shape with input_images and no image_reference', () => {
        const input = buildModelInput('edit', args);
        expect(input.input_images).toEqual([{ type: 'image_url', image_url: 'https://cdn/x.png' }]);
        expect(input.image_reference).toBeUndefined();
        expect(input.prompt).toBe('a sign on a wall');
    });
});
