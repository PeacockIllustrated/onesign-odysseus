'use client';

import { useState, useRef, useTransition, useCallback, useEffect } from 'react';
import { submitApproval } from '@/lib/artwork/approval-actions';
import type { ApprovalPackData } from '@/lib/artwork/approval-actions';
import { VariantPicker } from './components/VariantPicker';
import { formatDateTime } from '@/lib/artwork/utils';
import SignatureCanvas, { type SignatureCanvasRef } from '@/components/SignatureCanvas';

interface Props {
    data: ApprovalPackData;
    token: string;
}

export default function ApprovalClientView({ data, token }: Props) {
    const { approval, job, components, coverImageUrl } = data;
    const isApproved = approval.status === 'approved';

    const [selections, setSelections] = useState<Record<string, string>>({});
    const [clientName, setClientName] = useState('');
    const [clientEmail, setClientEmail] = useState('');
    const [clientCompany, setClientCompany] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(isApproved);
    const [isPending, startTransition] = useTransition();
    const signatureRef = useRef<SignatureCanvasRef>(null);

    // Lightbox state
    const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
    const [lightboxAlt, setLightboxAlt] = useState('');

    const openLightbox = useCallback((src: string, alt: string) => {
        setLightboxSrc(src);
        setLightboxAlt(alt);
    }, []);

    const closeLightbox = useCallback(() => {
        setLightboxSrc(null);
        setLightboxAlt('');
    }, []);

    // Close on Escape key
    useEffect(() => {
        if (!lightboxSrc) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeLightbox();
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [lightboxSrc, closeLightbox]);

    const handleSubmit = () => {
        setError(null);

        if (!clientName.trim()) {
            setError('please enter your name');
            return;
        }
        if (!clientEmail.trim()) {
            setError('please enter your email');
            return;
        }
        if (signatureRef.current?.isEmpty()) {
            setError('please draw your signature');
            return;
        }

        const signatureData = signatureRef.current?.toDataURL() || '';

        startTransition(async () => {
            const variant_selections = Object.entries(selections).map(([componentId, variantId]) => ({ componentId, variantId }));
            const result = await submitApproval(token, {
                client_name: clientName.trim(),
                client_email: clientEmail.trim(),
                client_company: clientCompany.trim() || undefined,
                signature_data: signatureData,
                variant_selections,
            });

            if ('error' in result) {
                setError(result.error);
            } else {
                setSuccess(true);
            }
        });
    };

    return (
        <div style={{ maxWidth: '720px', margin: '0 auto', padding: '20px' }}>
            {/* Lightbox Overlay */}
            {lightboxSrc && (
                <div
                    onClick={closeLightbox}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 9999,
                        background: 'rgba(0, 0, 0, 0.85)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'zoom-out',
                        padding: '24px',
                    }}
                >
                    {/* Close button */}
                    <button
                        onClick={closeLightbox}
                        style={{
                            position: 'absolute',
                            top: '16px',
                            right: '20px',
                            background: 'none',
                            border: 'none',
                            color: '#fff',
                            fontSize: '32px',
                            cursor: 'pointer',
                            lineHeight: 1,
                            opacity: 0.7,
                        }}
                        aria-label="Close"
                    >
                        ×
                    </button>
                    <img
                        src={lightboxSrc}
                        alt={lightboxAlt}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            maxWidth: '95vw',
                            maxHeight: '90vh',
                            objectFit: 'contain',
                            borderRadius: '4px',
                            cursor: 'default',
                        }}
                    />
                </div>
            )}

            {/* Header — uses the Onesign & Digital company mark, not the
                internal Odysseus product logo. Clients see the brand they
                commissioned the work from. */}
            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                <div style={{ marginBottom: '10px', display: 'flex', justifyContent: 'center' }}>
                    <img
                        src="/Onesign-Logo-Black.svg"
                        alt="Onesign & Digital"
                        style={{ height: '56px', width: 'auto', maxWidth: '320px' }}
                    />
                </div>
                <div style={{
                    fontSize: '11px',
                    color: '#888',
                    textTransform: 'uppercase',
                    letterSpacing: '0.14em',
                    fontWeight: 600,
                }}>
                    artwork approval
                </div>
            </div>

            {/* Cover Image Card */}
            <div style={{
                border: '1px solid #e5e5e5',
                borderRadius: '8px',
                overflow: 'hidden',
                background: '#fff',
                marginBottom: '24px',
            }}>
                {coverImageUrl ? (
                    <div
                        onClick={() => openLightbox(coverImageUrl, `${job.job_name} overview`)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: '#fafafa',
                            padding: '24px',
                            borderBottom: '1px solid #e5e5e5',
                            cursor: 'zoom-in',
                        }}
                    >
                        <img
                            src={coverImageUrl}
                            alt={`${job.job_name} overview`}
                            style={{ maxWidth: '100%', maxHeight: '500px', objectFit: 'contain' }}
                        />
                    </div>
                ) : (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#fafafa',
                        padding: '48px 24px',
                        borderBottom: '1px solid #e5e5e5',
                        color: '#bbb',
                        fontSize: '14px',
                        fontStyle: 'italic',
                    }}>
                        no cover image
                    </div>
                )}

                <div style={{ padding: '20px 24px' }}>
                    <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#111', letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: '2px' }}>
                        {job.job_name}
                    </h1>
                    <p style={{ fontSize: '13px', color: '#999', fontWeight: 500 }}>
                        {job.job_reference}{job.client_name ? ` — ${job.client_name}` : ''}
                    </p>

                    {(job.panel_size || job.paint_colour) && (
                        <div style={{ display: 'flex', gap: '24px', marginTop: '12px' }}>
                            {job.panel_size && (
                                <div>
                                    <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#999', fontWeight: 600, marginBottom: '2px' }}>panel size</div>
                                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#111' }}>{job.panel_size}</div>
                                </div>
                            )}
                            {job.paint_colour && (
                                <div>
                                    <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#999', fontWeight: 600, marginBottom: '2px' }}>paint colour</div>
                                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#111' }}>{job.paint_colour}</div>
                                </div>
                            )}
                        </div>
                    )}

                    {job.description && (
                        <p style={{ fontSize: '13px', color: '#666', lineHeight: 1.6, marginTop: '12px' }}>
                            {job.description}
                        </p>
                    )}
                </div>
            </div>

            {/* Install / delivery address — snapshot of the site at link-generation time */}
            {(approval.snapshot_site_name || approval.snapshot_site_address) && (
                <div style={{
                    border: '1px solid #e5e5e5',
                    borderRadius: '8px',
                    background: '#fff',
                    marginBottom: '24px',
                    padding: '16px 20px',
                }}>
                    <div style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                        color: '#888',
                        marginBottom: '8px',
                    }}>
                        install / delivery address
                    </div>
                    {approval.snapshot_site_name && (
                        <div style={{ fontSize: '14px', fontWeight: 600, color: '#111', marginBottom: '4px' }}>
                            {approval.snapshot_site_name}
                        </div>
                    )}
                    {approval.snapshot_site_address && (
                        <div style={{ fontSize: '13px', color: '#444', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                            {approval.snapshot_site_address}
                        </div>
                    )}
                </div>
            )}

            {/* Components Grid */}
            {components.length > 0 && (
                <div style={{
                    border: '1px solid #e5e5e5',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    background: '#fff',
                    marginBottom: '24px',
                }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #eee' }}>
                        <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#111', margin: 0 }}>
                            components
                        </h2>
                        <p style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>
                            {components.length} item{components.length !== 1 ? 's' : ''} for approval — click to enlarge
                        </p>
                    </div>

                    <div className="grid grid-cols-1 gap-px bg-neutral-200">
                        {components.map((component) => (
                            <div key={component.id} style={{ background: '#fff', padding: '20px' }}>
                                {/* Thumbnail */}
                                <div
                                    onClick={() => component.thumbnailUrl && openLightbox(component.thumbnailUrl, component.name)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        background: '#fafafa',
                                        borderRadius: '6px',
                                        minHeight: '180px',
                                        marginBottom: '12px',
                                        overflow: 'hidden',
                                        cursor: component.thumbnailUrl ? 'zoom-in' : 'default',
                                    }}
                                >
                                    {component.thumbnailUrl ? (
                                        <img
                                            src={component.thumbnailUrl}
                                            alt={component.name}
                                            style={{ maxWidth: '100%', maxHeight: '320px', objectFit: 'contain' }}
                                        />
                                    ) : (
                                        <span style={{ color: '#ccc', fontSize: '12px', fontStyle: 'italic' }}>
                                            no artwork
                                        </span>
                                    )}
                                </div>

                                {/* Name */}
                                <div style={{ fontSize: '15px', fontWeight: 700, color: '#111', marginBottom: '10px' }}>
                                    {component.name}
                                </div>

                                {/* Specification list — one row per sub-item (production jobs)
                                    or VariantPicker (visual approval jobs) */}
                                {(job as any).job_type === 'visual_approval' ? (
                                    <VariantPicker
                                        componentName={component.name}
                                        variants={(component as any).variants ?? []}
                                        chosenVariantId={selections[component.id] ?? null}
                                        onChoose={(variantId) =>
                                            setSelections((prev) => ({ ...prev, [component.id]: variantId }))
                                        }
                                    />
                                ) : (
                                    component.sub_items && component.sub_items.length > 0 && (
                                        <div style={{
                                            border: '1px solid #eaeaea',
                                            borderRadius: '6px',
                                            overflow: 'hidden',
                                            marginTop: '6px',
                                        }}>
                                            <div style={{
                                                fontSize: '10px',
                                                fontWeight: 700,
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.08em',
                                                color: '#666',
                                                padding: '8px 12px',
                                                background: '#fafafa',
                                                borderBottom: '1px solid #eaeaea',
                                            }}>
                                                specification
                                            </div>
                                            {component.sub_items.map((si, i) => (
                                                <div
                                                    key={si.id}
                                                    style={{
                                                        padding: '12px',
                                                        borderTop: i === 0 ? 'none' : '1px solid #f0f0f0',
                                                        fontSize: '13px',
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '6px' }}>
                                                        <span style={{
                                                            fontFamily: 'ui-monospace, monospace',
                                                            fontWeight: 700,
                                                            fontSize: '11px',
                                                            background: '#111',
                                                            color: '#fff',
                                                            padding: '1px 6px',
                                                            borderRadius: '3px',
                                                            flexShrink: 0,
                                                        }}>
                                                            {si.label}
                                                        </span>
                                                        <span style={{ fontWeight: 600, color: '#111' }}>
                                                            {si.name || <span style={{ color: '#999', fontStyle: 'italic' }}>unnamed</span>}
                                                        </span>
                                                        {si.quantity > 1 && (
                                                            <span style={{ fontSize: '11px', color: '#666', marginLeft: 'auto' }}>
                                                                × {si.quantity}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <dl style={{
                                                        display: 'grid',
                                                        gridTemplateColumns: 'max-content 1fr',
                                                        rowGap: '3px',
                                                        columnGap: '10px',
                                                        fontSize: '12px',
                                                        margin: 0,
                                                        paddingLeft: '32px',
                                                    }}>
                                                        {si.material && (
                                                            <>
                                                                <dt style={{ color: '#888', fontWeight: 600 }}>Material</dt>
                                                                <dd style={{ margin: 0, color: '#111' }}>{si.material}</dd>
                                                            </>
                                                        )}
                                                        {si.application_method && (
                                                            <>
                                                                <dt style={{ color: '#888', fontWeight: 600 }}>Method</dt>
                                                                <dd style={{ margin: 0, color: '#111' }}>{si.application_method}</dd>
                                                            </>
                                                        )}
                                                        {si.finish && (
                                                            <>
                                                                <dt style={{ color: '#888', fontWeight: 600 }}>Finish</dt>
                                                                <dd style={{ margin: 0, color: '#111' }}>{si.finish}</dd>
                                                            </>
                                                        )}
                                                        {si.width_mm && si.height_mm && (
                                                            <>
                                                                <dt style={{ color: '#888', fontWeight: 600 }}>Size</dt>
                                                                <dd style={{ margin: 0, color: '#111', fontFamily: 'ui-monospace, monospace' }}>
                                                                    {si.width_mm} × {si.height_mm} mm
                                                                    {si.returns_mm ? ` · ${si.returns_mm}mm returns` : ''}
                                                                </dd>
                                                            </>
                                                        )}
                                                    </dl>
                                                </div>
                                            ))}
                                        </div>
                                    )
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Liability note — sits inside the component card, bottom */}
                    <div style={{
                        padding: '12px 20px',
                        fontSize: '12px',
                        color: '#555',
                        borderTop: '1px solid #eee',
                        background: '#fafafa',
                        lineHeight: 1.5,
                    }}>
                        <strong style={{ color: '#111' }}>What you&rsquo;re approving:</strong>{' '}
                        the artwork and the specification shown above for each component &mdash;
                        including material type (e.g. frosted vinyl vs. white vinyl), finish,
                        dimensions, and quantity. Please check each spec carefully before
                        signing. Once approved, production works to these specs and changes
                        may incur re-make costs.
                    </div>
                </div>
            )}

            {/* Approval Section */}
            {success ? (
                <div style={{
                    border: '2px solid #16a34a',
                    borderRadius: '8px',
                    padding: '32px',
                    textAlign: 'center',
                    background: '#f0fdf4',
                    marginBottom: '24px',
                }}>
                    <div style={{ fontSize: '24px', marginBottom: '8px', fontWeight: 700, color: '#16a34a' }}>Approved</div>
                    <p style={{ fontSize: '14px', color: '#555', marginBottom: '16px' }}>
                        {isApproved
                            ? `Approved by ${approval.client_name} on ${formatDateTime(approval.approved_at!)}`
                            : 'thank you — your approval has been recorded'}
                    </p>
                    {isApproved && approval.signature_data && (
                        <div style={{ display: 'inline-block', border: '1px solid #ddd', borderRadius: '4px', padding: '8px', background: '#fff' }}>
                            <img
                                src={approval.signature_data}
                                alt="Signature"
                                style={{ maxWidth: '300px', maxHeight: '100px' }}
                            />
                        </div>
                    )}
                </div>
            ) : (
                <div style={{
                    border: '1px solid #e5e5e5',
                    borderRadius: '8px',
                    padding: '24px',
                    background: '#fff',
                    marginBottom: '24px',
                }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#111', marginBottom: '4px' }}>
                        approve artwork
                    </h3>
                    <p style={{ fontSize: '13px', color: '#888', marginBottom: '20px' }}>
                        by signing below you confirm the artwork is approved for production
                    </p>

                    {error && (
                        <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#dc2626', fontSize: '13px', marginBottom: '16px' }}>
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#555', marginBottom: '4px' }}>
                                your name *
                            </label>
                            <input
                                type="text"
                                value={clientName}
                                onChange={(e) => setClientName(e.target.value)}
                                placeholder="Full name"
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    border: '1px solid #ddd',
                                    borderRadius: '6px',
                                    fontSize: '14px',
                                    outline: 'none',
                                }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#555', marginBottom: '4px' }}>
                                your email *
                            </label>
                            <input
                                type="email"
                                value={clientEmail}
                                onChange={(e) => setClientEmail(e.target.value)}
                                placeholder="email@company.com"
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    border: '1px solid #ddd',
                                    borderRadius: '6px',
                                    fontSize: '14px',
                                    outline: 'none',
                                }}
                            />
                        </div>
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#555', marginBottom: '4px' }}>
                            company
                        </label>
                        <input
                            type="text"
                            value={clientCompany}
                            onChange={(e) => setClientCompany(e.target.value)}
                            placeholder="Company name (optional)"
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                border: '1px solid #ddd',
                                borderRadius: '6px',
                                fontSize: '14px',
                                outline: 'none',
                            }}
                        />
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#555', marginBottom: '8px' }}>
                            signature *
                        </label>
                        <SignatureCanvas ref={signatureRef} />
                        <button
                            type="button"
                            onClick={() => signatureRef.current?.clear()}
                            style={{
                                marginTop: '8px',
                                padding: '6px 12px',
                                fontSize: '12px',
                                color: '#666',
                                background: '#f5f5f5',
                                border: '1px solid #ddd',
                                borderRadius: '4px',
                                cursor: 'pointer',
                            }}
                        >
                            clear signature
                        </button>
                    </div>

                    {(() => {
                        const allComponentsChosen = (job as any).job_type !== 'visual_approval' ||
                            ((job as any).components ?? components).every((c: any) => selections[c.id]);
                        const submitDisabled = isPending || !allComponentsChosen;
                        return (
                            <button
                                type="button"
                                onClick={handleSubmit}
                                disabled={submitDisabled}
                                style={{
                                    width: '100%',
                                    padding: '12px 32px',
                                    fontSize: '14px',
                                    fontWeight: 600,
                                    color: '#fff',
                                    background: submitDisabled ? '#888' : '#111',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: submitDisabled ? 'not-allowed' : 'pointer',
                                }}
                            >
                                {isPending ? 'submitting...' : 'approve artwork'}
                            </button>
                        );
                    })()}
                </div>
            )}

            <div style={{ textAlign: 'center', padding: '16px', fontSize: '12px', color: '#bbb' }}>
                onesign &amp; digital &middot; team valley, gateshead
            </div>
        </div>
    );
}
