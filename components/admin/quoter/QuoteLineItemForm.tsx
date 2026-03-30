'use client';

/**
 * QuoteLineItemForm Component
 * 
 * React Hook Form + Zod form for Panel + Letters v1 line items.
 * Includes live calculation preview and server-side validation on submit.
 */

import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import {
    panelLettersV1InputSchema,
    PanelLettersV1Input,
    PanelLettersV1Output,
    RateCard,
    OVERRIDE_REASON_CODES
} from '@/lib/quoter/types';
import { recalculatePanelLettersV1Action, addQuoteItemAction, updateQuoteItemAction } from '@/lib/quoter/actions';
import { LetterSetFields } from './LetterSetFields';
import { QuoteSummary } from './QuoteSummary';

interface QuoteLineItemFormProps {
    quoteId: string;
    pricingSetId: string;
    rateCard: {
        panelMaterials: string[];
        panelFinishes: string[];
        finishRulesByType: Record<string, string[]>;
        availableHeights?: number[];
        letterPriceKeys?: string[];
    };
    onSuccess: () => void;
    onCancel: () => void;
    initialValues?: PanelLettersV1Input;
    itemId?: string;
}

const PANEL_SIZES = ['2.4 x 1.2', '3 x 1.5'] as const;
const TRANSFORMER_TYPES = ['20W', '60W', '100W', '150W'] as const;
const OPAL_TYPES = ['Opal (5mm)', 'Opal (10mm)'] as const;

const defaultValues: PanelLettersV1Input = {
    width_mm: 2400,
    height_mm: 1200,
    allowance_mm: 0,
    panel_size: '2.4 x 1.2',
    panel_material: 'Aluminium 2.5mm',
    panel_finish: 'Powder Coating',
    aperture: undefined,
    letter_sets: [
        { type: 'Fabricated', qty: 1, height_mm: 200, finish: 'Powder Coating', illuminated: false },
    ],
    labour_hours: { router: 0, fabrication: 0, assembly: 0, vinyl: 0, print: 0 },
    transformer_type: '60W',
    markup_percent: 20,
};

