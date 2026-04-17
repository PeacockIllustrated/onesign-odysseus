import React from 'react';
import { requireAdmin } from '@/lib/auth';
import { getComponentDetail, getArtworkJob } from '@/lib/artwork/actions';
import { notFound } from 'next/navigation';
import { formatDate, getComponentTypeLabel, getLightingTypeLabel, formatDimensionWithReturns } from '@/lib/artwork/utils';
import { createServerClient } from '@/lib/supabase-server';

export default async function ArtworkComponentVisualPrintPage({
    params,
}: {
    params: Promise<{ id: string; componentId: string }>;
}) {
    await requireAdmin();

    const { id, componentId } = await params;
    const [component, job] = await Promise.all([
        getComponentDetail(componentId),
        getArtworkJob(id),
    ]);

    if (!component || !job) {
        notFound();
    }

    const subItems = (component.sub_items ?? component.extra_items ?? [])
        .slice()
        .sort((a: any, b: any) => a.sort_order - b.sort_order);

    const supabase = await createServerClient();

    const signUrl = async (url: string | null): Promise<string | null> => {
        if (!url) return null;
        const parts = url.split('/artwork-assets/');
        if (parts.length <= 1) return null;
        const { data } = await supabase.storage
            .from('artwork-assets')
            .createSignedUrl(parts[1], 3600);
        return data?.signedUrl ?? null;
    };

    // Sign component-level thumbnail
    const thumbnailUrl = await signUrl(component.artwork_thumbnail_url);

    // Sign each sub-item's thumbnail for the compliance sheet
    const subItemThumbnails: Record<string, string | null> = {};
    for (const si of subItems) {
        if ((si as any).thumbnail_url) {
            subItemThumbnails[si.id] = await signUrl((si as any).thumbnail_url);
        }
    }

    return (
        <>
            <style>{`
                @media print {
                    @page {
                        margin: 10mm;
                        size: A4 portrait;
                    }
                    html, body {
                        width: 190mm;
                        height: 277mm;
                        overflow: hidden;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                    .no-print { display: none !important; }
                    .visual-page {
                        width: 190mm !important;
                        height: 277mm !important;
                    }
                }

                * { margin: 0; padding: 0; box-sizing: border-box; }

                body {
                    font-family: 'Gilroy', 'Inter', system-ui, -apple-system, sans-serif;
                    color: #111;
                    background: #fff;
                }

                .visual-page {
                    width: 190mm;
                    height: 277mm;
                    margin: 0 auto;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    border: 1px solid #e5e5e5;
                }

                .vp-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 5mm 6mm;
                    border-bottom: 2px solid #111;
                    flex-shrink: 0;
                }

                .vp-logo {
                    display: flex;
                    align-items: center;
                }

                .vp-logo img {
                    height: 14px;
                    width: auto;
                }

                .vp-header-right {
                    text-align: right;
                    font-size: 8px;
                    color: #666;
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                    font-weight: 600;
                }

                .vp-artwork-container {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 5mm 6mm;
                    min-height: 0;
                    background: #fafafa;
                }

                .vp-artwork-container img {
                    max-width: 100%;
                    max-height: 100%;
                    object-fit: contain;
                }

                .vp-artwork-container .no-artwork {
                    color: #bbb;
                    font-size: 12px;
                    font-style: italic;
                }

                .vp-info {
                    padding: 4mm 6mm;
                    border-top: 2px solid #111;
                    flex-shrink: 0;
                    display: flex;
                    gap: 4mm;
                }

                .vp-info-left {
                    flex: 1;
                    min-width: 0;
                }

                .vp-component-name {
                    font-size: 16px;
                    font-weight: 700;
                    color: #111;
                    margin-bottom: 1mm;
                    letter-spacing: -0.01em;
                }

                .vp-component-type {
                    font-size: 9px;
                    color: #888;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    font-weight: 600;
                    margin-bottom: 3mm;
                }

                .vp-specs {
                    display: flex;
                    gap: 8mm;
                    flex-wrap: wrap;
                }

                .vp-spec-item {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5mm;
                }

                .vp-spec-label {
                    font-size: 7px;
                    color: #999;
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                    font-weight: 600;
                }

                .vp-spec-value {
                    font-size: 11px;
                    font-weight: 600;
                    color: #111;
                }

                .vp-items-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 9px;
                    margin-top: 2mm;
                }

                .vp-items-table th {
                    text-align: left;
                    font-size: 7px;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                    color: #999;
                    padding: 1mm 2mm;
                    border-bottom: 1px solid #ddd;
                }

                .vp-items-table td {
                    padding: 1.5mm 2mm;
                    border-bottom: 1px solid #eee;
                    font-weight: 500;
                    color: #111;
                }

                /* --- Footer --- */

                .vp-footer {
                    display: flex;
                    justify-content: space-between;
                    padding: 2mm 6mm;
                    border-top: 1px solid #ddd;
                    font-size: 7px;
                    color: #bbb;
                    flex-shrink: 0;
                }

                /* --- Paper signing section (inside vp-info, right side) --- */

                .vp-signoff {
                    border-left: 1px solid #ddd;
                    padding-left: 4mm;
                    width: 62mm;
                    flex-shrink: 0;
                    display: flex;
                    gap: 3mm;
                    align-self: stretch;
                }

                .vp-signoff-checks {
                    display: flex;
                    flex-direction: column;
                    gap: 1.5mm;
                    flex: 1;
                    justify-content: center;
                }

                .vp-check-row {
                    display: flex;
                    align-items: center;
                    gap: 1.5mm;
                    font-size: 7px;
                    color: #444;
                }

                .vp-checkbox {
                    width: 3mm;
                    height: 3mm;
                    border: 0.5px solid #999;
                    flex-shrink: 0;
                }

                .vp-signoff-sig {
                    width: 24mm;
                    flex-shrink: 0;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                }

                .vp-sig-label {
                    font-size: 6px;
                    color: #999;
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                    font-weight: 600;
                    margin-bottom: 0.5mm;
                }

                .vp-sig-box {
                    border: 0.5px solid #ccc;
                    border-radius: 1mm;
                    height: 12mm;
                }

                .vp-date-line {
                    border-bottom: 0.5px solid #ccc;
                    height: 5mm;
                    margin-top: 1mm;
                }

                .vp-notes {
                    margin-top: 2mm;
                    padding-top: 2mm;
                    border-top: 1px solid #eee;
                }

                .vp-notes-label {
                    font-size: 7px;
                    color: #999;
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                    font-weight: 600;
                    margin-bottom: 0.5mm;
                }

                .vp-notes-value {
                    font-size: 9px;
                    color: #333;
                    line-height: 1.4;
                    white-space: pre-line;
                }
            `}</style>

            <script
                dangerouslySetInnerHTML={{
                    __html: `
                        if (typeof window !== 'undefined') {
                            Promise.all([
                                document.fonts ? document.fonts.ready : Promise.resolve(),
                                ...Array.from(document.images).map(function(img) {
                                    return img.complete ? Promise.resolve() : new Promise(function(r) { img.onload = r; img.onerror = r; });
                                })
                            ]).then(function() {
                                setTimeout(function() { window.print(); }, 500);
                            });
                        }
                    `,
                }}
            />

            <div className="no-print" style={{ padding: '20px', textAlign: 'center', background: '#f5f5f5' }}>
                <p style={{ fontSize: '14px', color: '#666' }}>
                    artwork approval sheet — print dialog will open automatically
                </p>
            </div>

            <div className="visual-page">
                {/* Header */}
                <div className="vp-header">
                    <div className="vp-logo">
                        <img src="/Odysseus-Logo-Black.svg" alt="OneSign" />
                    </div>
                    <div className="vp-header-right">
                        {job.job_reference}
                    </div>
                </div>

                {/* Large artwork image */}
                <div className="vp-artwork-container">
                    {thumbnailUrl ? (
                        <img
                            src={thumbnailUrl}
                            alt={`Artwork: ${component.name}`}
                        />
                    ) : (
                        <span className="no-artwork">no artwork uploaded</span>
                    )}
                </div>

                {/* Component info + signing section */}
                <div className="vp-info">
                    <div className="vp-info-left">
                        <div className="vp-component-name">{component.name}</div>
                        <div className="vp-component-type">{getComponentTypeLabel(component.component_type)}</div>

                        {subItems.length > 0 ? (
                            <table className="vp-items-table">
                                <thead>
                                    <tr>
                                        <th>item</th>
                                        <th>name</th>
                                        <th>material</th>
                                        <th>method</th>
                                        <th>finish</th>
                                        <th>W (mm)</th>
                                        <th>H (mm)</th>
                                        <th>R (mm)</th>
                                        <th>qty</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {subItems.map((si: any) => (
                                        <React.Fragment key={si.id}>
                                            <tr>
                                                <td style={{ fontWeight: 700 }}>{si.label}</td>
                                                <td>{si.name ?? '—'}</td>
                                                <td>{si.material ?? '—'}</td>
                                                <td>{si.application_method ?? '—'}</td>
                                                <td>{si.finish ?? '—'}</td>
                                                <td>{si.width_mm ? `${si.width_mm}` : '—'}</td>
                                                <td>{si.height_mm ? `${si.height_mm}` : '—'}</td>
                                                <td>{si.returns_mm ? `${si.returns_mm}` : 'n/a'}</td>
                                                <td>{si.quantity ?? 1}</td>
                                            </tr>
                                            {subItemThumbnails[si.id] && (
                                                <tr>
                                                    <td colSpan={9} style={{ padding: '3mm 0', borderBottom: '0.3mm solid #eee' }}>
                                                        <div style={{ fontSize: '7pt', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '1.5mm' }}>
                                                            {si.label} — technical artwork
                                                        </div>
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img
                                                            src={subItemThumbnails[si.id]!}
                                                            alt={`${si.name ?? si.label} technical artwork`}
                                                            style={{ maxWidth: '100%', maxHeight: '80mm', objectFit: 'contain', borderRadius: '1mm' }}
                                                        />
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <p className="vp-notes">No sub-items defined.</p>
                        )}

                        {component.lighting && (
                            <div className="vp-specs" style={{ marginTop: '2mm' }}>
                                <div className="vp-spec-item">
                                    <span className="vp-spec-label">lighting</span>
                                    <span className="vp-spec-value">{getLightingTypeLabel(component.lighting)}</span>
                                </div>
                            </div>
                        )}

                        {component.notes && (
                            <div className="vp-notes">
                                <div className="vp-notes-label">notes</div>
                                <div className="vp-notes-value">{component.notes}</div>
                            </div>
                        )}
                    </div>

                    {/* Paper signing section */}
                    <div className="vp-signoff">
                        <div className="vp-signoff-checks">
                            <div className="vp-check-row">
                                <div className="vp-checkbox" />
                                <span>material correct</span>
                            </div>
                            <div className="vp-check-row">
                                <div className="vp-checkbox" />
                                <span>dimensions correct</span>
                            </div>
                            <div className="vp-check-row">
                                <div className="vp-checkbox" />
                                <span>artwork correct</span>
                            </div>
                            <div className="vp-check-row">
                                <div className="vp-checkbox" />
                                <span>approved for production</span>
                            </div>
                        </div>
                        <div className="vp-signoff-sig">
                            <div className="vp-sig-label">sign</div>
                            <div className="vp-sig-box" />
                            <div className="vp-sig-label" style={{ marginTop: '1mm' }}>date</div>
                            <div className="vp-date-line" />
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="vp-footer">
                    <span>{job.job_reference} — {component.name}</span>
                    <span>{formatDate(new Date().toISOString())}</span>
                </div>
            </div>
        </>
    );
}
