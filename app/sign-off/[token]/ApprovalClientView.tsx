'use client';

import { useState, useRef, useTransition, useCallback, useEffect } from 'react';
import { submitApproval, requestApprovalChanges } from '@/lib/artwork/approval-actions';
import type { ApprovalPackData } from '@/lib/artwork/approval-actions';
import { VariantPicker } from './components/VariantPicker';
import { ResilientImage } from './components/ResilientImage';
import { formatDateTime } from '@/lib/artwork/utils';
import SignatureCanvas, { type SignatureCanvasRef } from '@/components/SignatureCanvas';

interface Props {
    data: ApprovalPackData;
    token: string;
}

type LineDecision = 'approved' | 'changes_requested';

/**
 * Identify a decision row by sub-item id when present, else by component id.
 * Both are UUIDs so they never collide.
 */
function keyFor(componentId: string, subItemId?: string | null): string {
    return subItemId ?? componentId;
}

export default function ApprovalClientView({ data, token }: Props) {
    const { approval, job, components, coverImageUrl } = data;
    const isApproved = approval.status === 'approved';
    const isVisual = job.job_type === 'visual_approval';

    // For visual approval jobs we hide spec detail and cover image and let
    // the sub-item thumbnails carry the review. The per-sub-item decision
    // buttons are identical on both paths.
    const hideSpecDetail = isVisual;
    const hideCover = isVisual;

    // Variant-picker path (visual_approval jobs wired up with artwork_variants)
    // stays intact — those are single-choice, not approve/request-changes.
    const hasVariants = isVisual && components.some((c) => (c.variants ?? []).length > 0);

    // Build the flat list of decide-able rows: one per sub-item, or one
    // per component if the component has no sub-items.
    const decisionRows = components.flatMap((c) => {
        const subs = c.sub_items ?? [];
        if (subs.length > 0) {
            return subs.map((si) => ({ component: c, subItem: si, key: si.id }));
        }
        return [{ component: c, subItem: null as (typeof c.sub_items)[number] | null, key: c.id }];
    });

    const [decisions, setDecisions] = useState<Record<string, LineDecision>>({});
    const [comments, setComments] = useState<Record<string, string>>({});
    const [selections, setSelections] = useState<Record<string, string>>({}); // variant-picker path only

    // Collapsed-by-default: forces the client to open each component before
    // they can review it, which makes it obvious that the images inside one
    // card belong to that component only — not the one above or below.
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const toggleExpanded = (id: string) => setExpanded((p) => ({ ...p, [id]: !p[id] }));
    const expandAll = () => setExpanded(
        Object.fromEntries(components.map((c) => [c.id, true]))
    );
    const collapseAll = () => setExpanded({});

    const [clientName, setClientName] = useState('');
    const [clientEmail, setClientEmail] = useState('');
    const [clientCompany, setClientCompany] = useState('');
    const [clientComments, setClientComments] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(isApproved);
    const [isPending, startTransition] = useTransition();
    const signatureRef = useRef<SignatureCanvasRef>(null);

    const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
    const [lightboxAlt, setLightboxAlt] = useState('');
    const openLightbox = useCallback((src: string, alt: string) => {
        setLightboxSrc(src); setLightboxAlt(alt);
    }, []);
    const closeLightbox = useCallback(() => { setLightboxSrc(null); setLightboxAlt(''); }, []);

    useEffect(() => {
        if (!lightboxSrc) return;
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeLightbox(); };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [lightboxSrc, closeLightbox]);

    /**
     * Toggle-friendly setter.
     *   * Clicking the already-selected decision unsets it (lets the client
     *     change their mind without jumping through a "reset" button).
     *   * On visual approval jobs a component's sub-items are mutually
     *     exclusive for the "approved" state — they're variants of the
     *     same artwork, so only one can be picked. Approving a new sibling
     *     automatically unapproves any sibling that was previously approved.
     */
    const setDecision = (key: string, decision: LineDecision, componentId?: string) => {
        setDecisions((p) => {
            const next = { ...p };
            if (next[key] === decision) {
                delete next[key];
                // Also drop any comment that was tied to the cleared row.
                setComments((pc) => {
                    const { [key]: _, ...rest } = pc;
                    return rest;
                });
                return next;
            }
            if (decision === 'approved' && isVisual && componentId) {
                const component = components.find((c) => c.id === componentId);
                const siblingKeys = (component?.sub_items ?? []).map((si) => si.id);
                for (const sk of siblingKeys) {
                    if (sk !== key && next[sk] === 'approved') {
                        delete next[sk];
                    }
                }
            }
            next[key] = decision;
            return next;
        });
    };

    // Validation. Visual approval treats sub-items as variants — a component
    // is "done" if one variant was picked OR at least one variant was marked
    // changes_requested. Production artwork still requires every sub-item to
    // be individually decided.
    const componentComplete = (c: (typeof components)[number]): boolean => {
        const subs = c.sub_items ?? [];
        if (subs.length === 0) return !!decisions[c.id];
        if (isVisual) {
            const approvedCount = subs.filter((si) => decisions[si.id] === 'approved').length;
            const anyChanges = subs.some((si) => decisions[si.id] === 'changes_requested');
            return approvedCount === 1 || anyChanges;
        }
        return subs.every((si) => !!decisions[si.id]);
    };

    const allLinesDecided = hasVariants
        ? components.every((c) => selections[c.id])
        : components.every(componentComplete);

    const anyChangesRequested = !hasVariants && decisionRows.some((r) => decisions[r.key] === 'changes_requested');
    const missingChangeComments = !hasVariants && decisionRows.some(
        (r) => decisions[r.key] === 'changes_requested' && !(comments[r.key] ?? '').trim()
    );

    // Visual jobs: block submit if someone approved two variants within the
    // same component. The UI shouldn't let this happen (setDecision clears
    // siblings) but guard anyway.
    const multipleApprovedInComponent = isVisual && components.some((c) => {
        const approvedCount = (c.sub_items ?? []).filter((si) => decisions[si.id] === 'approved').length;
        return approvedCount > 1;
    });

    const handleSubmit = () => {
        setError(null);
        if (!clientName.trim()) return setError('please enter your name');
        if (!clientEmail.trim()) return setError('please enter your email');
        if (multipleApprovedInComponent) return setError('only one option per component can be approved — unselect the others first');
        if (!allLinesDecided) return setError(
            hasVariants
                ? 'please choose an option for every component'
                : isVisual
                ? 'please approve one option per component, or request changes'
                : 'please mark every item approved or changes requested'
        );
        if (missingChangeComments) return setError('please describe the changes you need for every item marked "changes requested"');
        if (signatureRef.current?.isEmpty()) return setError('please draw your signature');

        const signatureData = signatureRef.current?.toDataURL() || '';

        startTransition(async () => {
            const variant_selections = Object.entries(selections).map(([componentId, variantId]) => ({ componentId, variantId }));
            const component_decisions = hasVariants ? [] : decisionRows.map((r) => ({
                componentId: r.component.id,
                subItemId: r.subItem?.id ?? null,
                decision: decisions[r.key] as LineDecision,
                comment: (comments[r.key] ?? '').trim() || null,
            }));

            const result = await submitApproval(token, {
                client_name: clientName.trim(),
                client_email: clientEmail.trim(),
                client_company: clientCompany.trim() || undefined,
                signature_data: signatureData,
                client_comments: clientComments.trim() || undefined,
                component_decisions,
                variant_selections,
            });

            if ('error' in result) setError(result.error);
            else setSuccess(true);
        });
    };

    const handleRequestChangesOverall = () => {
        setError(null);
        const bulk = clientComments.trim();
        if (!bulk) return setError('please describe the changes you need');
        if (!clientName.trim()) return setError('please enter your name');
        if (!clientEmail.trim()) return setError('please enter your email');
        startTransition(async () => {
            const result = await requestApprovalChanges(token, {
                client_name: clientName.trim(),
                client_email: clientEmail.trim(),
                client_comments: bulk,
            });
            if ('error' in result) setError(result.error);
            else setSuccess(true);
        });
    };

    const DecisionButtons = ({ k, componentId }: { k: string; componentId?: string }) => {
        if (success) return null;
        const dec = decisions[k];
        return (
            <div style={{ marginTop: '12px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button type="button" onClick={() => setDecision(k, 'approved', componentId)}
                        title={dec === 'approved' ? 'click again to unselect' : undefined}
                        style={{
                            flex: 1, padding: '9px 12px', fontSize: '13px', fontWeight: 600,
                            borderRadius: '6px', cursor: 'pointer',
                            border: dec === 'approved' ? '2px solid #16a34a' : '1px solid #d4d4d4',
                            background: dec === 'approved' ? '#16a34a' : '#fff',
                            color: dec === 'approved' ? '#fff' : '#333',
                    }}>{dec === 'approved' ? '✓ approved (click to unselect)' : '✓ approve this'}</button>
                    <button type="button" onClick={() => setDecision(k, 'changes_requested', componentId)}
                        title={dec === 'changes_requested' ? 'click again to unselect' : undefined}
                        style={{
                            flex: 1, padding: '9px 12px', fontSize: '13px', fontWeight: 600,
                            borderRadius: '6px', cursor: 'pointer',
                            border: dec === 'changes_requested' ? '2px solid #d97706' : '1px solid #d4d4d4',
                            background: dec === 'changes_requested' ? '#d97706' : '#fff',
                            color: dec === 'changes_requested' ? '#fff' : '#333',
                    }}>{dec === 'changes_requested' ? 'changes requested (click to unselect)' : 'request changes'}</button>
                </div>
                {dec === 'changes_requested' && (
                    <textarea
                        value={comments[k] ?? ''}
                        onChange={(e) => setComments((p) => ({ ...p, [k]: e.target.value }))}
                        rows={3}
                        maxLength={2000}
                        placeholder="What needs to change here?"
                        style={{ width: '100%', padding: '10px 12px', border: '1px solid #e0d5a0', background: '#fffdf5', borderRadius: '6px', fontSize: '13px', outline: 'none', fontFamily: 'inherit', resize: 'vertical', minHeight: '64px', marginTop: '8px' }}
                    />
                )}
            </div>
        );
    };

    return (
        <div style={{ maxWidth: '720px', margin: '0 auto', padding: '20px' }}>
            {lightboxSrc && (
                <div onClick={closeLightbox} style={{
                    position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out', padding: '24px',
                }}>
                    <button onClick={closeLightbox} style={{
                        position: 'absolute', top: '16px', right: '20px', background: 'none', border: 'none',
                        color: '#fff', fontSize: '32px', cursor: 'pointer', lineHeight: 1, opacity: 0.7,
                    }} aria-label="Close">×</button>
                    <ResilientImage src={lightboxSrc} alt={lightboxAlt} onClick={(e) => e.stopPropagation()}
                        style={{ maxWidth: '95vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '4px', cursor: 'default' }} />
                </div>
            )}

            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                <div style={{ marginBottom: '10px', display: 'flex', justifyContent: 'center' }}>
                    <img src="/Onesign-Logo-Black.svg" alt="Onesign & Digital" style={{ height: '56px', width: 'auto', maxWidth: '320px' }} />
                </div>
                <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.14em', fontWeight: 600 }}>
                    {isVisual ? 'artwork visual approval' : 'artwork sign-off'}
                </div>
            </div>

            {/* Cover Card — production only (visual approval relies on per-sub-item thumbnails) */}
            {!hideCover && (
                <div style={{ border: '1px solid #e5e5e5', borderRadius: '8px', overflow: 'hidden', background: '#fff', marginBottom: '24px' }}>
                    {coverImageUrl ? (
                        <div onClick={() => openLightbox(coverImageUrl, `${job.job_name} overview`)}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa', padding: '24px', borderBottom: '1px solid #e5e5e5', cursor: 'zoom-in' }}>
                            <img src={coverImageUrl} alt={`${job.job_name} overview`} style={{ maxWidth: '100%', maxHeight: '500px', objectFit: 'contain' }} />
                        </div>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa', padding: '48px 24px', borderBottom: '1px solid #e5e5e5', color: '#bbb', fontSize: '14px', fontStyle: 'italic' }}>
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
                                {job.panel_size && (<div>
                                    <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#999', fontWeight: 600, marginBottom: '2px' }}>panel size</div>
                                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#111' }}>{job.panel_size}</div>
                                </div>)}
                                {job.paint_colour && (<div>
                                    <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#999', fontWeight: 600, marginBottom: '2px' }}>paint colour</div>
                                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#111' }}>{job.paint_colour}</div>
                                </div>)}
                            </div>
                        )}
                        {job.description && (
                            <p style={{ fontSize: '13px', color: '#666', lineHeight: 1.6, marginTop: '12px' }}>{job.description}</p>
                        )}
                    </div>
                </div>
            )}

            {/* Visual approval — compact job header shown instead of the cover card. */}
            {hideCover && (
                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                    <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#111', letterSpacing: '-0.02em', marginBottom: '2px' }}>
                        {job.job_name}
                    </h1>
                    <p style={{ fontSize: '12px', color: '#999', fontWeight: 500 }}>
                        {job.job_reference}{job.client_name ? ` — ${job.client_name}` : ''}
                    </p>
                </div>
            )}

            {/* Site snapshot */}
            {(approval.snapshot_site_name || approval.snapshot_site_address) && (
                <div style={{ border: '1px solid #e5e5e5', borderRadius: '8px', background: '#fff', marginBottom: '24px', padding: '16px 20px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#888', marginBottom: '8px' }}>install / delivery address</div>
                    {approval.snapshot_site_name && <div style={{ fontSize: '14px', fontWeight: 600, color: '#111', marginBottom: '4px' }}>{approval.snapshot_site_name}</div>}
                    {approval.snapshot_site_address && <div style={{ fontSize: '13px', color: '#444', lineHeight: 1.5, whiteSpace: 'pre-line' }}>{approval.snapshot_site_address}</div>}
                </div>
            )}

            {/* Components */}
            {components.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                    {/* Section heading + expand/collapse helpers */}
                    <div style={{
                        background: '#fff', border: '1px solid #e5e5e5', borderRadius: '8px',
                        padding: '14px 18px', marginBottom: '12px',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                            <div>
                                <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#111', margin: 0 }}>
                                    {isVisual ? 'design options' : 'components'}
                                </h2>
                                <p style={{ fontSize: '12px', color: '#555', marginTop: '4px', lineHeight: 1.5 }}>
                                    {hasVariants
                                        ? 'choose one option per component'
                                        : 'tap each card below to open it. Everything inside that card belongs to that one item — approve each image, or request changes with a note.'}
                                </p>
                            </div>
                            {!hasVariants && (
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button type="button" onClick={expandAll}
                                        style={{ padding: '6px 10px', fontSize: '11px', fontWeight: 600, color: '#4e7e8c', background: '#fff', border: '1px solid #c9d9df', borderRadius: '6px', cursor: 'pointer' }}>
                                        open all
                                    </button>
                                    <button type="button" onClick={collapseAll}
                                        style={{ padding: '6px 10px', fontSize: '11px', fontWeight: 600, color: '#666', background: '#fff', border: '1px solid #e0e0e0', borderRadius: '6px', cursor: 'pointer' }}>
                                        close all
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {components.map((component) => {
                            const subs = component.sub_items ?? [];
                            const hasSubs = subs.length > 0;
                            const decideKeys = hasSubs ? subs.map((si) => si.id) : [component.id];
                            const decidedCount = decideKeys.filter((k) => decisions[k]).length;
                            const totalCount = decideKeys.length;
                            const isExpanded = expanded[component.id] ?? false;
                            const hasChanges = decideKeys.some((k) => decisions[k] === 'changes_requested');
                            const allApproved = totalCount > 0 && decidedCount === totalCount && !hasChanges;
                            const headerBg = allApproved ? '#16a34a' : hasChanges ? '#d97706' : '#fff';
                            const headerColor = (allApproved || hasChanges) ? '#fff' : '#111';
                            const cardBorder = allApproved ? '#16a34a' : hasChanges ? '#d97706' : '#d4d4d4';

                            return (
                                <div key={component.id} style={{
                                    background: '#fff', border: `2px solid ${cardBorder}`, borderRadius: '10px', overflow: 'hidden',
                                }}>
                                    {/* Clickable header — collapsed state */}
                                    <button
                                        type="button"
                                        onClick={() => toggleExpanded(component.id)}
                                        aria-expanded={isExpanded}
                                        style={{
                                            width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
                                            padding: '14px 18px', background: headerBg, color: headerColor,
                                            border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                                        }}
                                    >
                                        <span style={{
                                            fontSize: '18px', fontWeight: 700, width: '22px', textAlign: 'center',
                                            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                            transition: 'transform 0.15s ease',
                                            opacity: 0.7,
                                        }}>›</span>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '15px', fontWeight: 700 }}>{component.name}</div>
                                            {hasSubs && (
                                                <div style={{ fontSize: '11px', opacity: 0.85, marginTop: '2px' }}>
                                                    {totalCount} design{totalCount !== 1 ? 's' : ''} to review
                                                </div>
                                            )}
                                        </div>
                                        <div style={{
                                            fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em',
                                            padding: '4px 9px', borderRadius: '999px',
                                            background: (allApproved || hasChanges) ? 'rgba(255,255,255,0.25)' : '#f3f4f6',
                                            color: (allApproved || hasChanges) ? '#fff' : '#4b5563',
                                        }}>
                                            {allApproved ? '✓ all approved'
                                                : hasChanges ? `${decidedCount} / ${totalCount} · changes`
                                                : `${decidedCount} / ${totalCount} decided`}
                                        </div>
                                        {!isExpanded && (
                                            <span style={{
                                                fontSize: '11px', fontWeight: 600, opacity: 0.7,
                                                textTransform: 'uppercase', letterSpacing: '0.08em',
                                            }}>tap to open</span>
                                        )}
                                    </button>

                                    {/* Expanded body */}
                                    {isExpanded && (
                                        <div style={{ padding: '18px 20px', borderTop: `1px solid ${(allApproved || hasChanges) ? 'rgba(255,255,255,0.2)' : '#e5e5e5'}`, background: '#fbfbfb' }}>
                                            {/* Scope banner: reinforces "everything below belongs to THIS component" */}
                                            <div style={{
                                                fontSize: '11px', color: '#555', background: '#eef4f6',
                                                border: '1px solid #d2e1e6', borderRadius: '6px',
                                                padding: '8px 12px', marginBottom: '14px', lineHeight: 1.5,
                                            }}>
                                                Everything below — image{hasSubs && totalCount !== 1 ? 's' : ''}, specification{hasSubs && totalCount !== 1 ? 's' : ''}, decision buttons —
                                                belongs to <strong>{component.name}</strong>.
                                            </div>

                                            {/* Variant-picker path: single-choice visual approval */}
                                            {hasVariants ? (
                                        <VariantPicker
                                            componentName={component.name}
                                            variants={component.variants ?? []}
                                            chosenVariantId={selections[component.id] ?? null}
                                            onChoose={(variantId) => setSelections((p) => ({ ...p, [component.id]: variantId }))}
                                            onZoom={openLightbox}
                                        />
                                    ) : hasSubs ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                            {subs.map((si) => {
                                                const k = keyFor(component.id, si.id);
                                                const dec = decisions[k];
                                                const borderColor = dec === 'approved' ? '#16a34a' : dec === 'changes_requested' ? '#d97706' : '#e5e5e5';
                                                const bg = dec === 'approved' ? '#f0fdf4' : dec === 'changes_requested' ? '#fffbeb' : '#fff';
                                                const alt = si.name || `Option ${si.label}`;
                                                return (
                                                    <div key={si.id} style={{
                                                        border: `1px solid ${borderColor}`, borderLeft: `4px solid ${borderColor}`,
                                                        borderRadius: '8px', background: bg, overflow: 'hidden',
                                                    }}>
                                                        {/* Sub-item thumbnail */}
                                                        {si.thumbnail_url ? (
                                                            <div
                                                                onClick={() => openLightbox(si.thumbnail_url!, alt)}
                                                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa', padding: '16px', cursor: 'zoom-in', minHeight: '180px' }}
                                                            >
                                                                <ResilientImage src={si.thumbnail_url} alt={alt}
                                                                    style={{ maxWidth: '100%', maxHeight: '260px', objectFit: 'contain' }} />
                                                            </div>
                                                        ) : (
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa', padding: '28px', color: '#ccc', fontSize: '12px', fontStyle: 'italic' }}>
                                                                no image
                                                            </div>
                                                        )}

                                                        <div style={{ padding: '14px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '6px' }}>
                                                                <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, fontSize: '11px', background: '#111', color: '#fff', padding: '1px 6px', borderRadius: '3px' }}>
                                                                    {si.label}
                                                                </span>
                                                                <span style={{ fontWeight: 600, color: '#111', fontSize: '14px' }}>
                                                                    {si.name || <span style={{ color: '#999', fontStyle: 'italic' }}>unnamed</span>}
                                                                </span>
                                                                {si.quantity > 1 && (
                                                                    <span style={{ fontSize: '11px', color: '#666', marginLeft: 'auto' }}>× {si.quantity}</span>
                                                                )}
                                                            </div>

                                                            {/* Description only */}
                                                            {si.notes && (
                                                                <p style={{ fontSize: '13px', color: '#555', lineHeight: 1.5, margin: '4px 0 0 0' }}>
                                                                    {si.notes}
                                                                </p>
                                                            )}

                                                            {/* Spec rows — hidden for visual approval */}
                                                            {!hideSpecDetail && (si.material || si.application_method || si.finish || (si.width_mm && si.height_mm)) && (
                                                                <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', rowGap: '3px', columnGap: '10px', fontSize: '12px', margin: '10px 0 0 0' }}>
                                                                    {si.material && (<><dt style={{ color: '#888', fontWeight: 600 }}>Material</dt><dd style={{ margin: 0, color: '#111' }}>{si.material}</dd></>)}
                                                                    {si.application_method && (<><dt style={{ color: '#888', fontWeight: 600 }}>Method</dt><dd style={{ margin: 0, color: '#111' }}>{si.application_method}</dd></>)}
                                                                    {si.finish && (<><dt style={{ color: '#888', fontWeight: 600 }}>Finish</dt><dd style={{ margin: 0, color: '#111' }}>{si.finish}</dd></>)}
                                                                    {si.width_mm && si.height_mm && (<><dt style={{ color: '#888', fontWeight: 600 }}>Size</dt><dd style={{ margin: 0, color: '#111', fontFamily: 'ui-monospace, monospace' }}>{si.width_mm} × {si.height_mm} mm{si.returns_mm ? ` · ${si.returns_mm}mm returns` : ''}</dd></>)}
                                                                </dl>
                                                            )}

                                                            <DecisionButtons k={k} componentId={component.id} />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        // Component with no sub-items — fall back to a single decision row.
                                        <div style={{
                                            border: `1px solid ${decisions[component.id] === 'approved' ? '#16a34a' : decisions[component.id] === 'changes_requested' ? '#d97706' : '#e5e5e5'}`,
                                            borderRadius: '8px', padding: '14px',
                                            background: decisions[component.id] === 'approved' ? '#f0fdf4' : decisions[component.id] === 'changes_requested' ? '#fffbeb' : '#fff',
                                        }}>
                                            {component.thumbnailUrl && (
                                                <div onClick={() => openLightbox(component.thumbnailUrl!, component.name)}
                                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa', borderRadius: '6px', marginBottom: '10px', cursor: 'zoom-in', minHeight: '180px' }}>
                                                    <ResilientImage src={component.thumbnailUrl} alt={component.name}
                                                        style={{ maxWidth: '100%', maxHeight: '260px', objectFit: 'contain' }} />
                                                </div>
                                            )}
                                            <DecisionButtons k={component.id} />
                                        </div>
                                    )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div style={{ marginTop: '12px', padding: '12px 16px', fontSize: '12px', color: '#555', borderRadius: '8px', border: '1px solid #eee', background: '#fafafa', lineHeight: 1.5 }}>
                        <strong style={{ color: '#111' }}>What you&rsquo;re approving:</strong>{' '}
                        {isVisual
                            ? 'the design options shown above. Approve the ones you want to move forward with, request changes on the rest.'
                            : 'the artwork and specification shown for each item — material, finish, dimensions, and quantity. Approve each row, or request changes with a note.'}
                    </div>
                </div>
            )}

            {/* Sign-off form */}
            {success ? (
                <div style={{ border: '2px solid #16a34a', borderRadius: '8px', padding: '32px', textAlign: 'center', background: '#f0fdf4', marginBottom: '24px' }}>
                    <div style={{ fontSize: '24px', marginBottom: '8px', fontWeight: 700, color: '#16a34a' }}>
                        {approval.status === 'changes_requested' ? 'feedback received' : 'submitted'}
                    </div>
                    <p style={{ fontSize: '14px', color: '#555', marginBottom: '16px' }}>
                        {isApproved
                            ? `Approved by ${approval.client_name} on ${formatDateTime(approval.approved_at!)}`
                            : 'thank you — your response has been recorded'}
                    </p>
                    {isApproved && approval.signature_data && (
                        <div style={{ display: 'inline-block', border: '1px solid #ddd', borderRadius: '4px', padding: '8px', background: '#fff' }}>
                            <img src={approval.signature_data} alt="Signature" style={{ maxWidth: '300px', maxHeight: '100px' }} />
                        </div>
                    )}
                </div>
            ) : (
                <div style={{ border: '1px solid #e5e5e5', borderRadius: '8px', padding: '24px', background: '#fff', marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#111', marginBottom: '4px' }}>
                        {anyChangesRequested ? 'submit feedback' : 'sign off'}
                    </h3>
                    <p style={{ fontSize: '13px', color: '#888', marginBottom: '20px' }}>
                        {anyChangesRequested
                            ? 'your signature confirms the feedback above — we\u2019ll revise and send a new link'
                            : 'by signing below you confirm every item marked \u201capprove\u201d is approved'}
                    </p>

                    {error && (
                        <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#dc2626', fontSize: '13px', marginBottom: '16px' }}>
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#555', marginBottom: '4px' }}>your name *</label>
                            <input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Full name"
                                style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', outline: 'none' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#555', marginBottom: '4px' }}>your email *</label>
                            <input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="email@company.com"
                                style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', outline: 'none' }} />
                        </div>
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#555', marginBottom: '4px' }}>company</label>
                        <input type="text" value={clientCompany} onChange={(e) => setClientCompany(e.target.value)} placeholder="Company name (optional)"
                            style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', outline: 'none' }} />
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#555', marginBottom: '4px' }}>
                            overall comments
                            <span style={{ fontWeight: 400, color: '#999', marginLeft: '6px' }}>(optional)</span>
                        </label>
                        <textarea value={clientComments} onChange={(e) => setClientComments(e.target.value)} rows={3} maxLength={2000}
                            placeholder="anything that isn't tied to a specific item"
                            style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', outline: 'none', fontFamily: 'inherit', resize: 'vertical', minHeight: '72px' }} />
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#555', marginBottom: '8px' }}>signature *</label>
                        <SignatureCanvas ref={signatureRef} />
                        <button type="button" onClick={() => signatureRef.current?.clear()}
                            style={{ marginTop: '8px', padding: '6px 12px', fontSize: '12px', color: '#666', background: '#f5f5f5', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer' }}>
                            clear signature
                        </button>
                    </div>

                    {hasVariants && (() => {
                        const missing = components.filter((c) => !(c.variants?.length));
                        if (missing.length === 0) return null;
                        return (
                            <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
                                This approval is incomplete — component{missing.length > 1 ? 's' : ''}{' '}
                                <strong>{missing.map((c: any) => c.name).join(', ')}</strong>{' '}
                                {missing.length > 1 ? 'have' : 'has'} no design options attached.
                                Please contact Onesign to finish setting up this approval.
                            </div>
                        );
                    })()}

                    <button type="button" onClick={handleSubmit}
                        disabled={isPending || !allLinesDecided}
                        style={{
                            width: '100%', padding: '12px 32px', fontSize: '14px', fontWeight: 600,
                            color: '#fff', background: (isPending || !allLinesDecided) ? '#888' : (anyChangesRequested ? '#d97706' : '#111'),
                            border: 'none', borderRadius: '6px',
                            cursor: (isPending || !allLinesDecided) ? 'not-allowed' : 'pointer',
                        }}>
                        {isPending ? 'submitting...' : (anyChangesRequested ? 'submit feedback' : 'sign off')}
                    </button>

                    {!hasVariants && (
                        <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0' }}>
                                <div style={{ flex: 1, height: 1, background: '#e0e0e0' }} />
                                <span style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '0.1em' }}>or</span>
                                <div style={{ flex: 1, height: 1, background: '#e0e0e0' }} />
                            </div>
                            <button type="button" onClick={handleRequestChangesOverall} disabled={isPending}
                                style={{ width: '100%', padding: '10px 24px', fontSize: '13px', fontWeight: 600, color: '#a37800', background: '#fffbeb', border: '1px solid #f0d98a', borderRadius: '6px', cursor: 'pointer' }}>
                                send overall feedback without approving anything
                            </button>
                        </>
                    )}
                </div>
            )}

            <div style={{ textAlign: 'center', padding: '16px', fontSize: '12px', color: '#bbb' }}>
                onesign &amp; digital &middot; team valley, gateshead
            </div>
        </div>
    );
}
