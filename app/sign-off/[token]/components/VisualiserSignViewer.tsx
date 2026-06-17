'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { usePanelDerivation } from '@/app/(portal)/admin/visualiser/usePanelDerivation';
import { importSvg } from '@/lib/visualiser/svg-import';
import type { PanelParams, ImportedSvg } from '@/lib/visualiser/types';

/**
 * Read-only 3D of a saved visualiser design, for the client approval pack.
 *
 * It drives the SAME pure-geometry engine as the staff tool and the public
 * studio (usePanelDerivation → Scene3D), just with no editing affordances — the
 * client orbits the real sign. Heavy (r3f + THREE + the derivation), so it's a
 * lazy chunk that only loads once the client taps "load" on the embed poster.
 */
const Scene3D = dynamic(
    () => import('@/app/(portal)/admin/visualiser/Scene3D'),
    { ssr: false },
);

function safeImport(svg: string | null): ImportedSvg | null {
    if (!svg) return null;
    try {
        return importSvg(svg);
    } catch {
        return null;
    }
}

export default function VisualiserSignViewer({
    params,
    svgSource,
    night,
}: {
    params: PanelParams;
    svgSource: string | null;
    night: boolean;
}) {
    // Multi-layer designs compose their artwork inside the derivation; this is
    // the legacy single-upload fallback.
    const imported = useMemo(() => safeImport(svgSource), [svgSource]);
    const deriv = usePanelDerivation(params, imported, svgSource);
    const {
        development,
        split,
        aperture,
        keyline,
        pushThroughKeyline,
        pushThroughIslands,
        autoFixings,
        manualFixings,
        reference,
        materialPieces,
        standoffPieces,
        pushThroughPieces,
        backlightPieces,
        extraFacePieces,
        vinylPrintDataUrl,
        placedClipByIndex,
    } = deriv;

    if (!development || !split) {
        return (
            <div
                className="flex h-full w-full items-center justify-center text-sm"
                style={{ color: 'var(--muted)' }}
            >
                preparing 3D…
            </div>
        );
    }

    return (
        <div className="absolute inset-0">
            <Scene3D
                params={params}
                development={development}
                split={split}
                aperture={aperture}
                keyline={keyline}
                pushThroughKeyline={pushThroughKeyline}
                pushThroughIslands={pushThroughIslands}
                autoFixings={autoFixings}
                manualFixings={manualFixings}
                reference={reference}
                vinylPieces={materialPieces.vinyl}
                acrylicPieces={materialPieces.acrylic}
                solidPieces={materialPieces.solid}
                standoffPieces={standoffPieces}
                pushThroughPieces={pushThroughPieces}
                backlightPieces={backlightPieces}
                extraFacePieces={extraFacePieces}
                vinylPrintDataUrl={vinylPrintDataUrl}
                placedPathsByIndex={placedClipByIndex}
                fold={1}
                illuminationView={night}
                illumination={params.illumination}
            />
        </div>
    );
}
