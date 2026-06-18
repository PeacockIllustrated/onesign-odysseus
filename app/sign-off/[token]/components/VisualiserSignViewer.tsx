'use client';

import { useMemo, useState } from 'react';
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
    // Annotation overlay (edges, fixing markers, keyline/reference register
    // lines, seams). Default OFF so the client first sees the sign exactly as
    // installed — the wow shot — and can flip the marks on if they want detail.
    const [annotations, setAnnotations] = useState(false);

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
                annotations={annotations}
                illuminationView={night}
                illumination={params.illumination}
            />

            {/* Single bottom-corner toggle: off = how the sign looks installed
                (no marks); on = the production overlays. */}
            <button
                type="button"
                onClick={() => setAnnotations((a) => !a)}
                aria-pressed={annotations}
                style={{
                    position: 'absolute',
                    bottom: '12px',
                    right: '12px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '7px 12px',
                    borderRadius: '999px',
                    border: '1px solid var(--hairline)',
                    background: 'var(--glass, rgba(255,255,255,0.78))',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    color: 'var(--text)',
                    fontFamily: 'inherit',
                    fontSize: '12px',
                    fontWeight: 600,
                    letterSpacing: '0.01em',
                    cursor: 'pointer',
                    boxShadow: '0 2px 10px -4px rgba(0,0,0,0.35)',
                }}
            >
                <span
                    aria-hidden
                    style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '999px',
                        background: annotations
                            ? 'var(--accentSolid, #4e7e8c)'
                            : 'var(--muted)',
                    }}
                />
                Annotation {annotations ? 'on' : 'off'}
            </button>
        </div>
    );
}
