import { describe, it, expect } from 'vitest';
import { trafficStatus, formatDuration, formatDistance, ONESIGN_HQ } from './utils';

describe('trafficStatus', () => {
    it('returns normal when ratio < 1.15', () => {
        expect(trafficStatus(100, 100)).toBe('normal');
        expect(trafficStatus(114, 100)).toBe('normal');
    });
    it('returns moderate when ratio 1.15-1.4', () => {
        expect(trafficStatus(115, 100)).toBe('moderate');
        expect(trafficStatus(139, 100)).toBe('moderate');
    });
    it('returns heavy when ratio >= 1.4', () => {
        expect(trafficStatus(140, 100)).toBe('heavy');
        expect(trafficStatus(200, 100)).toBe('heavy');
    });
    it('returns normal when typical is zero', () => {
        expect(trafficStatus(100, 0)).toBe('normal');
    });
});

describe('formatDuration', () => {
    it('formats seconds as minutes only', () => {
        expect(formatDuration(300)).toBe('5 min');
        expect(formatDuration(60)).toBe('1 min');
    });
    it('formats as hours + minutes when >= 60 min', () => {
        expect(formatDuration(3660)).toBe('1 hr 1 min');
        expect(formatDuration(7200)).toBe('2 hr');
    });
    it('handles zero', () => {
        expect(formatDuration(0)).toBe('0 min');
    });
});

describe('formatDistance', () => {
    it('converts metres to miles with one decimal', () => {
        expect(formatDistance(1609.34)).toBe('1.0 mi');
        expect(formatDistance(16093.4)).toBe('10.0 mi');
    });
    it('handles zero', () => {
        expect(formatDistance(0)).toBe('0.0 mi');
    });
});

describe('ONESIGN_HQ', () => {
    it('is in Gateshead', () => {
        expect(ONESIGN_HQ.lat).toBeCloseTo(54.945, 2);
        expect(ONESIGN_HQ.lng).toBeCloseTo(-1.592, 2);
    });
});
