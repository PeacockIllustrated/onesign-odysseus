'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArtworkComponentWithVersions } from '@/lib/artwork/types';
import { submitProductionMeasurements, signOffProduction } from '@/lib/artwork/actions';
import { canProceedToProduction, formatDimensions, formatDateTime } from '@/lib/artwork/utils';
import { Modal } from '@/app/(portal)/components/ui';
import { Loader2, Check, Lock, AlertTriangle } from 'lucide-react';

interface ProductionSectionProps {
    component: ArtworkComponentWithVersions;
    jobId: string;
}

export function ProductionSection({ component, jobId }: ProductionSectionProps) {
    const router = useRouter();
    const [submitting, setSubmitting] = useState(false);
    const [signingOff, setSigningOff] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showSignOffModal, setShowSignOffModal] = useState(false);

    // Form state
    const [measuredWidth, setMeasuredWidth] = useState(
        component.measured_width_mm ? String(component.measured_width_mm) : ''
    );
    const [measuredHeight, setMeasuredHeight] = useState(
        component.measured_height_mm ? String(component.measured_height_mm) : ''
    );
    const [materialConfirmed, setMaterialConfirmed] = useState(component.material_confirmed);
    const [ripConfirmed, setRipConfirmed] = useState(component.rip_no_scaling_confirmed);
    const [productionNotes, setProductionNotes] = useState(component.production_notes || '');

    // Extra item measurement state
    const [itemMeasurements, setItemMeasurements] = useState<Record<string, { width: string; height: string }>>(
        Object.fromEntries(
            (component.extra_items || []).map(item => [
                item.id,
                {
                    width: item.measured_width_mm ? String(item.measured_width_mm) : '',
                    height: item.measured_height_mm ? String(item.measured_height_mm) : '',
                }
            ])
        )
    );

    const canProceed = canProceedToProduction(component);
    const isProductionComplete = component.status === 'production_complete';

    // Locked state: design not signed off
    if (!canProceed) {
        return (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-[var(--radius-sm)]">
                <div className="flex items-center gap-2 mb-1">
                    <Lock size={14} className="text-amber-600" />
                    <span className="text-sm font-medium text-amber-800">awaiting design sign-off</span>
                </div>
                <p className="text-xs text-amber-600">
                    production checklist will unlock after the designer signs off on the artwork specifications
                </p>
            </div>
        );
    }

    // Completed state
    if (isProductionComplete) {
        return (
            <div className="space-y-4">
                <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-[var(--radius-sm)]">
                    <Check size={14} className="text-emerald-600" />
                    <span className="text-sm text-emerald-700 font-medium">production complete</span>
                    {component.production_signed_off_at && (
                        <span className="text-xs text-emerald-600 ml-auto">
                            {formatDateTime(component.production_signed_off_at)}
                        </span>
                    )}
                </div>

                {component.measured_width_mm && component.measured_height_mm && (
                    <div className="space-y-2">
                        <SpecRow
                            label={component.extra_items?.length ? 'item A measured' : 'measured dimensions'}
                            value={formatDimensions(
                                Number(component.measured_width_mm),
                                Number(component.measured_height_mm)
                            )}
                        />
                        {component.extra_items?.filter(i => i.measured_width_mm).map(item => (
                            <SpecRow
                                key={item.id}
                                label={`item ${item.label} measured`}
                                value={formatDimensions(Number(item.measured_width_mm), Number(item.measured_height_mm))}
                            />
                        ))}
                        <SpecRow label="material confirmed" value={component.material_confirmed ? 'yes' : 'no'} />
                        <SpecRow label="RIP no scaling" value={component.rip_no_scaling_confirmed ? 'confirmed' : 'no'} />
                        {component.production_notes && (
                            <SpecRow label="notes" value={component.production_notes} />
                        )}
                    </div>
                )}

                {component.dimension_flag === 'out_of_tolerance' && (
                    <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-[var(--radius-sm)]">
                        <AlertTriangle size={14} className="text-red-600" />
                        <span className="text-xs text-red-700">
                            signed off with out-of-tolerance dimensions
                        </span>
                    </div>
                )}
            </div>
        );
    }

    const handleSubmitMeasurements = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            const result = await submitProductionMeasurements(component.id, {
                measured_width_mm: parseFloat(measuredWidth),
                measured_height_mm: parseFloat(measuredHeight),
                material_confirmed: materialConfirmed,
                rip_no_scaling_confirmed: ripConfirmed,
                production_notes: productionNotes || undefined,
                item_measurements: component.extra_items?.length
                    ? component.extra_items.map(item => ({
                        item_id: item.id,
                        measured_width_mm: parseFloat(itemMeasurements[item.id]?.width || '0'),
                        measured_height_mm: parseFloat(itemMeasurements[item.id]?.height || '0'),
                    }))
                    : undefined,
            });

            if ('error' in result) {
                setError(result.error);
                setSubmitting(false);
                return;
            }

            setSubmitting(false);
            router.refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'failed to submit measurements');
            setSubmitting(false);
        }
    };

    const handleSignOff = async () => {
        setShowSignOffModal(false);
        setSigningOff(true);
        setError(null);

        try {
            const result = await signOffProduction(component.id);

            if ('error' in result) {
                setError(result.error);
                setSigningOff(false);
                return;
            }

            setSigningOff(false);
            router.refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'failed to sign off production');
            setSigningOff(false);
        }
    };

    return (
        <>
            <form onSubmit={handleSubmitMeasurements} className="space-y-4">
                {error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-[var(--radius-sm)] text-sm text-red-700">
                        {error}
                    </div>
                )}

                {/* Spec reference */}
                {component.width_mm && component.height_mm && (
                    <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-[var(--radius-sm)]">
                        <p className="text-xs text-neutral-500 mb-1">design spec reference</p>
                        <p className="text-sm font-medium">
                            {component.extra_items?.length ? 'A: ' : ''}
                            {formatDimensions(Number(component.width_mm), Number(component.height_mm))}
                            {component.material && ` — ${component.material}`}
                        </p>
                        {component.extra_items?.map((item) => (
                            <p key={item.id} className="text-sm font-medium">
                                {item.label}: {formatDimensions(Number(item.width_mm), Number(item.height_mm))}
                            </p>
                        ))}
                    </div>
                )}

                {/* Measured Dimensions — Item A */}
                {component.extra_items?.length ? (
                    <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">item A measurements</p>
                ) : null}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs font-medium text-neutral-700 mb-1">
                            measured width (mm) <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            value={measuredWidth}
                            onChange={(e) => setMeasuredWidth(e.target.value)}
                            placeholder="2990"
                            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                            required
                            disabled={submitting}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-neutral-700 mb-1">
                            measured height (mm) <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            value={measuredHeight}
                            onChange={(e) => setMeasuredHeight(e.target.value)}
                            placeholder="1395"
                            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                            required
                            disabled={submitting}
                        />
                    </div>
                </div>

                {/* Extra item measurements */}
                {component.extra_items?.map((item) => (
                    <div key={item.id} className="mt-3 pt-3 border-t border-neutral-100">
                        <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">item {item.label} measurements</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-neutral-700 mb-1">
                                    measured width (mm) <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={itemMeasurements[item.id]?.width || ''}
                                    onChange={(e) => setItemMeasurements(prev => ({
                                        ...prev,
                                        [item.id]: { ...prev[item.id], width: e.target.value }
                                    }))}
                                    placeholder={item.width_mm ? String(item.width_mm) : ''}
                                    className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                                    required
                                    disabled={submitting}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-neutral-700 mb-1">
                                    measured height (mm) <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={itemMeasurements[item.id]?.height || ''}
                                    onChange={(e) => setItemMeasurements(prev => ({
                                        ...prev,
                                        [item.id]: { ...prev[item.id], height: e.target.value }
                                    }))}
                                    placeholder={item.height_mm ? String(item.height_mm) : ''}
                                    className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                                    required
                                    disabled={submitting}
                                />
                            </div>
                        </div>
                    </div>
                ))}

                {/* Confirmations */}
                <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                            type="checkbox"
                            checked={materialConfirmed}
                            onChange={(e) => setMaterialConfirmed(e.target.checked)}
                            className="rounded border-neutral-300"
                            disabled={submitting}
                        />
                        <span>material pulled and confirmed correct</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                            type="checkbox"
                            checked={ripConfirmed}
                            onChange={(e) => setRipConfirmed(e.target.checked)}
                            className="rounded border-neutral-300"
                            disabled={submitting}
                        />
                        <span>RIP output checked — no scaling applied</span>
                    </label>
                </div>

                {/* Production Notes */}
                <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1">production notes</label>
                    <textarea
                        value={productionNotes}
                        onChange={(e) => setProductionNotes(e.target.value)}
                        rows={2}
                        placeholder="any notes from production..."
                        className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black resize-none"
                        disabled={submitting}
                    />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-4 border-t border-neutral-200">
                    <button
                        type="submit"
                        disabled={submitting}
                        className="btn-primary inline-flex items-center gap-2"
                    >
                        {submitting && <Loader2 size={16} className="animate-spin" />}
                        {submitting ? 'saving...' : 'save measurements'}
                    </button>

                    {component.status === 'in_production' && (
                        <button
                            type="button"
                            onClick={() => setShowSignOffModal(true)}
                            disabled={signingOff}
                            className="btn-secondary inline-flex items-center gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                        >
                            {signingOff ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <Check size={16} />
                            )}
                            {signingOff ? 'signing off...' : 'sign off production'}
                        </button>
                    )}
                </div>
            </form>

            {/* Production Sign-Off Confirmation Modal */}
            <Modal open={showSignOffModal} onClose={() => setShowSignOffModal(false)} title="sign off production">
                <div className="space-y-4">
                    <p className="text-sm text-neutral-600">
                        are you sure you want to sign off production for this component? this confirms the fabrication is correct and matches the design specifications.
                    </p>
                    {component.measured_width_mm && component.measured_height_mm && (
                        <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-[var(--radius-sm)] text-xs space-y-1">
                            <div className="flex justify-between">
                                <span className="text-neutral-500">{component.extra_items?.length ? 'A measured' : 'measured'}</span>
                                <span className="font-medium">
                                    {formatDimensions(Number(component.measured_width_mm), Number(component.measured_height_mm))}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-neutral-500">{component.extra_items?.length ? 'A spec' : 'design spec'}</span>
                                <span className="font-medium">
                                    {formatDimensions(Number(component.width_mm), Number(component.height_mm))}
                                </span>
                            </div>
                            {component.extra_items?.map((item) => (
                                <div key={item.id}>
                                    <div className="flex justify-between">
                                        <span className="text-neutral-500">{item.label} measured</span>
                                        <span className="font-medium">
                                            {item.measured_width_mm && item.measured_height_mm
                                                ? formatDimensions(Number(item.measured_width_mm), Number(item.measured_height_mm))
                                                : '—'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-neutral-500">{item.label} spec</span>
                                        <span className="font-medium">
                                            {formatDimensions(Number(item.width_mm), Number(item.height_mm))}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    {(component.dimension_flag === 'out_of_tolerance' || component.extra_items?.some(i => i.dimension_flag === 'out_of_tolerance')) && (
                        <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-[var(--radius-sm)]">
                            <AlertTriangle size={14} className="text-red-600" />
                            <span className="text-xs text-red-700 font-medium">
                                dimensions are out of tolerance — this will be recorded
                            </span>
                        </div>
                    )}
                    <div className="flex items-center gap-3 pt-2">
                        <button
                            type="button"
                            onClick={handleSignOff}
                            className="btn-primary inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700"
                        >
                            <Check size={16} />
                            confirm sign-off
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowSignOffModal(false)}
                            className="btn-secondary"
                        >
                            cancel
                        </button>
                    </div>
                </div>
            </Modal>
        </>
    );
}

function SpecRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between py-1.5 border-b border-neutral-100 last:border-0">
            <span className="text-xs text-neutral-500">{label}</span>
            <span className="text-xs text-neutral-900">{value}</span>
        </div>
    );
}