export function QuoteLineItemForm({
    quoteId,
    pricingSetId,
    rateCard,
    onSuccess,
    onCancel,
    initialValues,
    itemId,
}: QuoteLineItemFormProps) {
    const isEditMode = !!itemId && !!initialValues;
    const [output, setOutput] = useState<PanelLettersV1Output | null>(null);
    const [isCalculating, setIsCalculating] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [hasAperture, setHasAperture] = useState(!!initialValues?.aperture);

    const form = useForm<PanelLettersV1Input>({
        resolver: zodResolver(panelLettersV1InputSchema),
        defaultValues: initialValues || {
            ...defaultValues,
            panel_material: rateCard.panelMaterials[0] || 'Aluminium 2.5mm',
            panel_finish: rateCard.panelFinishes[0] || 'Powder Coating',
        },
        mode: 'onChange',
    });

    const watchedValues = form.watch();

    // Convert finishRulesByType to Map for LetterSetFields
    const allowedFinishesMap = new Map<string, Set<string>>();
    for (const [type, finishes] of Object.entries(rateCard.finishRulesByType)) {
        allowedFinishesMap.set(type, new Set(finishes));
    }

    // Debounced recalculation
    const recalculate = useCallback(async (input: PanelLettersV1Input) => {
        setIsCalculating(true);
        try {
            const result = await recalculatePanelLettersV1Action(pricingSetId, input);
            setOutput(result.output as unknown as PanelLettersV1Output);
        } catch (err) {
            console.error('Recalculation error:', err);
        } finally {
            setIsCalculating(false);
        }
    }, [pricingSetId]);

    // Recalculate on form changes (debounced)
    useEffect(() => {
        const timeout = setTimeout(() => {
            // Only recalculate if form has valid structure
            if (watchedValues.letter_sets?.length > 0) {
                // Handle aperture based on checkbox
                const inputWithAperture = {
                    ...watchedValues,
                    aperture: hasAperture ? watchedValues.aperture : undefined,
                };
                recalculate(inputWithAperture);
            }
        }, 500);

        return () => clearTimeout(timeout);
    }, [watchedValues, hasAperture, recalculate]);

    const onSubmit = async (data: PanelLettersV1Input) => {
        setIsSaving(true);
        setSaveError(null);

        // Include or exclude aperture based on checkbox
        const finalInput = {
            ...data,
            aperture: hasAperture ? data.aperture : undefined,
        };

        try {
            const result = isEditMode
                ? await updateQuoteItemAction(quoteId, itemId, finalInput)
                : await addQuoteItemAction(quoteId, finalInput);

            if ('error' in result) {
                setSaveError(result.error);
                return;
            }

            onSuccess();
        } catch (err) {
            setSaveError(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left column - Form inputs */}
                <div className="space-y-6">
                    {/* Panel Dimensions */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-neutral-900">Panel Dimensions</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-neutral-600 mb-1">
                                    Width (mm)
                                </label>
                                <input
                                    type="number"
                                    {...form.register('width_mm', { valueAsNumber: true })}
                                    className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-neutral-600 mb-1">
                                    Height (mm)
                                </label>
                                <input
                                    type="number"
                                    {...form.register('height_mm', { valueAsNumber: true })}
                                    className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-neutral-600 mb-1">
                                    Allowance (mm)
                                </label>
                                <input
                                    type="number"
                                    {...form.register('allowance_mm', { valueAsNumber: true })}
                                    className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Panel Material and Finish */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-neutral-900">Panel Specifications</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-neutral-600 mb-1">
                                    Sheet Size
                                </label>
                                <select
                                    {...form.register('panel_size')}
                                    className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                                >
                                    {PANEL_SIZES.map((size) => (
                                        <option key={size} value={size}>{size}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-neutral-600 mb-1">
                                    Material
                                </label>
                                <select
                                    {...form.register('panel_material')}
                                    className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                                >
                                    {rateCard.panelMaterials.map((material) => (
                                        <option key={material} value={material}>{material}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-neutral-600 mb-1">
                                    Finish
                                </label>
                                <select
                                    {...form.register('panel_finish')}
                                    className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                                >
                                    {rateCard.panelFinishes.map((finish) => (
                                        <option key={finish} value={finish}>{finish}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Aperture (optional) */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="hasAperture"
                                checked={hasAperture}
                                onChange={(e) => setHasAperture(e.target.checked)}
                                className="w-4 h-4 rounded border-neutral-300 text-black focus:ring-black"
                            />
                            <label htmlFor="hasAperture" className="text-sm font-semibold text-neutral-900 cursor-pointer">
                                Include Aperture
                            </label>
                        </div>

                        {hasAperture && (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-neutral-50 rounded-[var(--radius-sm)]">
                                <div>
                                    <label className="block text-xs font-medium text-neutral-600 mb-1">
                                        Width (mm)
                                    </label>
                                    <input
                                        type="number"
                                        {...form.register('aperture.width_mm', { valueAsNumber: true })}
                                        className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-neutral-600 mb-1">
                                        Height (mm)
                                    </label>
                                    <input
                                        type="number"
                                        {...form.register('aperture.height_mm', { valueAsNumber: true })}
                                        className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-neutral-600 mb-1">
                                        Opal Type
                                    </label>
                                    <select
                                        {...form.register('aperture.opal_type')}
                                        className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                                    >
                                        {OPAL_TYPES.map((type) => (
                                            <option key={type} value={type}>{type}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Letter Sets */}
                    <LetterSetFields form={form} allowedFinishes={allowedFinishesMap} />

                    {/* Labour Hours */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-neutral-900">Labour Hours</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                            {(['router', 'fabrication', 'assembly', 'vinyl', 'print'] as const).map((task) => (
                                <div key={task}>
                                    <label className="block text-xs font-medium text-neutral-600 mb-1 capitalize">
                                        {task}
                                    </label>
                                    <input
                                        type="number"
                                        step="0.5"
                                        min="0"
                                        {...form.register(`labour_hours.${task}`, { valueAsNumber: true })}
                                        className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Overrides */}
                    <div className="space-y-4 p-4 bg-amber-50/30 rounded-[var(--radius-sm)] border border-amber-200">
                        <h3 className="text-sm font-semibold text-neutral-900">Overrides (Optional)</h3>

                        <div className="space-y-6">
                            {/* Markup Override */}
                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="overrideMarkup"
                                        onChange={(e) => {
                                            if (!e.target.checked) {
                                                form.setValue('overrides.markup_percent', undefined);
                                            } else {
                                                form.setValue('overrides.markup_percent', {
                                                    original: watchedValues.markup_percent,
                                                    override: watchedValues.markup_percent,
                                                    reason_code: 'customer_discount',
                                                    note: '',
                                                });
                                            }
                                        }}
                                        checked={!!watchedValues.overrides?.markup_percent}
                                        className="w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                                    />
                                    <label htmlFor="overrideMarkup" className="text-xs font-semibold text-neutral-700 cursor-pointer">
                                        Override Markup %
                                    </label>
                                </div>

                                {watchedValues.overrides?.markup_percent && (
                                    <div className="grid grid-cols-3 gap-3 pl-6 border-l-2 border-amber-200">
                                        <div>
                                            <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">New Markup %</label>
                                            <input
                                                type="number"
                                                {...form.register('overrides.markup_percent.override', { valueAsNumber: true })}
                                                className="w-full px-2 py-1.5 text-xs border border-neutral-200 rounded focus:ring-1 focus:ring-amber-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Reason</label>
                                            <select
                                                {...form.register('overrides.markup_percent.reason_code')}
                                                className="w-full px-2 py-1.5 text-xs border border-neutral-200 rounded focus:ring-1 focus:ring-amber-500"
                                            >
                                                {OVERRIDE_REASON_CODES.map(code => (
                                                    <option key={code} value={code}>{code.replace(/_/g, ' ')}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Note</label>
                                            <input
                                                type="text"
                                                {...form.register('overrides.markup_percent.note')}
                                                placeholder="Required..."
                                                className="w-full px-2 py-1.5 text-xs border border-neutral-200 rounded focus:ring-1 focus:ring-amber-500"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Labour Overrides */}
                            <div className="space-y-3">
                                <h4 className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Labour Overrides</h4>
                                {(['router', 'fabrication', 'assembly', 'vinyl', 'print'] as const).map((task) => (
                                    <div key={task} className="space-y-2">
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                id={`overrideLabour-${task}`}
                                                onChange={(e) => {
                                                    if (!e.target.checked) {
                                                        form.setValue(`overrides.labour_hours.${task}`, undefined);
                                                    } else {
                                                        form.setValue(`overrides.labour_hours.${task}`, {
                                                            original: watchedValues.labour_hours[task],
                                                            override: watchedValues.labour_hours[task],
                                                            reason_code: 'labour_variance',
                                                            note: '',
                                                        });
                                                    }
                                                }}
                                                checked={!!watchedValues.overrides?.labour_hours?.[task]}
                                                className="w-3 h-3 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                                            />
                                            <label htmlFor={`overrideLabour-${task}`} className="text-[11px] font-medium text-neutral-600 cursor-pointer capitalize">
                                                {task} Labour
                                            </label>
                                        </div>

                                        {watchedValues.overrides?.labour_hours?.[task] && (
                                            <div className="grid grid-cols-3 gap-3 pl-5 border-l-2 border-amber-200 pb-2">
                                                <div>
                                                    <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-0.5">New Hours</label>
                                                    <input
                                                        type="number"
                                                        step="0.5"
                                                        {...form.register(`overrides.labour_hours.${task}.override`, { valueAsNumber: true })}
                                                        className="w-full px-2 py-1 text-xs border border-neutral-200 rounded focus:ring-1 focus:ring-amber-500"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-0.5">Reason</label>
                                                    <select
                                                        {...form.register(`overrides.labour_hours.${task}.reason_code`)}
                                                        className="w-full px-2 py-1 text-xs border border-neutral-200 rounded focus:ring-1 focus:ring-amber-500"
                                                    >
                                                        {OVERRIDE_REASON_CODES.map(code => (
                                                            <option key={code} value={code}>{code.replace(/_/g, ' ')}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-0.5">Note</label>
                                                    <input
                                                        type="text"
                                                        {...form.register(`overrides.labour_hours.${task}.note`)}
                                                        placeholder="Required..."
                                                        className="w-full px-2 py-1 text-xs border border-neutral-200 rounded focus:ring-1 focus:ring-amber-500"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Transformer and Markup */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-neutral-600 mb-1">
                                Transformer Type
                            </label>
                            <select
                                {...form.register('transformer_type')}
                                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                            >
                                {TRANSFORMER_TYPES.map((type) => (
                                    <option key={type} value={type}>{type}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-neutral-600 mb-1">
                                Markup (%)
                            </label>
                            <input
                                type="number"
                                min="0"
                                max="100"
                                {...form.register('markup_percent', { valueAsNumber: true })}
                                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                            />
                        </div>
                    </div>
                </div>

                {/* Right column - Breakdown */}
                <div className="sticky top-4">
                    <QuoteSummary output={output} isCalculating={isCalculating} />
                </div>
            </div>

            {/* Error display */}
            {saveError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-[var(--radius-sm)]">
                    <p className="text-sm text-red-700">{saveError}</p>
                </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200">
                <button
                    type="button"
                    onClick={onCancel}
                    className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900"
                    disabled={isSaving}
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={isSaving || !output?.ok}
                    className="px-4 py-2 text-sm font-medium bg-black text-white rounded-[var(--radius-sm)] hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                    {isSaving && <Loader2 size={14} className="animate-spin" />}
                    {isEditMode ? 'Update Line Item' : 'Add Line Item'}
                </button>
            </div>
        </form>
    );
}
