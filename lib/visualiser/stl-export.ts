/**
 * STL export — serialise the visualiser's assembled 3D sign to an ASCII STL.
 *
 * The sign is exported as ONE file that keeps its parts *separate*: each layer
 * (the folded tray, stand-off letters, studs, push-through inserts, acrylic,
 * metal faces, vinyl, …) becomes its own named `solid … endsolid` block. ASCII
 * STL is the only STL flavour that can carry more than one named solid in a
 * single file, so importers that respect solids (most CAD + animation tools)
 * land each layer as a distinct object the operator can key-frame independently
 * for an assembly / exploded animation — while the whole sign travels as one
 * download, positioned together in its assembled arrangement.
 *
 * This module is deliberately DOM-free and dependency-free (no three.js): the
 * caller walks the live scene, transforms every triangle into a shared
 * millimetre frame, and hands the flat vertex soup here. That keeps the
 * geometry serialisation pure and Vitest-covered, in the spirit of the nesting
 * / returns engines.
 */

/** One layer of the sign — a named run of triangles in millimetres. */
export interface StlSolidInput {
    /** Layer name — becomes the `solid <name>` label. */
    name: string;
    /**
     * Triangle vertices, flattened: 9 numbers per triangle
     * (v0x,v0y,v0z, v1x,v1y,v1z, v2x,v2y,v2z), in millimetres. A trailing
     * partial triangle (length not a multiple of 9) is ignored.
     */
    positions: ArrayLike<number>;
}

/**
 * Facets with a near-zero cross product (collinear / coincident vertices)
 * carry no meaningful surface and produce a NaN normal, so they're dropped.
 * The threshold is in mm² — well below any real facet, comfortably above
 * floating-point noise.
 */
const DEGENERATE_AREA_EPS = 1e-9;

/**
 * Fixed-precision formatting (6 dp ≈ 1 nm at mm scale). Folds a signed zero —
 * whether literal -0 or a tiny negative that rounds to zero — to "0.000000", so
 * the output never carries a meaningless "-0.000000".
 */
function fmt(n: number): string {
    if (!Number.isFinite(n)) return '0.000000';
    const s = n.toFixed(6);
    return s === '-0.000000' ? '0.000000' : s;
}

/** STL solid names can't span lines; collapse whitespace and never go empty. */
function sanitizeName(name: string): string {
    const s = name.replace(/\s+/g, ' ').trim();
    return s.length > 0 ? s : 'solid';
}

/**
 * Count the valid (non-degenerate) triangles across every solid — handy for a
 * caller that wants to know whether the export carries any geometry at all.
 */
export function countStlFacets(solids: StlSolidInput[]): number {
    let n = 0;
    for (const solid of solids) {
        const p = solid.positions;
        for (let i = 0; i + 8 < p.length; i += 9) {
            const nx =
                (p[i + 4] - p[i + 1]) * (p[i + 8] - p[i + 2]) -
                (p[i + 5] - p[i + 2]) * (p[i + 7] - p[i + 1]);
            const ny =
                (p[i + 5] - p[i + 2]) * (p[i + 6] - p[i + 0]) -
                (p[i + 3] - p[i + 0]) * (p[i + 8] - p[i + 2]);
            const nz =
                (p[i + 3] - p[i + 0]) * (p[i + 7] - p[i + 1]) -
                (p[i + 4] - p[i + 1]) * (p[i + 6] - p[i + 0]);
            if (Math.hypot(nx, ny, nz) > DEGENERATE_AREA_EPS) n++;
        }
    }
    return n;
}

/**
 * Serialise the given layers to a single ASCII STL string with one named solid
 * per layer. Solids that contribute no valid facet are omitted; if nothing
 * survives, the result is an empty string so the caller can treat it as "no
 * geometry to export".
 */
export function buildAsciiStl(solids: StlSolidInput[]): string {
    const out: string[] = [];
    for (const solid of solids) {
        const p = solid.positions;
        const facets: string[] = [];
        for (let i = 0; i + 8 < p.length; i += 9) {
            const ax = p[i],
                ay = p[i + 1],
                az = p[i + 2];
            const bx = p[i + 3],
                by = p[i + 4],
                bz = p[i + 5];
            const cx = p[i + 6],
                cy = p[i + 7],
                cz = p[i + 8];
            // Facet normal = (b − a) × (c − a), normalised. STL winds
            // counter-clockwise seen from outside; the caller preserves the
            // source geometry's winding, so this matches the rendered surface.
            const ux = bx - ax,
                uy = by - ay,
                uz = bz - az;
            const vx = cx - ax,
                vy = cy - ay,
                vz = cz - az;
            let nx = uy * vz - uz * vy;
            let ny = uz * vx - ux * vz;
            let nz = ux * vy - uy * vx;
            const len = Math.hypot(nx, ny, nz);
            if (!(len > DEGENERATE_AREA_EPS)) continue; // skip degenerate facet
            nx /= len;
            ny /= len;
            nz /= len;
            facets.push(
                `  facet normal ${fmt(nx)} ${fmt(ny)} ${fmt(nz)}`,
                '    outer loop',
                `      vertex ${fmt(ax)} ${fmt(ay)} ${fmt(az)}`,
                `      vertex ${fmt(bx)} ${fmt(by)} ${fmt(bz)}`,
                `      vertex ${fmt(cx)} ${fmt(cy)} ${fmt(cz)}`,
                '    endloop',
                '  endfacet',
            );
        }
        if (facets.length === 0) continue; // layer carried no real geometry
        const name = sanitizeName(solid.name);
        // Join the facets rather than spreading them into out.push(...facets):
        // a letter-heavy sign produces hundreds of thousands of facet lines, and
        // spreading an array that large blows the call-stack argument limit
        // (RangeError). join() has no such limit, so each solid becomes one
        // string and `out` stays tiny (one entry per layer).
        out.push(`solid ${name}\n${facets.join('\n')}\nendsolid ${name}`);
    }
    return out.length > 0 ? out.join('\n') + '\n' : '';
}
