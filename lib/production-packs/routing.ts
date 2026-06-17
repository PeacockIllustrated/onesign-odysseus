/**
 * Per-piece production routing + assembly order for a works pack built from a
 * visualiser design.
 *
 * A finished sign is several distinct buildable pieces, each cut and assembled
 * by a different in-house department. This module maps each piece KIND to the
 * ordered department route it travels (the names match the seeded production
 * stages, migration 028) and derives the overall assembly order for the pieces
 * a given sign actually has. Pure + framework-neutral so it's unit-testable and
 * usable from both the client builder and any server action.
 *
 * Cut routing (per the in-house decision): acrylic letters AND thin metal
 * faces/return strips are cut on the LASER; thick or oversized work goes to CNC
 * routing instead. Plastic fabrication assembles acrylic; metal fabrication
 * welds returns and the aluminium tray.
 */

/** Seeded department/stage display names (migration 028). */
export const DEPT = {
    cutList: 'Cut List',
    laser: 'Laser',
    cnc: 'CNC Routing',
    plasticFab: 'Plastic Fabrication',
    metalFab: 'Metal Fabrication',
    painters: 'Painters',
    lighting: 'Lighting',
    vinyl: 'Vinyl',
    digitalPrint: 'Digital Print',
    assembly: 'Assembly',
    goodsOut: 'Goods Out',
} as const;

/** Above this cut thickness the work moves off the laser onto the CNC router. */
export const CNC_THICKNESS_MM = 25;

export type PieceKind =
    | 'panel'
    | 'pushthrough'
    | 'opalBacking'
    | 'backlit'
    | 'acrylic'
    | 'standoff'
    | 'extraFace'
    | 'returns'
    | 'vinylCut'
    | 'vinylPrint';

export interface RouteOptions {
    /** Cut thickness (mm) — thick work routes to CNC instead of the laser. */
    thicknessMm?: number;
    /** Stood-off / tray work that's painted picks up the Painters stage. */
    painted?: boolean;
}

/** The cutting department for a piece — laser by default, CNC when thick. */
function cutDept(thicknessMm?: number): string {
    return thicknessMm && thicknessMm > CNC_THICKNESS_MM ? DEPT.cnc : DEPT.laser;
}

/**
 * Ordered department route for one piece kind. Returns the stage display names
 * in build order (no order-book / artwork-approval / goods-out gates — those
 * bookend the whole job, not an individual piece, except the tray which ends at
 * goods-out as the carcass everything mounts to).
 */
export function routeForPiece(kind: PieceKind, opts: RouteOptions = {}): string[] {
    const cut = cutDept(opts.thicknessMm);
    switch (kind) {
        case 'panel':
            // The folded aluminium tray — fabricated, painted, then the carcass
            // everything else assembles onto.
            return [DEPT.metalFab, DEPT.painters, DEPT.assembly, DEPT.goodsOut];
        case 'pushthrough':
            return [DEPT.cutList, cut, DEPT.plasticFab, DEPT.assembly];
        case 'opalBacking':
            return [DEPT.lighting, DEPT.assembly];
        case 'backlit':
            return [cut, DEPT.lighting, DEPT.assembly];
        case 'acrylic':
            return [DEPT.cutList, cut, DEPT.plasticFab, DEPT.assembly];
        case 'standoff':
            return opts.painted
                ? [DEPT.cutList, cut, DEPT.painters, DEPT.assembly]
                : [DEPT.cutList, cut, DEPT.assembly];
        case 'extraFace':
            return [DEPT.cutList, cut, DEPT.assembly];
        case 'returns':
            return [DEPT.cutList, cut, DEPT.metalFab, DEPT.painters, DEPT.assembly];
        case 'vinylCut':
            return [DEPT.vinyl, DEPT.assembly];
        case 'vinylPrint':
            return [DEPT.digitalPrint, DEPT.vinyl, DEPT.assembly];
    }
}

/** Plain-English assembly step for each piece kind, in build order. */
const ASSEMBLY_STEP: Record<PieceKind, { order: number; step: string }> = {
    panel: { order: 1, step: 'Fabricate & paint the aluminium tray' },
    opalBacking: { order: 2, step: 'Fit the opal backing & lighting' },
    backlit: { order: 2, step: 'Fit the opal backing & lighting' },
    pushthrough: { order: 3, step: 'Press & bond the push-through letters' },
    acrylic: { order: 4, step: 'Apply the face-stuck acrylic' },
    extraFace: { order: 5, step: 'Laminate the metal faces' },
    returns: { order: 6, step: 'Weld & fit the built-up returns' },
    standoff: { order: 7, step: 'Mount the stood-off letters on studs' },
    vinylCut: { order: 8, step: 'Apply the vinyl graphics' },
    vinylPrint: { order: 8, step: 'Apply the printed vinyl graphics' },
};

/**
 * Overall assembly order for the pieces present in a sign, de-duplicated and in
 * build sequence, always finishing with QC + goods out. Drives the "Assembly
 * order" checklist on the pack overview.
 */
export function assemblySteps(kinds: PieceKind[]): string[] {
    const steps = Array.from(new Set(kinds))
        .map((k) => ASSEMBLY_STEP[k])
        .filter((s): s is { order: number; step: string } => !!s)
        .sort((a, b) => a.order - b.order);
    const out: string[] = [];
    for (const s of steps) if (!out.includes(s.step)) out.push(s.step);
    out.push('Final QC & goods out');
    return out;
}
