'use client';

import { useState, useRef, useTransition, useCallback, useEffect } from 'react';
import { submitApproval } from '@/lib/artwork/approval-actions';
import type { ApprovalPackData } from '@/lib/artwork/approval-actions';
import { formatDateTime } from '@/lib/artwork/utils';
import SignatureCanvas, { type SignatureCanvasRef } from '@/components/SignatureCanvas';

interface Props {
    data: ApprovalPackData;
    token: string;
}

export default function ApprovalClientView({ data, token }: Props) {
    const { approval, job, components, coverImageUrl } = data;
    const isApproved = approval.status === 'approved';

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
            const result = await submitApproval(token, {
                client_name: clientName.trim(),
                client_email: clientEmail.trim(),
                client_company: clientCompany.trim() || undefined,
                signature_data: signatureData,
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

            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                <div style={{ marginBottom: '4px', display: 'flex', justifyContent: 'center' }}>
                    <img src="/logo-black.svg" alt="OneSign" style={{ height: '18px', width: 'auto' }} />
                </div>
                <div style={{ fontSize: '10px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
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

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: components.length === 1 ? '1fr' : 'repeat(2, 1fr)',
                        gap: '1px',
                        background: '#eee',
                    }}>
                        {components.map((component) => (
                            <div key={component.id} style={{ background: '#fff', padding: '16px' }}>
                                {/* Thumbnail */}
                                <div
                                    onClick={() => component.thumbnailUrl && openLightbox(component.thumbnailUrl, component.name)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        background: '#fafafa',
                                        borderRadius: '6px',
                                        height: '160px',
                                        marginBottom: '10px',
                                        overflow: 'hidden',
                                        cursor: component.thumbnailUrl ? 'zoom-in' : 'default',
                                    }}
                                >
                                    {component.thumbnailUrl ? (
                                        <img
                                            src={component.thumbnailUrl}
                                            alt={component.name}
                                            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                                        />
                                    ) : (
                                        <span style={{ color: '#ccc', fontSize: '12px', fontStyle: 'italic' }}>
                                            no artwork
                                        </span>
                                    )}
                                </div>

                                {/* Name */}
                                <div style={{ fontSize: '13px', fontWeight: 600, color: '#111' }}>
                                    {component.name}
                                </div>
                            </div>
                        ))}
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

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
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

                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={isPending}
                        style={{
                            width: '100%',
                            padding: '12px 32px',
                            fontSize: '14px',
                            fontWeight: 600,
                            color: '#fff',
                            background: isPending ? '#888' : '#111',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: isPending ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {isPending ? 'submitting...' : 'approve artwork'}
                    </button>
                </div>
            )}

            <div style={{ textAlign: 'center', padding: '12px', fontSize: '12px', color: '#ccc' }}>
                powered by onesign & digital
            </div>
        </div>
    );
}
