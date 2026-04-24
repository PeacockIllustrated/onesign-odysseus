'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
    signOffSubItemProduction,
    requestSubItemProductionChanges,
    type ProductionApprovalPack,
    type ProductionApprovalSubItem,
} from '@/lib/artwork/production-approval-actions';

interface Props {
    data: ProductionApprovalPack;
    token: string;
}

export default function ProductionApprovalView({ data, token }: Props) {
    const completed = !!data.approval.completed_at;
    const totalSubItems = data.components.reduce(
        (acc, c) => acc + c.sub_items.length,
        0
    );
    const signedSubItems = data.components.reduce(
        (acc, c) => acc + c.sub_items.filter((s) => s.production_signed_off_at).length,
        0
    );
    const pendingChanges = data.components.reduce(
        (acc, c) => acc + c.sub_items.filter((s) => s.production_changes_requested_at).length,
        0
    );

    return (
        <div style={{ maxWidth: '880px', margin: '0 auto', padding: '0 16px' }}>
            <header
                style={{
                    background: '#fff',
                    border: '1px solid #e5e5e5',
                    borderRadius: '8px',
                    padding: '20px',
                    marginBottom: '20px',
                }}
            >
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#4e7e8c', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
                    production sign-off
                </div>
                <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#111', marginBottom: '6px' }}>
                    {data.job.job_name}
                </h1>
                <div style={{ fontSize: '13px', color: '#666' }}>
                    {data.job.job_reference}
                    {data.job.client_name ? ` — ${data.job.client_name}` : ''}
                </div>
                <div style={{ display: 'flex', gap: '16px', marginTop: '16px', fontSize: '12px', flexWrap: 'wrap' }}>
                    <Stat
                        label="signed off"
                        value={`${signedSubItems}/${totalSubItems}`}
                        tone={signedSubItems === totalSubItems && totalSubItems > 0 ? 'ok' : 'neutral'}
                    />
                    <Stat
                        label="changes requested"
                        value={String(pendingChanges)}
                        tone={pendingChanges > 0 ? 'warn' : 'neutral'}
                    />
                    {completed && (
                        <div style={{
                            marginLeft: 'auto',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#047857',
                            background: '#ecfdf5',
                            border: '1px solid #a7f3d0',
                            borderRadius: '999px',
                            padding: '4px 10px',
                        }}>
                            complete — all components approved
                        </div>
                    )}
                </div>
            </header>

            {data.components.length === 0 && (
                <div style={{ background: '#fff', padding: '24px', border: '1px solid #e5e5e5', borderRadius: '8px', color: '#888', fontSize: '13px' }}>
                    no components on this job yet.
                </div>
            )}

            {data.components.map((component, idx) => (
                <ComponentBlock
                    key={component.id}
                    component={component}
                    index={idx}
                    token={token}
                    locked={completed || !!data.approval.revoked_at}
                />
            ))}
        </div>
    );
}

function Stat({
    label,
    value,
    tone,
}: {
    label: string;
    value: string;
    tone: 'ok' | 'warn' | 'neutral';
}) {
    const colour = tone === 'ok' ? '#047857' : tone === 'warn' ? '#b45309' : '#555';
    return (
        <div>
            <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#999' }}>
                {label}
            </div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: colour }}>{value}</div>
        </div>
    );
}

