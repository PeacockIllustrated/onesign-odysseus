import { requireAdmin } from '@/lib/auth';
import { getArtworkJob } from '@/lib/artwork/actions';
import { notFound } from 'next/navigation';
import { createServerClient } from '@/lib/supabase-server';
import { formatDate } from '@/lib/artwork/utils';

/**
 * Printable / downloadable approval pack for a visual-approval job.
 * Renders the chosen variant per component + client signature +
 * comments + approval date. Intended as the source of truth for
 * production handoff — "this is what the client approved".
 *
 * Print via browser Ctrl+P → Save as PDF. Same pattern as the
 * existing compliance-sheet print pages under (print)/.
 */
export default async function ApprovalPackPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    await requireAdmin();

    const { id } = await params;
    const job = await getArtworkJob(id);
    if (!job) notFound();

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

    // Load the approval record for this job.
    const { data: approval } = await supabase
        .from('artwork_approvals')
        .select('*')
        .eq('job_id', id)
        .eq('status', 'approved')
        .order('approved_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (!approval) {
        return (
            <div style={{ padding: 40, fontFamily: 'system-ui, sans-serif', textAlign: 'center', color: '#888' }}>
                <h1 style={{ fontSize: 18 }}>No approved approval found for this job.</h1>
                <p style={{ fontSize: 13 }}>Generate and complete an approval before downloading the pack.</p>
            </div>
        );
    }

    // Build the chosen-variant data per component.
    const chosenPerComponent: Array<{
        componentName: string;
        componentType: string;
        variant: {
            label: string;
            name: string | null;
            description: string | null;
            thumbnailUrl: string | null;
            material: string | null;
            finish: string | null;
            applicationMethod: string | null;
            widthMm: number | null;
            heightMm: number | null;
            returnsMm: number | null;
        } | null;
    }> = [];

    for (const c of job.components) {
        const variants: any[] = (c as any).variants ?? [];
        const chosen = variants.find((v: any) => v.is_chosen);
        chosenPerComponent.push({
            componentName: c.name,
            componentType: c.component_type,
            variant: chosen
                ? {
                      label: chosen.label,
                      name: chosen.name,
                      description: chosen.description,
                      thumbnailUrl: await signUrl(chosen.thumbnail_url),
                      material: chosen.material,
                      finish: chosen.finish,
                      applicationMethod: chosen.application_method,
                      widthMm: chosen.width_mm ? Number(chosen.width_mm) : null,
                      heightMm: chosen.height_mm ? Number(chosen.height_mm) : null,
                      returnsMm: chosen.returns_mm ? Number(chosen.returns_mm) : null,
                  }
                : null,
        });
    }

    const approvedDate = approval.approved_at
        ? formatDate(approval.approved_at)
        : '—';

    const orgName =
        job.client_name ??
        (job as any).org?.name ??
        approval.client_company ??
        null;

    return (
        <html>
            <head>
                <title>Approval Pack — {job.job_name}</title>
                <style
                    dangerouslySetInnerHTML={{
                        __html: `
                            @media print {
                                body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                                .no-print { display: none !important; }
                                @page { margin: 15mm 20mm; }
                            }
                            * { box-sizing: border-box; margin: 0; padding: 0; }
                            body {
                                font-family: system-ui, -apple-system, sans-serif;
                                color: #111;
                                background: #fff;
                                line-height: 1.5;
                            }
                        `,
                    }}
                />
            </head>
            <body>
                <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 24px' }}>

                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32, borderBottom: '2px solid #111', paddingBottom: 16 }}>
                        <div>
                            <img src="/Odysseus-Logo-Black.svg" alt="Onesign" style={{ height: 36, marginBottom: 8 }} />
                            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>
                                Approved Visual — {job.job_name}
                            </h1>
                            <p style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                                {job.job_reference}
                            </p>
                        </div>
                        <div style={{ textAlign: 'right', fontSize: 12, color: '#666' }}>
                            <div>Approved: <strong style={{ color: '#111' }}>{approvedDate}</strong></div>
                            {orgName && <div style={{ marginTop: 2 }}>Client: <strong style={{ color: '#111' }}>{orgName}</strong></div>}
                        </div>
                    </div>

                    {/* Print button — server component, so wire via inline script */}
                    <div className="no-print" style={{ marginBottom: 24 }}>
                        <button
                            id="print-btn"
                            style={{
                                padding: '10px 20px',
                                fontSize: 13,
                                fontWeight: 700,
                                border: '1px solid #ddd',
                                borderRadius: 6,
                                background: '#111',
                                color: '#fff',
                                cursor: 'pointer',
                            }}
                        >
                            ↓ Download / Print
                        </button>
                        <span style={{ marginLeft: 12, fontSize: 12, color: '#999' }}>
                            Ctrl+P → Save as PDF
                        </span>
                        <script
                            dangerouslySetInnerHTML={{
                                __html: `document.getElementById('print-btn').addEventListener('click',function(){window.print()})`,
                            }}
                        />
                    </div>

                    {/* Chosen variants */}
                    {chosenPerComponent.map((item, i) => (
                        <div
                            key={i}
                            style={{
                                border: '1px solid #e0e0e0',
                                borderRadius: 8,
                                padding: 20,
                                marginBottom: 20,
                                pageBreakInside: 'avoid',
                            }}
                        >
                            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#888', marginBottom: 6 }}>
                                component {i + 1} · {item.componentType}
                            </div>
                            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
                                {item.componentName}
                            </h2>

                            {item.variant ? (
                                <>
                                    {item.variant.thumbnailUrl && (
                                        <div style={{
                                            marginBottom: 16,
                                            background: '#fafafa',
                                            borderRadius: 6,
                                            padding: 12,
                                            textAlign: 'center',
                                        }}>
                                            <img
                                                src={item.variant.thumbnailUrl}
                                                alt={item.variant.name ?? item.componentName}
                                                style={{ maxWidth: '100%', maxHeight: 400, objectFit: 'contain', borderRadius: 4 }}
                                            />
                                        </div>
                                    )}

                                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                                        Chosen: {item.variant.label}
                                        {item.variant.name ? ` — ${item.variant.name}` : ''}
                                    </div>

                                    {item.variant.description && (
                                        <p style={{ fontSize: 13, color: '#444', marginBottom: 12 }}>
                                            {item.variant.description}
                                        </p>
                                    )}

                                    {(item.variant.material || item.variant.finish || item.variant.applicationMethod || item.variant.widthMm) && (
                                        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                                            <tbody>
                                                {item.variant.material && (
                                                    <tr>
                                                        <td style={{ padding: '4px 0', color: '#888', width: 120 }}>Material</td>
                                                        <td style={{ padding: '4px 0', fontWeight: 600 }}>{item.variant.material}</td>
                                                    </tr>
                                                )}
                                                {item.variant.applicationMethod && (
                                                    <tr>
                                                        <td style={{ padding: '4px 0', color: '#888' }}>Method</td>
                                                        <td style={{ padding: '4px 0', fontWeight: 600 }}>{item.variant.applicationMethod}</td>
                                                    </tr>
                                                )}
                                                {item.variant.finish && (
                                                    <tr>
                                                        <td style={{ padding: '4px 0', color: '#888' }}>Finish</td>
                                                        <td style={{ padding: '4px 0', fontWeight: 600 }}>{item.variant.finish}</td>
                                                    </tr>
                                                )}
                                                {item.variant.widthMm && (
                                                    <tr>
                                                        <td style={{ padding: '4px 0', color: '#888' }}>Dimensions</td>
                                                        <td style={{ padding: '4px 0', fontWeight: 600 }}>
                                                            {item.variant.widthMm} × {item.variant.heightMm ?? '—'}
                                                            {item.variant.returnsMm ? ` × ${item.variant.returnsMm}` : ''} mm
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    )}
                                </>
                            ) : (
                                <p style={{ fontSize: 13, color: '#999', fontStyle: 'italic' }}>
                                    no variant was chosen for this component
                                </p>
                            )}
                        </div>
                    ))}

                    {/* Client comments */}
                    {approval.client_comments && (
                        <div style={{
                            border: '1px solid #f0d98a',
                            background: '#fffbeb',
                            borderRadius: 8,
                            padding: 16,
                            marginBottom: 20,
                            pageBreakInside: 'avoid',
                        }}>
                            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a37800', marginBottom: 6 }}>
                                Client comments
                            </div>
                            <p style={{ fontSize: 13, color: '#6b5900', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                                {approval.client_comments}
                            </p>
                        </div>
                    )}

                    {/* Approval details + signature */}
                    <div style={{
                        border: '2px solid #111',
                        borderRadius: 8,
                        padding: 20,
                        pageBreakInside: 'avoid',
                    }}>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#888', marginBottom: 12 }}>
                            Approval record
                        </div>
                        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                            <tbody>
                                <tr>
                                    <td style={{ padding: '6px 0', color: '#666', width: 120 }}>Name</td>
                                    <td style={{ padding: '6px 0', fontWeight: 600 }}>{approval.client_name}</td>
                                </tr>
                                <tr>
                                    <td style={{ padding: '6px 0', color: '#666' }}>Email</td>
                                    <td style={{ padding: '6px 0', fontWeight: 600 }}>{approval.client_email}</td>
                                </tr>
                                {approval.client_company && (
                                    <tr>
                                        <td style={{ padding: '6px 0', color: '#666' }}>Company</td>
                                        <td style={{ padding: '6px 0', fontWeight: 600 }}>{approval.client_company}</td>
                                    </tr>
                                )}
                                <tr>
                                    <td style={{ padding: '6px 0', color: '#666' }}>Approved</td>
                                    <td style={{ padding: '6px 0', fontWeight: 600 }}>{approvedDate}</td>
                                </tr>
                                <tr>
                                    <td style={{ padding: '6px 0', color: '#666' }}>Reference</td>
                                    <td style={{ padding: '6px 0', fontWeight: 600, fontFamily: 'ui-monospace, monospace' }}>{job.job_reference}</td>
                                </tr>
                            </tbody>
                        </table>

                        {approval.signature_data && (
                            <div style={{
                                marginTop: 16,
                                padding: 12,
                                border: '1px solid #e0e0e0',
                                borderRadius: 6,
                                background: '#fafafa',
                            }}>
                                <div style={{ fontSize: 10, color: '#999', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                    Client signature
                                </div>
                                <img
                                    src={approval.signature_data}
                                    alt="Client signature"
                                    style={{ maxWidth: '100%', maxHeight: 80, display: 'block' }}
                                />
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div style={{
                        marginTop: 32,
                        paddingTop: 16,
                        borderTop: '1px solid #e0e0e0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 11,
                        color: '#999',
                    }}>
                        <span>onesign &amp; digital · team valley, gateshead</span>
                        <span>generated {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>

                </div>
            </body>
        </html>
    );
}
