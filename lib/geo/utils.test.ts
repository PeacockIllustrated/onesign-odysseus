import { describe, it, expect } from 'vitest';
import { pinColour, formatSiteAddress } from './utils';

describe('pinColour', () => {
    it('returns red when deliveries > 0', () => {
        expect(pinColour({ deliveries: 1, artwork: 0, production: 0, maintenance: 0, quotes: 0 })).toBe('red');
    });
    it('returns amber when artwork > 0 and no deliveries', () => {
        expect(pinColour({ deliveries: 0, artwork: 2, production: 0, maintenance: 0, quotes: 0 })).toBe('amber');
    });
    it('returns green when production > 0 and no deliveries/artwork', () => {
        expect(pinColour({ deliveries: 0, artwork: 0, production: 1, maintenance: 0, quotes: 0 })).toBe('green');
    });
    it('returns blue when maintenance > 0 and no higher priorities', () => {
        expect(pinColour({ deliveries: 0, artwork: 0, production: 0, maintenance: 3, quotes: 0 })).toBe('blue');
    });
    it('returns grey when only quotes', () => {
        expect(pinColour({ deliveries: 0, artwork: 0, production: 0, maintenance: 0, quotes: 5 })).toBe('grey');
    });
    it('returns red even when all types are present', () => {
        expect(pinColour({ deliveries: 1, artwork: 1, production: 1, maintenance: 1, quotes: 1 })).toBe('red');
    });
});

describe('formatSiteAddress', () => {
    it('formats a full address', () => {
        expect(formatSiteAddress({
            address_line_1: '14 High Street',
            address_line_2: null,
            city: 'Gateshead',
            county: 'Tyne and Wear',
            postcode: 'NE8 1AA',
        })).toBe('14 High Street, Gateshead, Tyne and Wear, NE8 1AA');
    });
    it('skips null fields', () => {
        expect(formatSiteAddress({
            address_line_1: '14 High Street',
            address_line_2: null,
            city: null,
            county: null,
            postcode: 'NE8 1AA',
        })).toBe('14 High Street, NE8 1AA');
    });
    it('returns empty string when all null', () => {
        expect(formatSiteAddress({
            address_line_1: null,
            address_line_2: null,
            city: null,
            county: null,
            postcode: null,
        })).toBe('');
    });
});