function ComponentBlock({
    component,
    index,
    token,
    locked,
}: {
    component: ProductionApprovalPack['components'][number];
    index: number;
    token: string;
    locked: boolean;
}) {
    const allSigned =
        component.sub_items.length > 0 &&
        component.sub_items.every((s) => s.production_signed_off_at);
    const anyChanges = component.sub_items.some(
        (s) => s.production_changes_requested_at
    );

    const borderColour = allSigned
        ? '#10b981'
        : anyChanges
        ? '#f59e0b'
        : '#e5e5e5';
    const bgTint = allSigned ? '#f0fdf4' : anyChanges ? '#fffbeb' : '#fff';

    return (
        <section
            style={{
                background: bgTint,
                border: `2px solid ${borderColour}`,
                borderRadius: '8px',
                padding: '18px',
                marginBottom: '14px',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#999' }}>
                    {String(index + 1).padStart(2, '0')}
                </span>
                <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#111' }}>
                    {component.name}
                </h2>
                <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#999' }}>
                    {component.component_type}
                </span>
                {allSigned && (
                    <span style={{ marginLeft: 'auto', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', background: '#10b981', color: '#fff', padding: '3px 8px', borderRadius: '4px' }}>
                        signed off
                    </span>
                )}
                {anyChanges && !allSigned && (
                    <span style={{ marginLeft: 'auto', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', background: '#f59e0b', color: '#fff', padding: '3px 8px', borderRadius: '4px' }}>
                        changes requested
                    </span>
                )}
            </div>

            {component.thumbnail_url && (
                <div style={{ marginBottom: '14px', borderRadius: '6px', overflow: 'hidden', border: '1px solid #e5e5e5', background: '#fafafa' }}>
                    <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#666', padding: '6px 10px', background: '#f5f5f5', borderBottom: '1px solid #e5e5e5' }}>
                        component overview
                    </div>
                    <img
                        src={component.thumbnail_url}
                        alt={`${component.name} — overview`}
                        style={{
                            width: '100%',
                            maxHeight: '420px',
                            objectFit: 'contain',
                            display: 'block',
                            background: '#fff',
                        }}
                    />
                </div>
            )}

            {component.sub_items.length > 0 && (
                <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#666', marginBottom: '8px' }}>
                    sub-items — breakdown of this component
                </div>
            )}

            {component.sub_items.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#999' }}>
                    no sub-items on this component.
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {component.sub_items.map((si) => (
                        <SubItemRow
                            key={si.id}
                            subItem={si}
                            token={token}
                            locked={locked}
                        />
                    ))}
                </div>
            )}
        </section>
    );
}

function SubItemRow({
    subItem,
    token,
    locked,
}: {
    subItem: ProductionApprovalSubItem;
    token: string;
    locked: boolean;
}) {
    const router = useRouter();
    const [material, setMaterial] = useState(subItem.material ?? '');
    const [comment, setComment] = useState(subItem.production_changes_comment ?? '');
    const [showReject, setShowReject] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const signed = !!subItem.production_signed_off_at;
    const changesRequested = !!subItem.production_changes_requested_at;
    const rowBorder = signed ? '#10b981' : changesRequested ? '#f59e0b' : '#e5e5e5';
    const rowBg = signed ? '#f0fdf4' : changesRequested ? '#fffbeb' : '#fff';

    const handleApprove = () => {
        setError(null);
        startTransition(async () => {
            const res = await signOffSubItemProduction(token, subItem.id, { material });
            if ('error' in res) setError(res.error);
            else router.refresh();
        });
    };

    const handleRequestChanges = () => {
        setError(null);
        startTransition(async () => {
            const res = await requestSubItemProductionChanges(token, subItem.id, comment);
            if ('error' in res) setError(res.error);
            else {
                setShowReject(false);
                router.refresh();
            }
        });
    };

    const specLine = [
        subItem.width_mm && subItem.height_mm
            ? `${subItem.width_mm} × ${subItem.height_mm}mm`
            : null,
        subItem.returns_mm ? `${subItem.returns_mm}mm returns` : null,
        subItem.application_method,
        subItem.finish,
        subItem.quantity > 1 ? `qty ${subItem.quantity}` : null,
    ].filter(Boolean).join(' · ');

    return (
        <div
            style={{
                background: rowBg,
                border: `1px solid ${rowBorder}`,
                borderRadius: '6px',
                padding: '12px',
                display: 'flex',
                gap: '12px',
                alignItems: 'flex-start',
            }}
        >
            {subItem.thumbnail_url && (
                <img
                    src={subItem.thumbnail_url}
                    alt={subItem.name ?? subItem.label}
                    style={{
                        width: '64px',
                        height: '64px',
                        objectFit: 'cover',
                        borderRadius: '4px',
                        border: '1px solid #e5e5e5',
                        flexShrink: 0,
                    }}
                />
            )}

            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 700, background: '#111', color: '#fff', padding: '2px 6px', borderRadius: '3px' }}>
                        {subItem.label}
                    </span>
                    {subItem.name && (
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#111' }}>
                            {subItem.name}
                        </span>
                    )}
                </div>
                {specLine && (
                    <div style={{ fontSize: '11px', color: '#666', marginBottom: '8px' }}>
                        {specLine}
                    </div>
                )}
                {subItem.notes && (
                    <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px', fontStyle: 'italic' }}>
                        {subItem.notes}
                    </div>
                )}

                <label style={{ display: 'block', marginBottom: '8px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#666', display: 'block', marginBottom: '3px' }}>
                        material {subItem.material ? '' : '— fill in if blank'}
                    </span>
                    <input
                        type="text"
                        value={material}
                        onChange={(e) => setMaterial(e.target.value)}
                        disabled={locked || isPending || signed}
                        placeholder="e.g. 3mm white ACM"
                        style={{
                            width: '100%',
                            fontSize: '12px',
                            padding: '6px 8px',
                            border: '1px solid #d4d4d4',
                            borderRadius: '4px',
                            background: signed || locked ? '#f5f5f5' : '#fff',
                            color: '#111',
                        }}
                    />
                </label>

                {changesRequested && subItem.production_changes_comment && !showReject && (
                    <div style={{ fontSize: '12px', color: '#92400e', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '4px', padding: '8px', marginBottom: '8px', whiteSpace: 'pre-wrap' }}>
                        <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>
                            changes requested
                        </div>
                        {subItem.production_changes_comment}
                    </div>
                )}

                {showReject && (
                    <div style={{ marginBottom: '8px' }}>
                        <textarea
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            disabled={locked || isPending}
                            placeholder="describe what's wrong and what needs to change"
                            rows={3}
                            style={{
                                width: '100%',
                                fontSize: '12px',
                                padding: '8px',
                                border: '1px solid #fcd34d',
                                borderRadius: '4px',
                                background: '#fffbeb',
                                fontFamily: 'inherit',
                                resize: 'vertical',
                            }}
                        />
                    </div>
                )}

                {error && (
                    <div style={{ fontSize: '11px', color: '#b91c1c', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '4px', padding: '6px 8px', marginBottom: '8px' }}>
                        {error}
                    </div>
                )}

                {!locked && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {!showReject && (
                            <button
                                onClick={handleApprove}
                                disabled={isPending}
                                style={{
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.06em',
                                    padding: '6px 12px',
                                    border: 'none',
                                    borderRadius: '4px',
                                    background: signed ? '#047857' : '#10b981',
                                    color: '#fff',
                                    cursor: isPending ? 'wait' : 'pointer',
                                    opacity: isPending ? 0.6 : 1,
                                }}
                            >
                                {signed ? 're-sign' : 'approve & release'}
                            </button>
                        )}
                        {!showReject && !changesRequested && (
                            <button
                                onClick={() => setShowReject(true)}
                                disabled={isPending}
                                style={{
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.06em',
                                    padding: '6px 12px',
                                    border: '1px solid #f59e0b',
                                    borderRadius: '4px',
                                    background: '#fff',
                                    color: '#b45309',
                                    cursor: 'pointer',
                                }}
                            >
                                request changes
                            </button>
                        )}
                        {showReject && (
                            <>
                                <button
                                    onClick={handleRequestChanges}
                                    disabled={isPending}
                                    style={{
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.06em',
                                        padding: '6px 12px',
                                        border: 'none',
                                        borderRadius: '4px',
                                        background: '#f59e0b',
                                        color: '#fff',
                                        cursor: isPending ? 'wait' : 'pointer',
                                        opacity: isPending ? 0.6 : 1,
                                    }}
                                >
                                    submit changes request
                                </button>
                                <button
                                    onClick={() => {
                                        setShowReject(false);
                                        setComment(subItem.production_changes_comment ?? '');
                                    }}
                                    disabled={isPending}
                                    style={{
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        padding: '6px 10px',
                                        border: '1px solid #d4d4d4',
                                        borderRadius: '4px',
                                        background: '#fff',
                                        color: '#555',
                                        cursor: 'pointer',
                                    }}
                                >
                                    cancel
                                </button>
                            </>
                        )}
                        {changesRequested && !showReject && (
                            <button
                                onClick={() => setShowReject(true)}
                                disabled={isPending}
                                style={{
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    padding: '6px 10px',
                                    border: '1px solid #d4d4d4',
                                    borderRadius: '4px',
                                    background: '#fff',
                                    color: '#555',
                                    cursor: 'pointer',
                                }}
                            >
                                edit comment
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
