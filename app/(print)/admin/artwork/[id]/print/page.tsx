import { requireAdmin } from '@/lib/auth';
import { getArtworkJob } from '@/lib/artwork/actions';
import { notFound } from 'next/navigation';
import { formatDate, getComponentTypeLabel, getLightingTypeLabel, formatDimensionWithReturns } from '@/lib/artwork/utils';
import { createServerClient } from '@/lib/supabase-server';

export default async function ArtworkVisualPackPrintPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    await requireAdmin();

    const { id } = await params;
    const job = await getArtworkJob(id);

    if (!job) {
        notFound();
    }

    // Only include components with signed-off designs
    const printableComponents = job.components.filter(c => c.design_signed_off_at);

    if (printableComponents.length === 0) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
                <p style={{ fontSize: '16px', color: '#666' }}>
                    no components with signed-off designs to print
                </p>
            </div>
        );
    }

    // Generate signed URLs, fetch extra items, and get cover image
    const supabase = await createServerClient();
    const thumbnailUrls: Record<string, string | null> = {};
    const itemsByComponent: Record<string, Array<{ id: string; label: string; sort_order: number; width_mm: number | null; height_mm: number | null; returns_mm: number | null }>> = {};

    // Cover image signed URL
    let coverImageUrl: string | null = null;
    if (job.cover_image_path) {
        const { data } = await supabase.storage
            .from('artwork-assets')
            .createSignedUrl(job.cover_image_path, 3600);
        coverImageUrl = data?.signedUrl || null;
    }

    await Promise.all(
        printableComponents.map(async (component) => {
            if (component.artwork_thumbnail_url) {
                const urlParts = component.artwork_thumbnail_url.split('/artwork-assets/');
                if (urlParts.length > 1) {
                    const storagePath = urlParts[1];
                    const { data } = await supabase.storage
                        .from('artwork-assets')
                        .createSignedUrl(storagePath, 3600);
                    thumbnailUrls[component.id] = data?.signedUrl || null;
                } else {
                    thumbnailUrls[component.id] = null;
                }
            } else {
                thumbnailUrls[component.id] = null;
            }

            const { data: items } = await supabase
                .from('artwork_component_items')
                .select('id, label, sort_order, width_mm, height_mm, returns_mm')
                .eq('component_id', component.id)
                .order('sort_order', { ascending: true });
            itemsByComponent[component.id] = items || [];
        })
    );

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
                        overflow: visible;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                    .no-print { display: none !important; }
                    .page-sheet {
                        page-break-after: always;
                        page-break-inside: avoid;
                        break-after: page;
                        break-inside: avoid;
                    }
                    .page-sheet:last-child {
                        page-break-after: auto;
                        break-after: auto;
                    }
                }

                * { margin: 0; padding: 0; box-sizing: border-box; }

                body {
                    font-family: 'Gilroy', 'Inter', system-ui, -apple-system, sans-serif;
                    color: #111;
                    background: #fff;
                }

                .page-sheet {
                    page-break-after: always;
                    page-break-inside: avoid;
                }
                .page-sheet:last-child { page-break-after: auto; }

                @media screen {
                    .page-sheet + .page-sheet { margin-top: 20mm; }
                }

                /* === VISUAL PACK PAGE === */

                .visual-page {
                    width: 190mm;
                    height: 277mm;
                    margin: 0 auto;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    border: 1px solid #e5e5e5;
                }

                /* --- Header bar --- */

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

                /* --- Artwork image container --- */

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

                /* --- Component info section --- */

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

                /* --- Multi-item dimensions table --- */

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

                /* === COVER PAGE === */

                .cover-page {
                    width: 190mm;
                    height: 277mm;
                    margin: 0 auto;
                    display: flex;
                    flex-direction: column;
                    border: 1px solid #e5e5e5;
                    overflow: hidden;
                }

                .cover-top {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 5mm 6mm;
                    border-bottom: 2px solid #111;
                }

                .cover-body {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    padding: 8mm 6mm;
                    overflow: hidden;
                }

                .cover-job-name {
                    font-size: 28px;
                    font-weight: 700;
                    color: #111;
                    letter-spacing: -0.02em;
                    line-height: 1.1;
                    margin-bottom: 2mm;
                }

                .cover-job-ref {
                    font-size: 12px;
                    color: #888;
                    font-weight: 500;
                    margin-bottom: 6mm;
                }

                .cover-meta {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 4mm 10mm;
                    margin-bottom: 6mm;
                    padding-bottom: 5mm;
                    border-bottom: 1px solid #e5e5e5;
                }

                .cover-meta-label {
                    font-size: 7px;
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                    color: #999;
                    font-weight: 600;
                    margin-bottom: 0.5mm;
                }

                .cover-meta-value {
                    font-size: 12px;
                    font-weight: 600;
                    color: #111;
                }

                /* --- Cover image area --- */

                .cover-image-container {
                    margin-bottom: 5mm;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex: 1;
                    min-height: 0;
                    background: #fafafa;
                    border: 1px solid #eee;
                    border-radius: 2mm;
                    overflow: hidden;
                }

                .cover-image-container img {
                    max-width: 100%;
                    max-height: 100%;
                    object-fit: contain;
                }

                .cover-section-title {
                    font-size: 8px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    color: #111;
                    border-bottom: 1px solid #111;
                    padding-bottom: 1.5mm;
                    margin-bottom: 3mm;
                }

                .cover-contents-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 10px;
                }

                .cover-contents-table th {
                    text-align: left;
                    font-size: 7px;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                    color: #999;
                    padding: 1.5mm 2mm;
                    border-bottom: 1px solid #ddd;
                }

                .cover-contents-table td {
                    padding: 2mm 2mm;
                    border-bottom: 1px solid #eee;
                    vertical-align: middle;
                }

                .cover-contents-table .sheet-num {
                    font-weight: 700;
                    color: #111;
                    width: 15mm;
                }

                .cover-contents-table .comp-name {
                    font-weight: 600;
                    color: #111;
                }

                .cover-contents-table .comp-type {
                    color: #666;
                    font-size: 9px;
                }

                .cover-contents-table .comp-dims {
                    color: #888;
                    font-size: 9px;
                    font-weight: 500;
                    text-align: right;
                }

                .cover-footer {
                    margin-top: auto;
                    padding: 4mm 6mm;
                    border-top: 1px solid #e5e5e5;
                    display: flex;
                    justify-content: space-between;
                    font-size: 8px;
                    color: #bbb;
                }

                /* 2-column grid for 9+ components */
                .cover-contents-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 0 6mm;
                }

                .cover-contents-grid .cover-contents-table {
                    font-size: 9px;
                }

                .cover-contents-grid .cover-contents-table th {
                    font-size: 6.5px;
                    padding: 1mm 1.5mm;
                }

                .cover-contents-grid .cover-contents-table td {
                    padding: 1.5mm 1.5mm;
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
                    artwork approval pack — {printableComponents.length} sheet{printableComponents.length !== 1 ? 's' : ''} for {job.job_reference}
                </p>
            </div>

            {/* COVER PAGE */}
            <div className="page-sheet">
                <div className="cover-page">
                    <div className="cover-top">
                        <div className="vp-logo">
                            <img src="/Odysseus-Logo-Black.svg" alt="OneSign" />
                        </div>
                        <div className="vp-header-right">
                            artwork approval pack
                        </div>
                    </div>

                    <div className="cover-body">
                        <div className="cover-job-name">{job.job_name}</div>
                        <div className="cover-job-ref">{job.job_reference}</div>

                        <div className="cover-meta">
                            <div>
                                <div className="cover-meta-label">client</div>
                                <div className="cover-meta-value">{job.client_name || '—'}</div>
                            </div>
                            <div>
                                <div className="cover-meta-label">date</div>
                                <div className="cover-meta-value">{formatDate(new Date().toISOString())}</div>
                            </div>
                            <div>
                                <div className="cover-meta-label">components</div>
                                <div className="cover-meta-value">{printableComponents.length}</div>
                            </div>
                            <div>
                                <div className="cover-meta-label">status</div>
                                <div className="cover-meta-value">awaiting approval</div>
                            </div>
                            {job.panel_size && (
                                <div>
                                    <div className="cover-meta-label">panel size</div>
                                    <div className="cover-meta-value">{job.panel_size}</div>
                                </div>
                            )}
                            {job.paint_colour && (
                                <div>
                                    <div className="cover-meta-label">paint colour</div>
                                    <div className="cover-meta-value">{job.paint_colour}</div>
                                </div>
                            )}
                        </div>

                        {job.description && (
                            <div style={{ fontSize: '10px', color: '#555', marginBottom: '5mm', lineHeight: 1.5 }}>
                                {job.description}
                            </div>
                        )}

                        {/* Cover Image — overview of the whole job */}
                        {coverImageUrl && (
                            <div className="cover-image-container">
                                <img src={coverImageUrl} alt={`${job.job_name} overview`} />
                            </div>
                        )}

                        {/* Contents table — pushed down if no cover image */}
                        <div>
                            <div className="cover-section-title">contents</div>
                            {(() => {
                                const useGrid = printableComponents.length > 8;
                                const mid = useGrid ? Math.ceil(printableComponents.length / 2) : printableComponents.length;
                                const leftItems = printableComponents.slice(0, mid);
                                const rightItems = useGrid ? printableComponents.slice(mid) : [];

                                const renderTable = (items: typeof printableComponents, startIndex: number) => (
                                    <table className="cover-contents-table">
                                        <thead>
                                            <tr>
                                                <th>sheet</th>
                                                <th>component</th>
                                                <th>type</th>
                                                <th style={{ textAlign: 'right' }}>dimensions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {items.map((component, i) => (
                                                <tr key={component.id}>
                                                    <td className="sheet-num">{startIndex + i + 1}</td>
                                                    <td className="comp-name">{component.name}</td>
                                                    <td className="comp-type">{getComponentTypeLabel(component.component_type)}</td>
                                                    <td className="comp-dims">
                                                        {component.width_mm && component.height_mm
                                                            ? formatDimensionWithReturns(
                                                                Number(component.width_mm),
                                                                Number(component.height_mm),
                                                                component.returns_mm ? Number(component.returns_mm) : null
                                                            )
                                                            : '—'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                );

                                if (useGrid) {
                                    return (
                                        <div className="cover-contents-grid">
                                            <div>{renderTable(leftItems, 0)}</div>
                                            <div>{renderTable(rightItems, mid)}</div>
                                        </div>
                                    );
                                }

                                return renderTable(leftItems, 0);
                            })()}
                        </div>
                    </div>

                    <div className="cover-footer">
                        <div>prepared by onesign & digital</div>
                        <div>{job.job_reference} — {formatDate(new Date().toISOString())}</div>
                    </div>
                </div>
            </div>

            {/* COMPONENT PAGES */}
            {printableComponents.map((component, index) => {
                const thumbnailUrl = thumbnailUrls[component.id];
                const componentItems = itemsByComponent[component.id] || [];
                const hasItems = componentItems.length > 0;
                const sheetNumber = index + 1;

                return (
                    <div key={component.id} className="page-sheet">
                        <div className="visual-page">
                            {/* Header */}
                            <div className="vp-header">
                                <div className="vp-logo">
                                    <img src="/Odysseus-Logo-Black.svg" alt="OneSign" />
                                </div>
                                <div className="vp-header-right">
                                    sheet {sheetNumber} of {printableComponents.length}
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

                                    {hasItems ? (
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
                                                {componentItems.map(item => (
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

                                    {/* Show material/lighting for multi-item too */}
                                    {hasItems && (
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
                    </div>
                );
            })}
        </>
    );
}
