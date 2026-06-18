/**
 * Minimal ZIP writer (STORE / no compression) — dependency-free.
 *
 * Bundles the production CUT files into a single .zip the operator can send
 * straight to the machines. STORE (uncompressed) keeps it tiny + correct: cut
 * files are small vectors, and every CAM/RIP reads a store zip. Pure (returns
 * bytes); the caller wraps it in a Blob to download.
 */

const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(bytes: Uint8Array): number {
    let c = ~0;
    for (let i = 0; i < bytes.length; i++) {
        c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    }
    return (~c) >>> 0;
}

export interface ZipEntry {
    name: string;
    /** UTF-8 text (SVG/DXF) or raw bytes (PNG). */
    data: string | Uint8Array;
}

/** Build a STORE .zip from the entries. Returns the raw bytes. */
export function createZip(entries: ZipEntry[]): Uint8Array {
    const enc = new TextEncoder();
    const files = entries.map((e) => ({
        nameBytes: enc.encode(e.name),
        data: typeof e.data === 'string' ? enc.encode(e.data) : e.data,
    }));

    const locals: Uint8Array[] = [];
    const centrals: Uint8Array[] = [];
    let offset = 0;

    for (const f of files) {
        const crc = crc32(f.data);
        const size = f.data.length;

        const local = new Uint8Array(30 + f.nameBytes.length);
        const lv = new DataView(local.buffer);
        lv.setUint32(0, 0x04034b50, true);
        lv.setUint16(4, 20, true); // version needed
        lv.setUint16(6, 0, true); // flags
        lv.setUint16(8, 0, true); // method: store
        lv.setUint16(10, 0, true); // mod time
        lv.setUint16(12, 0, true); // mod date
        lv.setUint32(14, crc, true);
        lv.setUint32(18, size, true); // compressed
        lv.setUint32(22, size, true); // uncompressed
        lv.setUint16(26, f.nameBytes.length, true);
        lv.setUint16(28, 0, true); // extra len
        local.set(f.nameBytes, 30);
        locals.push(local, f.data);

        const cd = new Uint8Array(46 + f.nameBytes.length);
        const cv = new DataView(cd.buffer);
        cv.setUint32(0, 0x02014b50, true);
        cv.setUint16(4, 20, true); // version made by
        cv.setUint16(6, 20, true); // version needed
        cv.setUint16(8, 0, true);
        cv.setUint16(10, 0, true); // method
        cv.setUint16(12, 0, true);
        cv.setUint16(14, 0, true);
        cv.setUint32(16, crc, true);
        cv.setUint32(20, size, true);
        cv.setUint32(24, size, true);
        cv.setUint16(28, f.nameBytes.length, true);
        cv.setUint16(30, 0, true); // extra
        cv.setUint16(32, 0, true); // comment
        cv.setUint16(34, 0, true); // disk start
        cv.setUint16(36, 0, true); // internal attrs
        cv.setUint32(38, 0, true); // external attrs
        cv.setUint32(42, offset, true); // local header offset
        cd.set(f.nameBytes, 46);
        centrals.push(cd);

        offset += local.length + f.data.length;
    }

    const cdStart = offset;
    const cdSize = centrals.reduce((n, c) => n + c.length, 0);

    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true); // disk number
    ev.setUint16(6, 0, true); // disk with CD
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, cdStart, true);
    ev.setUint16(20, 0, true); // comment len

    const parts = [...locals, ...centrals, end];
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let p = 0;
    for (const part of parts) {
        out.set(part, p);
        p += part.length;
    }
    return out;
}
