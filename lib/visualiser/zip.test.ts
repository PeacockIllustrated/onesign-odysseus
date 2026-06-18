import { describe, it, expect } from 'vitest';
import { createZip } from './zip';

const u32 = (b: Uint8Array, o: number) =>
    (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);

describe('createZip', () => {
    it('writes a valid STORE zip with the right signatures + entry count', () => {
        const zip = createZip([
            { name: 'sign/tray-cut.svg', data: '<svg/>' },
            { name: 'sign/acrylic.svg', data: '<svg id="x"/>' },
        ]);
        // local file header signature first
        expect(u32(zip, 0)).toBe(0x04034b50);
        const text = new TextDecoder().decode(zip);
        expect(text).toContain('sign/tray-cut.svg');
        expect(text).toContain('sign/acrylic.svg');
        expect(text).toContain('<svg/>');
        // end-of-central-directory at the tail, 2 entries
        const eocd = zip.length - 22;
        expect(u32(zip, eocd)).toBe(0x06054b50);
        expect(u16(zip, eocd + 10)).toBe(2);
    });

    it('stores raw bytes (a PNG) uncompressed', () => {
        const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
        const zip = createZip([{ name: 'p.png', data: png }]);
        expect(u16(zip, 8)).toBe(0); // method = store
        expect(u32(zip, 18)).toBe(png.length); // compressed size
        expect(u32(zip, 22)).toBe(png.length); // uncompressed size
    });

    it('handles an empty archive (just the EOCD)', () => {
        const zip = createZip([]);
        expect(zip.length).toBe(22);
        expect(u32(zip, 0)).toBe(0x06054b50);
        expect(u16(zip, 8)).toBe(0);
    });
});
