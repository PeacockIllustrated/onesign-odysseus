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

    const extraItems = component.extra_items || [];
    const hasExtraItems = extraItems.length > 0;

    // Generate a signed URL for the thumbnail
    let thumbnailUrl: string | null = null;
    if (component.artwork_thumbnail_url) {
        const supabase = await createServerClient();
        const urlParts = component.artwork_thumbnail_url.split('/artwork-assets/');
        if (urlParts.length > 1) {
            const storagePath = urlParts[1];
            const { data } = await supabase.storage
                .from('artwork-assets')
                .createSignedUrl(storagePath, 3600);
            thumbnailUrl = data?.signedUrl || null;
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
                        <img src="/logo-black.svg" alt="OneSign" />
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

                        {hasExtraItems ? (
                            <table className="vp-items-table">
                                <thead>
                                    <tr>
                                        <th>item</th>
                                        <th>width</th>
                                        <th>height</th>
                                        <th>returns</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td style={{ fontWeight: 700 }}>A</td>
                                        <td>{component.width_mm ? `${component.width_mm} mm` : '—'}</td>
                                        <td>{component.height_mm ? `${component.height_mm} mm` : '—'}</td>
                                        <td>{component.returns_mm ? `${component.returns_mm} mm` : 'n/a'}</td>
                                    </tr>
                                    {extraItems.map(item => (
                                        <tr key={item.id}>
                                            <td style={{ fontWeight: 700 }}>{item.label}</td>
                                            <td>{item.width_mm ? `${item.width_mm} mm` : '—'}</td>
                                            <td>{item.height_mm ? `${item.height_mm} mm` : '—'}</td>
                                            <td>{item.returns_mm ? `${item.returns_mm} mm` : 'n/a'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div className="vp-specs">
                                <div className="vp-spec-item">
                                    <span className="vp-spec-label">dimensions</span>
                                    <span className="vp-spec-value">
                                        {component.width_mm && component.height_mm
                                            ? formatDimensionWithReturns(
                                                Number(component.width_mm),
                                                Number(component.height_mm),
                                                component.returns_mm ? Number(component.returns_mm) : null
                                            )
                                            : '—'}
                                    </span>
                                </div>
                                <div className="vp-spec-item">
                                    <span className="vp-spec-label">material</span>
                                    <span className="vp-spec-value">{component.material || '—'}</span>
                                </div>
                                {component.lighting && (
                                    <div className="vp-spec-item">
                                        <span className="vp-spec-label">lighting</span>
                                        <span className="vp-spec-value">{getLightingTypeLabel(component.lighting)}</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {hasExtraItems && (
                            <div className="vp-specs" style={{ marginTop: '2mm' }}>
                                <div className="vp-spec-item">
                                    <span className="vp-spec-label">material</span>
                                    <span className="vp-spec-value">{component.material || '—'}</span>
                                </div>
                                {component.lighting && (
                                    <div className="vp-spec-item">
                                        <span className="vp-spec-label">lighting</span>
                                        <span className="vp-spec-value">{getLightingTypeLabel(component.lighting)}</span>
                                    </div>
                                )}
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
