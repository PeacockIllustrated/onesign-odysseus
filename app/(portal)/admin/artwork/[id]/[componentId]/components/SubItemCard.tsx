'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Trash2, Check, RotateCcw } from 'lucide-react';
import { Chip } from '@/app/(portal)/components/ui';
import {
    updateSubItem,
    deleteSubItem,
    signOffSubItemDesign,
    reverseSubItemSignOff,
    uploadSubItemThumbnail,
    removeSubItemThumbnail,
} from '@/lib/artwork/sub-item-actions';
import type { ArtworkSubItem } from '@/lib/artwork/types';
import type { ProductionStage } from '@/lib/production/types';
import { ThumbnailUpload } from './ThumbnailUpload';

interface Props {
    subItem: ArtworkSubItem;
    stages: ProductionStage[];
    jobCompleted: boolean;
}

const INPUT_CLS =
    'w-full text-sm border border-neutral-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#4e7e8c] disabled:bg-neutral-50 disabled:text-neutral-500';

export function SubItemCard({ subItem, stages, jobCompleted }: Props) {
    const router = useRouter();
    const [expanded, setExpanded] = useState(!subItem.design_signed_off_at);
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const [name, setName] = useState(subItem.name ?? '');
    const [material, setMaterial] = useState(subItem.material ?? '');
    const [method, setMethod] = useState(subItem.application_method ?? '');
    const [finish, setFinish] = useState(subItem.finish ?? '');
    const [widthMm, setWidthMm] = useState(subItem.width_mm?.toString() ?? '');
    const [heightMm, setHeightMm] = useState(subItem.height_mm?.toString() ?? '');
    const [returnsMm, setReturnsMm] = useState(subItem.returns_mm?.toString() ?? '');
    const [quantity, setQuantity] = useState(subItem.quantity);
    const [notes, setNotes] = useState(subItem.notes ?? '');
    const [stageId, setStageId] = useState(subItem.target_stage_id ?? '');

    // Production fields (measured dimensions, material_confirmed,
    // rip_no_scaling_confirmed) are no longer edited here — those belong
    // to the shop-floor / QA check that the production lads handle.
    // The underlying columns still exist on artwork_component_items.

    const designLocked = !!subItem.design_signed_off_at;
    const productionLocked = !!subItem.production_signed_off_at;
    const readOnly = jobCompleted;
    const stageName = stages.find((s) => s.id === subItem.target_stage_id)?.name ?? null;

    const status: { label: string; variant: 'approved' | 'active' | 'draft' } = productionLocked
        ? { label: 'production signed off', variant: 'approved' }
        : designLocked
          ? { label: 'design signed off', variant: 'active' }
          : { label: 'in design', variant: 'draft' };

    const buildDesignPatch = () => ({
        name: name || null,
        material: material || null,
        application_method: method || null,
        finish: finish || null,
        quantity,
        notes: notes || null,
        width_mm: widthMm ? Number(widthMm) : null,
        height_mm: heightMm ? Number(heightMm) : null,
        returns_mm: returnsMm ? Number(returnsMm) : null,
        target_stage_id: stageId || null,
    });

    const saveDesign = () => {
        setError(null);
        startTransition(async () => {
            const res = await updateSubItem(subItem.id, buildDesignPatch());
            if ('error' in res) setError(res.error);
            else router.refresh();
        });
    };

    const doSignOffDesign = () => {
        setError(null);
        startTransition(async () => {
            const saveRes = await updateSubItem(subItem.id, buildDesignPatch());
            if ('error' in saveRes) {
                setError(saveRes.error);
                return;
            }
            const res = await signOffSubItemDesign(subItem.id);
            if ('error' in res) setError(res.error);
            else router.refresh();
        });
    };

    const reverse = (which: 'design' | 'production') => {
        setError(null);
        if (!confirm(`Reverse ${which} sign-off for sub-item ${subItem.label}?`)) return;
        startTransition(async () => {
            const res = await reverseSubItemSignOff(subItem.id, which);
            if ('error' in res) setError(res.error);
            else router.refresh();
        });
    };

    const del = () => {
        setError(null);
        if (!confirm(`Delete sub-item ${subItem.label}? This cannot be undone.`)) return;
        startTransition(async () => {
            const res = await deleteSubItem(subItem.id);
            if ('error' in res) setError(res.error);
            else router.refresh();
        });
    };

    return (
        <div className="border border-neutral-200 rounded-[var(--radius-md)] bg-white overflow-hidden">
            {/* Collapsed header */}
            <button
                onClick={() => setExpanded((v) => !v)}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-neutral-50 text-left"
            >
                <span className="shrink-0 w-8 h-8 rounded bg-neutral-900 text-white font-mono text-xs font-bold flex items-center justify-center">
                    {subItem.label}
                </span>
                <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                        {subItem.name || <span className="text-neutral-400 italic">unnamed</span>}
                    </p>
                    <p className="text-xs text-neutral-500 truncate">
                        {subItem.material || 'no material set'}
                        {subItem.width_mm && subItem.height_mm
                            ? ` · ${subItem.width_mm} × ${subItem.height_mm} mm`
                            : ''}
                        {subItem.quantity > 1 ? ` · ×${subItem.quantity}` : ''}
                    </p>
                </div>
                {stageName && <Chip>{stageName}</Chip>}
                <Chip variant={status.variant}>{status.label}</Chip>
                {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>

            {expanded && (
                <div className="px-4 py-4 border-t border-neutral-200 space-y-4">
                    {error && (
                        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                            {error}
                        </p>
                    )}

                    {/* THUMBNAIL — optional per-sub-item close-up */}
                    <section>
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">
                            thumbnail <span className="text-neutral-400 normal-case">· optional</span>
                        </h3>
                        <ThumbnailUpload
                            currentUrl={subItem.thumbnail_url ?? null}
                            uploadAction={(fd) => uploadSubItemThumbnail(subItem.id, fd)}
                            removeAction={() => removeSubItemThumbnail(subItem.id)}
                            size="sm"
                            label="sub-item thumbnail"
                            readOnly={productionLocked || readOnly}
                        />
                    </section>

                    {/* DESIGN */}
                    <section>
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">
                            design{' '}
                            {designLocked && (
                                <span className="text-green-700 normal-case">· signed off</span>
                            )}
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="name">
                                <input
                                    disabled={designLocked || readOnly}
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="e.g. QUEEN BEE letters"
                                    className={INPUT_CLS}
                                />
                            </Field>
                            <Field label="quantity">
                                <input
                                    type="number"
                                    min={1}
                                    disabled={designLocked || readOnly}
                                    value={quantity}
                                    onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                                    className={INPUT_CLS}
                                />
                            </Field>
                            <Field label="material">
                                <input
                                    disabled={designLocked || readOnly}
                                    value={material}
                                    onChange={(e) => setMaterial(e.target.value)}
                                    placeholder="e.g. 5mm rose-gold mirrored acrylic"
                                    className={INPUT_CLS}
                                />
                            </Field>
                            <Field label="application method">
                                <input
                                    disabled={designLocked || readOnly}
                                    value={method}
                                    onChange={(e) => setMethod(e.target.value)}
                                    placeholder="e.g. stuck to face"
                                    className={INPUT_CLS}
                                />
                            </Field>
                            <Field label="finish">
                                <input
                                    disabled={designLocked || readOnly}
                                    value={finish}
                                    onChange={(e) => setFinish(e.target.value)}
                                    placeholder="e.g. rose gold mirror"
                                    className={INPUT_CLS}
                                />
                            </Field>
                            <Field label="target department">
                                <select
                                    disabled={designLocked || readOnly}
                                    value={stageId}
                                    onChange={(e) => setStageId(e.target.value)}
                                    className={INPUT_CLS}
                                >
                                    <option value="">— select —</option>
                                    {stages.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.name}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                            <Field label="width (mm)">
                                <input
                                    type="number"
                                    step="0.1"
                                    disabled={designLocked || readOnly}
                                    value={widthMm}
                                    onChange={(e) => setWidthMm(e.target.value)}
                                    className={INPUT_CLS}
                                />
                            </Field>
                            <Field label="height (mm)">
                                <input
                                    type="number"
                                    step="0.1"
                                    disabled={designLocked || readOnly}
                                    value={heightMm}
                                    onChange={(e) => setHeightMm(e.target.value)}
                                    className={INPUT_CLS}
                                />
                            </Field>
                            <Field label="returns (mm)">
                                <input
                                    type="number"
                                    step="0.1"
                                    disabled={designLocked || readOnly}
                                    value={returnsMm}
                                    onChange={(e) => setReturnsMm(e.target.value)}
                                    className={INPUT_CLS}
                                />
                            </Field>
                        </div>
                        <div className="mt-3">
                            <Field label="notes">
                                <textarea
                                    disabled={designLocked || readOnly}
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    rows={2}
                                    className={INPUT_CLS}
                                />
                            </Field>
                        </div>
                        {!readOnly && (
                            <div className="flex gap-2 mt-3">
                                {!designLocked && (
                                    <>
                                        <button
                                            disabled={pending}
                                            onClick={saveDesign}
                                            className="btn-secondary text-xs"
                                        >
                                            save
                                        </button>
                                        <button
                                            disabled={pending}
                                            onClick={doSignOffDesign}
                                            className="btn-primary text-xs inline-flex items-center gap-1"
                                        >
                                            <Check size={12} /> save &amp; sign off design
                                        </button>
                                    </>
                                )}
                                {designLocked && !productionLocked && (
                                    <button
                                        disabled={pending}
                                        onClick={() => reverse('design')}
                                        className="btn-secondary text-xs inline-flex items-center gap-1"
                                    >
                                        <RotateCcw size={12} /> reverse design sign-off
                                    </button>
                                )}
                            </div>
                        )}
                    </section>

                    {/* PRODUCTION section moved to the shop-floor / QA step —
                        intentionally hidden here. Measured dimensions,
                        material_confirmed, and rip_no_scaling_confirmed are
                        filled in by the production lads during fabrication,
                        not by designers on the artwork page. */}

                    {/* DELETE */}
                    {!readOnly && !designLocked && !productionLocked && (
                        <section className="pt-3 border-t border-neutral-100">
                            <button
                                onClick={del}
                                disabled={pending}
                                className="text-xs text-red-700 hover:underline inline-flex items-center gap-1"
                            >
                                <Trash2 size={12} /> delete sub-item
                            </button>
                        </section>
                    )}
                </div>
            )}
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                {label}
            </span>
            <div className="mt-0.5">{children}</div>
        </label>
    );
}
