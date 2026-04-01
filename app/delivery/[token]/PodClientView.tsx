'use client';

import { useState, useRef, useTransition } from 'react';
import { submitPod, refusePod } from '@/lib/deliveries/actions';
import type { PodPageData } from '@/lib/deliveries/types';
import SignatureCanvas, { type SignatureCanvasRef } from '@/components/SignatureCanvas';

interface Props {
    token: string;
    data: PodPageData;
}

function formatDate(dateStr: string): string {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

export function PodClientView({ token, data }: Props) {
    const [signedBy, setSignedBy] = useState('');
    const [notes, setNotes] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [refused, setRefused] = useState(false);
    const [isPending, startTransition] = useTransition();
    const signatureRef = useRef<SignatureCanvasRef>(null);

    const handleConfirm = () => {
        setError(null);

        if (!signedBy.trim()) {
            setError('Please enter your name');
            return;
        }
        if (signatureRef.current?.isEmpty()) {
            setError('Please draw your signature');
            return;
        }

        const signatureData = signatureRef.current?.toDataURL() || '';

        startTransition(async () => {
            const result = await submitPod(token, {
                signed_by: signedBy.trim(),
                signature_data: signatureData,
                notes: notes.trim() || undefined,
            });

            if ('error' in result) {
                setError(result.error);
            } else {
                setSuccess(true);
            }
        });
    };

    const handleRefuse = () => {
        setError(null);

        startTransition(async () => {
            const result = await refusePod(token, notes.trim() || undefined);

            if ('error' in result) {
                setError(result.error);
            } else {
                setRefused(true);
            }
        });
    };

    // Success state
    if (success) {
        return (
            <div style={{
                minHeight: '100vh',
                background: '#f5f5f5',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px',
            }}>
                <div style={{
                    maxWidth: '480px',
                    width: '100%',
                    background: '#fff',
                    borderRadius: '12px',
                    padding: '40px 24px',
                    textAlign: 'center',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                }}>
                    <div style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: '50%',
                        background: '#dcfce7',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 16px',
                        fontSize: '32px',
                    }}>
                        &#9989;
                    </div>
                    <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#111', marginBottom: '8px' }}>
                        Delivery Confirmed
                    </h1>
                    <p style={{ fontSize: '14px', color: '#666', marginBottom: '4px' }}>
                        Signed by <strong>{signedBy}</strong>
                    </p>
                    <p style={{ fontSize: '12px', color: '#999' }}>
                        {data.delivery_number}
                    </p>
                </div>
            </div>
        );
    }

    // Refused state
    if (refused) {
        return (
            <div style={{
                minHeight: '100vh',
                background: '#f5f5f5',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px',
            }}>
                <div style={{
                    maxWidth: '480px',
                    width: '100%',
                    background: '#fff',
                    borderRadius: '12px',
                    padding: '40px 24px',
                    textAlign: 'center',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                }}>
                    <div style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: '50%',
                        background: '#fee2e2',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 16px',
                        fontSize: '32px',
                    }}>
                        &#10060;
                    </div>
                    <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#111', marginBottom: '8px' }}>
                        Delivery Refused
                    </h1>
                    <p style={{ fontSize: '14px', color: '#666' }}>
                        The delivery has been marked as refused.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div style={{
            minHeight: '100vh',
            background: '#f5f5f5',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            paddingTop: '20px',
            paddingBottom: '40px',
        }}>
            <div style={{ maxWidth: '480px', margin: '0 auto', padding: '0 16px' }}>

                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                    <div style={{ marginBottom: '4px', display: 'flex', justifyContent: 'center' }}>
                        <img src="/logo-black.svg" alt="Onesign" style={{ height: '18px', width: 'auto' }} />
                    </div>
                    <div style={{
                        fontSize: '10px',
                        color: '#4e7e8c',
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                        fontWeight: 600,
                    }}>
                        Proof of Delivery
                    </div>
                </div>

                {/* Delivery Summary Card */}
                <div style={{
                    background: '#fff',
                    borderRadius: '12px',
                    padding: '20px',
                    marginBottom: '16px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#999', fontWeight: 600, marginBottom: '2px' }}>
                                Delivery No.
                            </div>
                            <div style={{ fontSize: '15px', fontWeight: 700, color: '#111' }}>
                                {data.delivery_number}
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#999', fontWeight: 600, marginBottom: '2px' }}>
                                Scheduled
                            </div>
                            <div style={{ fontSize: '15px', fontWeight: 600, color: '#111' }}>
                                {formatDate(data.scheduled_date)}
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#999', fontWeight: 600, marginBottom: '2px' }}>
                                Job
                            </div>
                            <div style={{ fontSize: '14px', fontWeight: 500, color: '#333' }}>
                                {data.job_number}
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#999', fontWeight: 600, marginBottom: '2px' }}>
                                Client
                            </div>
                            <div style={{ fontSize: '14px', fontWeight: 500, color: '#333' }}>
                                {data.client_name}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Items List */}
                <div style={{
                    background: '#fff',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    marginBottom: '16px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #eee' }}>
                        <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#111', margin: 0 }}>
                            Items ({data.items.length})
                        </h2>
                    </div>
                    {data.items.length > 0 ? (
                        data.items.map((item, index) => (
                            <div
                                key={index}
                                style={{
                                    padding: '14px 20px',
                                    borderBottom: index < data.items.length - 1 ? '1px solid #f0f0f0' : 'none',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                }}
                            >
                                <div style={{ fontSize: '14px', color: '#333', flex: 1 }}>
                                    {item.description}
                                </div>
                                <div style={{
                                    fontSize: '14px',
                                    fontWeight: 600,
                                    color: '#111',
                                    marginLeft: '16px',
                                    whiteSpace: 'nowrap',
                                }}>
                                    x{item.quantity}
                                </div>
                            </div>
                        ))
                    ) : (
                        <div style={{ padding: '20px', textAlign: 'center', color: '#999', fontSize: '13px' }}>
                            No items listed
                        </div>
                    )}
                </div>

                {/* Delivery Address */}
                {data.site && (
                    <div style={{
                        background: '#fff',
                        borderRadius: '12px',
                        padding: '16px 20px',
                        marginBottom: '16px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    }}>
                        <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#999', fontWeight: 600, marginBottom: '8px' }}>
                            Delivery Address
                        </div>
                        <div style={{ fontSize: '14px', color: '#333', lineHeight: 1.6 }}>
                            <div style={{ fontWeight: 600 }}>{data.site.name}</div>
                            {data.site.address_line_1 && <div>{data.site.address_line_1}</div>}
                            {data.site.address_line_2 && <div>{data.site.address_line_2}</div>}
                            {(data.site.city || data.site.postcode) && (
                                <div>{[data.site.city, data.site.county, data.site.postcode].filter(Boolean).join(', ')}</div>
                            )}
                        </div>
                    </div>
                )}

                {/* Driver Notes */}
                {data.notes_driver && (
                    <div style={{
                        background: '#fefce8',
                        borderRadius: '12px',
                        padding: '16px 20px',
                        marginBottom: '16px',
                        border: '1px solid #fde68a',
                    }}>
                        <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#92400e', fontWeight: 600, marginBottom: '6px' }}>
                            Driver Notes
                        </div>
                        <div style={{ fontSize: '14px', color: '#78350f', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                            {data.notes_driver}
                        </div>
                    </div>
                )}

                {/* Signature Form */}
                {data.pod_status === 'pending' && (
                    <div style={{
                        background: '#fff',
                        borderRadius: '12px',
                        padding: '20px',
                        marginBottom: '16px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    }}>
                        <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#111', marginBottom: '4px' }}>
                            Confirm Delivery
                        </h3>
                        <p style={{ fontSize: '13px', color: '#888', marginBottom: '20px' }}>
                            Sign below to confirm receipt of the items listed above.
                        </p>

                        {/* Error Banner */}
                        {error && (
                            <div style={{
                                padding: '12px 16px',
                                background: '#fef2f2',
                                border: '1px solid #fecaca',
                                borderRadius: '8px',
                                color: '#dc2626',
                                fontSize: '14px',
                                marginBottom: '16px',
                            }}>
                                {error}
                            </div>
                        )}

                        {/* Received By */}
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#555', marginBottom: '6px' }}>
                                Received by *
                            </label>
                            <input
                                type="text"
                                value={signedBy}
                                onChange={(e) => setSignedBy(e.target.value)}
                                placeholder="Full name"
                                style={{
                                    width: '100%',
                                    padding: '14px 16px',
                                    border: '1px solid #ddd',
                                    borderRadius: '8px',
                                    fontSize: '16px',
                                    outline: 'none',
                                    boxSizing: 'border-box',
                                }}
                            />
                        </div>

                        {/* Signature Canvas */}
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#555', marginBottom: '8px' }}>
                                Signature *
                            </label>
                            <SignatureCanvas ref={signatureRef} height={200} />
                            <button
                                type="button"
                                onClick={() => signatureRef.current?.clear()}
                                style={{
                                    marginTop: '8px',
                                    padding: '8px 14px',
                                    fontSize: '13px',
                                    color: '#666',
                                    background: '#f5f5f5',
                                    border: '1px solid #ddd',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                }}
                            >
                                Clear
                            </button>
                        </div>

                        {/* Notes */}
                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#555', marginBottom: '6px' }}>
                                Notes (optional)
                            </label>
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Any notes about the delivery..."
                                rows={3}
                                style={{
                                    width: '100%',
                                    padding: '12px 16px',
                                    border: '1px solid #ddd',
                                    borderRadius: '8px',
                                    fontSize: '14px',
                                    outline: 'none',
                                    resize: 'vertical',
                                    boxSizing: 'border-box',
                                }}
                            />
                        </div>

                        {/* Confirm Button */}
                        <button
                            type="button"
                            onClick={handleConfirm}
                            disabled={isPending}
                            style={{
                                width: '100%',
                                minHeight: '56px',
                                padding: '16px 32px',
                                fontSize: '16px',
                                fontWeight: 700,
                                color: '#fff',
                                background: isPending ? '#86efac' : '#16a34a',
                                border: 'none',
                                borderRadius: '10px',
                                cursor: isPending ? 'not-allowed' : 'pointer',
                                marginBottom: '12px',
                            }}
                        >
                            {isPending ? 'Submitting...' : 'Confirm Delivery'}
                        </button>

                        {/* Refuse Button */}
                        <button
                            type="button"
                            onClick={handleRefuse}
                            disabled={isPending}
                            style={{
                                width: '100%',
                                padding: '12px 32px',
                                fontSize: '14px',
                                fontWeight: 600,
                                color: isPending ? '#fca5a5' : '#dc2626',
                                background: 'transparent',
                                border: isPending ? '1px solid #fca5a5' : '1px solid #dc2626',
                                borderRadius: '10px',
                                cursor: isPending ? 'not-allowed' : 'pointer',
                            }}
                        >
                            {isPending ? 'Submitting...' : 'Refuse Delivery'}
                        </button>
                    </div>
                )}

                {/* Footer */}
                <div style={{ textAlign: 'center', padding: '12px', fontSize: '12px', color: '#ccc' }}>
                    powered by onesign & digital
                </div>
            </div>
        </div>
    );
}
