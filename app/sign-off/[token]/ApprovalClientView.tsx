'use client';

import { useState, useRef, useTransition, useCallback, useEffect } from 'react';
import { submitApproval, requestApprovalChanges } from '@/lib/artwork/approval-actions';
import type { ApprovalPackData } from '@/lib/artwork/approval-actions';
import { VariantPicker } from './components/VariantPicker';
import { ResilientImage } from './components/ResilientImage';
import MarketingModal from '@/app/components/MarketingModal';
import { formatDateTime } from '@/lib/artwork/utils';
import SignatureCanvas, { type SignatureCanvasRef } from '@/components/SignatureCanvas';

interface Props {
    data: ApprovalPackData;
    token: string;
}

// Marketing modal is staged but not yet live on the client approval flow.
// Preview it from the admin /settings page. Flip to `true` to go live once
// copy, backend and PDF are ready.
const SHOW_MARKETING_MODAL_ON_APPROVAL = false;

type LineDecision = 'approved' | 'changes_requested';

// ── Studio dark skin tokens (cinematic stage, frosted glass, accent glow) ──
const ACCENT = '#9ed0dc';        // brightened teal — reads on near-black
const ACCENT_SOLID = '#4e7e8c';  // brand steel teal for solid CTAs
const GOOD = '#34d399';
const WARN = '#fbbf24';
const TEXT = '#eef4f6';
const glassPanel: React.CSSProperties = {
    background: 'rgba(255,255,255,0.045)',
    border: '1px solid rgba(255,255,255,0.12)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
};
const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px',
    border: '1px solid rgba(255,255,255,0.16)',
    background: 'rgba(255,255,255,0.04)',
    color: TEXT, borderRadius: '8px', fontSize: '14px', outline: 'none',
};

/**
 * Identify a decision row by sub-item id when present, else by component id.
 * Both are UUIDs so they never collide.
 */
function keyFor(componentId: string, subItemId?: string | null): string {
    return subItemId ?? componentId;
}

/**
 * Approve / request-changes buttons + the per-row comment textarea.
 *
 * MUST live at module scope — when this was defined inside
 * ApprovalClientView, every parent re-render created a new component
 * reference, React remounted the subtree, and the textarea lost focus
 * after every keystroke (so the on-screen keyboard dismissed on mobile).
 */
function DecisionButtons({
    k,
    componentId,
    decision,
    comment,
    onDecide,
    onComment,
    hidden,
}: {
    k: string;
    componentId?: string;
    decision: LineDecision | undefined;
    comment: string;
    onDecide: (k: string, d: LineDecision, componentId?: string) => void;
    onComment: (k: string, v: string) => void;
    hidden: boolean;
}) {
    if (hidden) return null;
    return (
        <div style={{ marginTop: '12px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={() => onDecide(k, 'approved', componentId)}
                    title={decision === 'approved' ? 'click again to unselect' : undefined}
                    style={{
                        flex: 1, padding: '9px 12px', fontSize: '13px', fontWeight: 600,
                        borderRadius: '8px', cursor: 'pointer',
                        border: decision === 'approved' ? `1px solid ${GOOD}` : '1px solid rgba(255,255,255,0.18)',
                        background: decision === 'approved' ? GOOD : 'rgba(255,255,255,0.04)',
                        color: decision === 'approved' ? '#04140d' : TEXT,
                        boxShadow: decision === 'approved' ? '0 0 24px -6px rgba(52,211,153,0.55)' : 'none',
                }}>{decision === 'approved' ? '✓ approved (click to unselect)' : '✓ approve this'}</button>
                <button type="button" onClick={() => onDecide(k, 'changes_requested', componentId)}
                    title={decision === 'changes_requested' ? 'click again to unselect' : undefined}
                    style={{
                        flex: 1, padding: '9px 12px', fontSize: '13px', fontWeight: 600,
                        borderRadius: '8px', cursor: 'pointer',
                        border: decision === 'changes_requested' ? `1px solid ${WARN}` : '1px solid rgba(255,255,255,0.18)',
                        background: decision === 'changes_requested' ? WARN : 'rgba(255,255,255,0.04)',
                        color: decision === 'changes_requested' ? '#1f1605' : TEXT,
                        boxShadow: decision === 'changes_requested' ? '0 0 24px -6px rgba(251,191,36,0.5)' : 'none',
                }}>{decision === 'changes_requested' ? 'changes requested (click to unselect)' : 'request changes'}</button>
            </div>
            {decision === 'changes_requested' && (
                <textarea
                    value={comment}
                    onChange={(e) => onComment(k, e.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder="What needs to change here?"
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid rgba(251,191,36,0.4)', background: 'rgba(251,191,36,0.07)', color: TEXT, borderRadius: '8px', fontSize: '13px', outline: 'none', fontFamily: 'inherit', resize: 'vertical', minHeight: '64px', marginTop: '8px' }}
                />
            )}
        </div>
    );
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
    const [showMarketingModal, setShowMarketingModal] = useState(false);
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
     *   * A component's sub-items are mutually exclusive for the "approved"
     *     state — they're variants of the same artwork, so only one can
     *     be picked. Approving a new sibling automatically unapproves any
     *     sibling that was previously approved. Request-changes stays
     *     independent so the client can reject every variant if needed.
     */
    const setDecision = (key: string, decision: LineDecision, componentId?: string) => {
        setDecisions((p) => {
            const next = { ...p };
            if (next[key] === decision) {
                delete next[key];
                setComments((pc) => {
                    const { [key]: _, ...rest } = pc;
                    return rest;
                });
                return next;
            }
            if (decision === 'approved' && componentId) {
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

    // Validation. A component's sub-items are variants — it's "done" when
    // one variant is approved OR at least one is marked changes_requested
    // (letting the client reject every option and leave notes). Components
    // with no sub-items still need their single decision.
    const componentComplete = (c: (typeof components)[number]): boolean => {
        const subs = c.sub_items ?? [];
        if (subs.length === 0) return !!decisions[c.id];
        const approvedCount = subs.filter((si) => decisions[si.id] === 'approved').length;
        const anyChanges = subs.some((si) => decisions[si.id] === 'changes_requested');
        return approvedCount === 1 || anyChanges;
    };

    const allLinesDecided = hasVariants
        ? components.every((c) => selections[c.id])
        : components.every(componentComplete);

    const anyChangesRequested = !hasVariants && decisionRows.some((r) => decisions[r.key] === 'changes_requested');
    const missingChangeComments = !hasVariants && decisionRows.some(
        (r) => decisions[r.key] === 'changes_requested' && !(comments[r.key] ?? '').trim()
    );

    // Guard: only one sub-item per component can be approved.
    const multipleApprovedInComponent = components.some((c) => {
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
                : 'please approve one option per component, or request changes'
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
            else {
                setSuccess(true);
                // Marketing modal fires on pure approvals only — if anything
                // was marked "changes requested" the client isn't in the
                // right mood for a pitch. Gated off until the pitch is ready
                // to go live; see SHOW_MARKETING_MODAL_ON_APPROVAL above.
                if (!anyChangesRequested && SHOW_MARKETING_MODAL_ON_APPROVAL) {
                    setShowMarketingModal(true);
                }
            }
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

    return (
        <div style={{ maxWidth: '720px', margin: '0 auto', padding: '20px', color: TEXT }}>
            {showMarketingModal && (
                <MarketingModal onClose={() => setShowMarketingModal(false)} />
            )}

            {lightboxSrc && (
                <div onClick={closeLightbox} style={{
                    position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.88)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out', padding: '24px',
                    backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
                }}>
                    <button onClick={closeLightbox} style={{
                        position: 'absolute', top: '16px', right: '20px', background: 'none', border: 'none',
                        color: '#fff', fontSize: '32px', cursor: 'pointer', lineHeight: 1, opacity: 0.7,
                    }} aria-label="Close">×</button>
                    <ResilientImage src={lightboxSrc} alt={lightboxAlt} onClick={(e) => e.stopPropagation()}
                        style={{ maxWidth: '95vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px', cursor: 'default' }} />
                </div>
            )}

            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center' }}>
                    <img src="/Onesign-Logo-Black.svg" alt="Onesign & Digital"
                        style={{ height: '52px', width: 'auto', maxWidth: '300px', filter: 'brightness(0) invert(1)' }} />
                </div>
                <div style={{ fontSize: '11px', color: ACCENT, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700 }}>
                    {isVisual ? 'artwork visual approval' : 'artwork sign-off'}
                </div>
            </div>

            {/* Cover Card — production only (visual approval relies on per-sub-item thumbnails) */}
            {!hideCover && (
                <div style={{ ...glassPanel, borderRadius: '18px', overflow: 'hidden', marginBottom: '24px' }}>
                    {coverImageUrl ? (
                        <div onClick={() => openLightbox(coverImageUrl, `${job.job_name} overview`)}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.25)', padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.08)', cursor: 'zoom-in' }}>
                            <img src={coverImageUrl} alt={`${job.job_name} overview`} style={{ maxWidth: '100%', maxHeight: '500px', objectFit: 'contain', borderRadius: '6px' }} />
                        </div>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.2)', padding: '48px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'rgba(238,244,246,0.4)', fontSize: '14px', fontStyle: 'italic' }}>
                            no cover image
                        </div>
                    )}
                    <div style={{ padding: '20px 24px' }}>
                        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: '2px' }}>
                            {job.job_name}
                        </h1>
                        <p style={{ fontSize: '13px', color: 'rgba(238,244,246,0.55)', fontWeight: 500 }}>
                            {job.job_reference}{job.client_name ? ` — ${job.client_name}` : ''}
                        </p>
                        {(job.panel_size || job.paint_colour) && (
                            <div style={{ display: 'flex', gap: '24px', marginTop: '12px' }}>
                                {job.panel_size && (<div>
                                    <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: ACCENT, fontWeight: 600, marginBottom: '2px' }}>panel size</div>
                                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>{job.panel_size}</div>
                                </div>)}
                                {job.paint_colour && (<div>
                                    <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: ACCENT, fontWeight: 600, marginBottom: '2px' }}>paint colour</div>
                                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>{job.paint_colour}</div>
                                </div>)}
                            </div>
                        )}
                        {job.description && (
                            <p style={{ fontSize: '13px', color: 'rgba(238,244,246,0.65)', lineHeight: 1.6, marginTop: '12px' }}>{job.description}</p>
                        )}
                    </div>
                </div>
            )}

            {/* Visual approval — compact job header shown instead of the cover card. */}
            {hideCover && (
                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                    <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', marginBottom: '2px' }}>
                        {job.job_name}
                    </h1>
                    <p style={{ fontSize: '12px', color: 'rgba(238,244,246,0.55)', fontWeight: 500 }}>
                        {job.job_reference}{job.client_name ? ` — ${job.client_name}` : ''}
                    </p>
                </div>
            )}

            {/* Site snapshot */}
            {(approval.snapshot_site_name || approval.snapshot_site_address) && (
                <div style={{ ...glassPanel, borderRadius: '14px', marginBottom: '24px', padding: '16px 20px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: ACCENT, marginBottom: '8px' }}>install / delivery address</div>
                    {approval.snapshot_site_name && <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>{approval.snapshot_site_name}</div>}
                    {approval.snapshot_site_address && <div style={{ fontSize: '13px', color: 'rgba(238,244,246,0.65)', lineHeight: 1.5, whiteSpace: 'pre-line' }}>{approval.snapshot_site_address}</div>}
                </div>
            )}

            {/* Components */}
            {components.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                    {/* Section heading + expand/collapse helpers */}
                    <div style={{ ...glassPanel, borderRadius: '14px', padding: '14px 18px', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                            <div>
                                <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#fff', margin: 0 }}>
                                    {isVisual ? 'design options' : 'components'}
                                </h2>
                                <p style={{ fontSize: '12px', color: 'rgba(238,244,246,0.6)', marginTop: '4px', lineHeight: 1.5 }}>
                                    {hasVariants
                                        ? 'choose one option per component'
                                        : 'tap each card below to open it. Everything inside that card belongs to that one item — approve each image, or request changes with a note.'}
                                </p>
                            </div>
                            {!hasVariants && (
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button type="button" onClick={expandAll}
                                        style={{ padding: '6px 10px', fontSize: '11px', fontWeight: 600, color: ACCENT, background: 'rgba(158,208,220,0.1)', border: '1px solid rgba(158,208,220,0.35)', borderRadius: '8px', cursor: 'pointer' }}>
                                        open all
                                    </button>
                                    <button type="button" onClick={collapseAll}
                                        style={{ padding: '6px 10px', fontSize: '11px', fontWeight: 600, color: 'rgba(238,244,246,0.7)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: '8px', cursor: 'pointer' }}>
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
                            const headerBg = allApproved ? 'rgba(52,211,153,0.16)' : hasChanges ? 'rgba(251,191,36,0.16)' : 'rgba(255,255,255,0.04)';
                            const headerColor = '#fff';
                            const cardBorder = allApproved ? 'rgba(52,211,153,0.55)' : hasChanges ? 'rgba(251,191,36,0.5)' : 'rgba(255,255,255,0.12)';

                            return (
                                <div key={component.id} style={{
                                    ...glassPanel, border: `1px solid ${cardBorder}`, borderRadius: '14px', overflow: 'hidden',
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
                                            opacity: 0.7, color: ACCENT,
                                        }}>›</span>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '15px', fontWeight: 700 }}>{component.name}</div>
                                            {hasSubs && (
                                                <div style={{ fontSize: '11px', opacity: 0.7, marginTop: '2px' }}>
                                                    {totalCount} design{totalCount !== 1 ? 's' : ''} to review
                                                </div>
                                            )}
                                        </div>
                                        <div style={{
                                            fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em',
                                            padding: '4px 9px', borderRadius: '999px',
                                            background: allApproved ? 'rgba(52,211,153,0.18)' : hasChanges ? 'rgba(251,191,36,0.18)' : 'rgba(255,255,255,0.08)',
                                            color: allApproved ? GOOD : hasChanges ? WARN : 'rgba(238,244,246,0.7)',
                                        }}>
                                            {allApproved ? '✓ all approved'
                                                : hasChanges ? `${decidedCount} / ${totalCount} · changes`
                                                : `${decidedCount} / ${totalCount} decided`}
                                        </div>
                                        {!isExpanded && (
                                            <span style={{
                                                fontSize: '11px', fontWeight: 600, opacity: 0.55,
                                                textTransform: 'uppercase', letterSpacing: '0.08em',
                                            }}>tap to open</span>
                                        )}
                                    </button>

                                    {/* Expanded body */}
                                    {isExpanded && (
                                        <div style={{ padding: '18px 20px', borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.18)' }}>
                                            {/* Scope banner: reinforces "everything below belongs to THIS component" */}
                                            <div style={{
                                                fontSize: '11px', color: 'rgba(238,244,246,0.7)', background: 'rgba(158,208,220,0.1)',
                                                border: '1px solid rgba(158,208,220,0.25)', borderRadius: '8px',
                                                padding: '8px 12px', marginBottom: '14px', lineHeight: 1.5,
                                            }}>
                                                Everything below — image{hasSubs && totalCount !== 1 ? 's' : ''}, specification{hasSubs && totalCount !== 1 ? 's' : ''}, decision buttons —
                                                belongs to <strong style={{ color: '#fff' }}>{component.name}</strong>.
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
                                                const borderColor = dec === 'approved' ? 'rgba(52,211,153,0.6)' : dec === 'changes_requested' ? 'rgba(251,191,36,0.55)' : 'rgba(255,255,255,0.12)';
                                                const bg = dec === 'approved' ? 'rgba(52,211,153,0.08)' : dec === 'changes_requested' ? 'rgba(251,191,36,0.07)' : 'rgba(255,255,255,0.03)';
                                                const alt = si.name || `Option ${si.label}`;
                                                return (
                                                    <div key={si.id} style={{
                                                        border: `1px solid ${borderColor}`, borderLeft: `4px solid ${borderColor}`,
                                                        borderRadius: '10px', background: bg, overflow: 'hidden',
                                                    }}>
                                                        {/* Sub-item thumbnail */}
                                                        {si.thumbnail_url ? (
                                                            <div
                                                                onClick={() => openLightbox(si.thumbnail_url!, alt)}
                                                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.25)', padding: '16px', cursor: 'zoom-in', minHeight: '180px' }}
                                                            >
                                                                <ResilientImage src={si.thumbnail_url} alt={alt}
                                                                    style={{ maxWidth: '100%', maxHeight: '260px', objectFit: 'contain', borderRadius: '4px' }} />
                                                            </div>
                                                        ) : (
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.25)', padding: '28px', color: 'rgba(238,244,246,0.4)', fontSize: '12px', fontStyle: 'italic' }}>
                                                                no image
                                                            </div>
                                                        )}

                                                        <div style={{ padding: '14px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '6px' }}>
                                                                <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, fontSize: '11px', background: ACCENT_SOLID, color: '#fff', padding: '1px 6px', borderRadius: '3px' }}>
                                                                    {si.label}
                                                                </span>
                                                                <span style={{ fontWeight: 600, color: '#fff', fontSize: '14px' }}>
                                                                    {si.name || <span style={{ color: 'rgba(238,244,246,0.45)', fontStyle: 'italic' }}>unnamed</span>}
                                                                </span>
                                                                {si.quantity > 1 && (
                                                                    <span style={{ fontSize: '11px', color: 'rgba(238,244,246,0.6)', marginLeft: 'auto' }}>× {si.quantity}</span>
                                                                )}
                                                            </div>

                                                            {/* Description only */}
                                                            {si.notes && (
                                                                <p style={{ fontSize: '13px', color: 'rgba(238,244,246,0.65)', lineHeight: 1.5, margin: '4px 0 0 0' }}>
                                                                    {si.notes}
                                                                </p>
                                                            )}

                                                            {/* Spec rows — hidden for visual approval */}
                                                            {!hideSpecDetail && (si.material || si.application_method || si.finish || (si.width_mm && si.height_mm)) && (
                                                                <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', rowGap: '3px', columnGap: '10px', fontSize: '12px', margin: '10px 0 0 0' }}>
                                                                    {si.material && (<><dt style={{ color: ACCENT, fontWeight: 600 }}>Material</dt><dd style={{ margin: 0, color: '#fff' }}>{si.material}</dd></>)}
                                                                    {si.application_method && (<><dt style={{ color: ACCENT, fontWeight: 600 }}>Method</dt><dd style={{ margin: 0, color: '#fff' }}>{si.application_method}</dd></>)}
                                                                    {si.finish && (<><dt style={{ color: ACCENT, fontWeight: 600 }}>Finish</dt><dd style={{ margin: 0, color: '#fff' }}>{si.finish}</dd></>)}
                                                                    {si.width_mm && si.height_mm && (<><dt style={{ color: ACCENT, fontWeight: 600 }}>Size</dt><dd style={{ margin: 0, color: '#fff', fontFamily: 'ui-monospace, monospace' }}>{si.width_mm} × {si.height_mm} mm{si.returns_mm ? ` · ${si.returns_mm}mm returns` : ''}</dd></>)}
                                                                </dl>
                                                            )}

                                                            <DecisionButtons
                                                                k={k}
                                                                componentId={component.id}
                                                                decision={decisions[k]}
                                                                comment={comments[k] ?? ''}
                                                                onDecide={setDecision}
                                                                onComment={(kk, v) => setComments((p) => ({ ...p, [kk]: v }))}
                                                                hidden={success}
                                                            />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        // Component with no sub-items — fall back to a single decision row.
                                        <div style={{
                                            border: `1px solid ${decisions[component.id] === 'approved' ? 'rgba(52,211,153,0.6)' : decisions[component.id] === 'changes_requested' ? 'rgba(251,191,36,0.55)' : 'rgba(255,255,255,0.12)'}`,
                                            borderRadius: '10px', padding: '14px',
                                            background: decisions[component.id] === 'approved' ? 'rgba(52,211,153,0.08)' : decisions[component.id] === 'changes_requested' ? 'rgba(251,191,36,0.07)' : 'rgba(255,255,255,0.03)',
                                        }}>
                                            {component.thumbnailUrl && (
                                                <div onClick={() => openLightbox(component.thumbnailUrl!, component.name)}
                                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.25)', borderRadius: '6px', marginBottom: '10px', cursor: 'zoom-in', minHeight: '180px' }}>
                                                    <ResilientImage src={component.thumbnailUrl} alt={component.name}
                                                        style={{ maxWidth: '100%', maxHeight: '260px', objectFit: 'contain' }} />
                                                </div>
                                            )}
                                            <DecisionButtons
                                                k={component.id}
                                                decision={decisions[component.id]}
                                                comment={comments[component.id] ?? ''}
                                                onDecide={setDecision}
                                                onComment={(kk, v) => setComments((p) => ({ ...p, [kk]: v }))}
                                                hidden={success}
                                            />
                                        </div>
                                    )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div style={{ marginTop: '12px', padding: '12px 16px', fontSize: '12px', color: 'rgba(238,244,246,0.6)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', lineHeight: 1.5 }}>
                        <strong style={{ color: '#fff' }}>What you&rsquo;re approving:</strong>{' '}
                        {isVisual
                            ? 'the design options shown above. Approve the ones you want to move forward with, request changes on the rest.'
                            : 'the artwork and specification shown for each item — material, finish, dimensions, and quantity. Approve each row, or request changes with a note.'}
                    </div>
                </div>
            )}

            {/* Sign-off form */}
            {success ? (
                <div style={{ border: `1px solid ${GOOD}`, borderRadius: '16px', padding: '32px', textAlign: 'center', background: 'rgba(52,211,153,0.1)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', marginBottom: '24px', boxShadow: '0 0 40px -12px rgba(52,211,153,0.4)' }}>
                    <div style={{ fontSize: '24px', marginBottom: '8px', fontWeight: 700, color: GOOD }}>
                        {approval.status === 'changes_requested' ? 'feedback received' : 'submitted'}
                    </div>
                    <p style={{ fontSize: '14px', color: 'rgba(238,244,246,0.7)', marginBottom: '16px' }}>
                        {isApproved
                            ? `Approved by ${approval.client_name} on ${formatDateTime(approval.approved_at!)}`
                            : 'thank you — your response has been recorded'}
                    </p>
                    {isApproved && approval.signature_data && (
                        <div style={{ display: 'inline-block', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', padding: '8px', background: '#fff' }}>
                            <img src={approval.signature_data} alt="Signature" style={{ maxWidth: '300px', maxHeight: '100px' }} />
                        </div>
                    )}
                </div>
            ) : (
                <div style={{ ...glassPanel, borderRadius: '16px', padding: '24px', marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>
                        {anyChangesRequested ? 'submit feedback' : 'sign off'}
                    </h3>
                    <p style={{ fontSize: '13px', color: 'rgba(238,244,246,0.55)', marginBottom: '20px' }}>
                        {anyChangesRequested
                            ? 'your signature confirms the feedback above — we’ll revise and send a new link'
                            : 'by signing below you confirm every item marked “approve” is approved'}
                    </p>

                    {error && (
                        <div style={{ padding: '10px 14px', background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.4)', borderRadius: '8px', color: '#fca5a5', fontSize: '13px', marginBottom: '16px' }}>
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'rgba(238,244,246,0.7)', marginBottom: '4px' }}>your name *</label>
                            <input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Full name"
                                style={inputStyle} />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'rgba(238,244,246,0.7)', marginBottom: '4px' }}>your email *</label>
                            <input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="email@company.com"
                                style={inputStyle} />
                        </div>
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'rgba(238,244,246,0.7)', marginBottom: '4px' }}>company</label>
                        <input type="text" value={clientCompany} onChange={(e) => setClientCompany(e.target.value)} placeholder="Company name (optional)"
                            style={inputStyle} />
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'rgba(238,244,246,0.7)', marginBottom: '4px' }}>
                            overall comments
                            <span style={{ fontWeight: 400, color: 'rgba(238,244,246,0.4)', marginLeft: '6px' }}>(optional)</span>
                        </label>
                        <textarea value={clientComments} onChange={(e) => setClientComments(e.target.value)} rows={3} maxLength={2000}
                            placeholder="anything that isn't tied to a specific item"
                            style={{ ...inputStyle, fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', minHeight: '72px' }} />
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'rgba(238,244,246,0.7)', marginBottom: '8px' }}>signature *</label>
                        <SignatureCanvas ref={signatureRef} />
                        <button type="button" onClick={() => signatureRef.current?.clear()}
                            style={{ marginTop: '8px', padding: '6px 12px', fontSize: '12px', color: 'rgba(238,244,246,0.7)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: '6px', cursor: 'pointer' }}>
                            clear signature
                        </button>
                    </div>

                    {hasVariants && (() => {
                        const missing = components.filter((c) => !(c.variants?.length));
                        if (missing.length === 0) return null;
                        return (
                            <div className="mb-4 p-3 rounded-xl text-sm" style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.35)', color: '#fde68a' }}>
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
                            width: '100%', padding: '13px 32px', fontSize: '14px', fontWeight: 700, letterSpacing: '0.01em',
                            color: (isPending || !allLinesDecided) ? 'rgba(238,244,246,0.5)' : (anyChangesRequested ? '#1f1605' : '#04140d'),
                            background: (isPending || !allLinesDecided) ? 'rgba(255,255,255,0.08)' : (anyChangesRequested ? WARN : `linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_SOLID} 100%)`),
                            border: 'none', borderRadius: '10px',
                            boxShadow: (isPending || !allLinesDecided) ? 'none' : '0 0 30px -8px rgba(158,208,220,0.6)',
                            cursor: (isPending || !allLinesDecided) ? 'not-allowed' : 'pointer',
                        }}>
                        {isPending ? 'submitting...' : (anyChangesRequested ? 'submit feedback' : 'sign off')}
                    </button>

                    {!hasVariants && (
                        <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0' }}>
                                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.12)' }} />
                                <span style={{ fontSize: 11, color: 'rgba(238,244,246,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>or</span>
                                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.12)' }} />
                            </div>
                            <button type="button" onClick={handleRequestChangesOverall} disabled={isPending}
                                style={{ width: '100%', padding: '10px 24px', fontSize: '13px', fontWeight: 600, color: '#fde68a', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.35)', borderRadius: '8px', cursor: 'pointer' }}>
                                send overall feedback without approving anything
                            </button>
                        </>
                    )}
                </div>
            )}

            <div style={{ textAlign: 'center', padding: '16px', fontSize: '12px', color: 'rgba(238,244,246,0.35)' }}>
                onesign &amp; digital &middot; team valley, gateshead
            </div>
        </div>
    );
}
