'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, ChevronDown, ChevronUp, Copy, Trash2, Loader2, Edit2, X } from 'lucide-react';
import { QuoteLineItemForm } from '@/components/admin/quoter/QuoteLineItemForm';
import { Card } from '@/app/(portal)/components/ui';
import { duplicateQuoteItemAction, deleteQuoteItemAction } from '@/lib/quoter/actions';
import { PanelLettersV1Input } from '@/lib/quoter/types';

interface QuoteDetailClientProps {
    quoteId: string;
    pricingSetId: string;
    rateCard: {
        panelMaterials: string[];
        panelFinishes: string[];
        finishRulesByType: Record<string, string[]>;
        availableHeights?: number[];
        letterPriceKeys?: string[];
    };
    itemId?: string;
    mode?: 'add-form' | 'item-actions';
    initialValues?: PanelLettersV1Input;
}

export function QuoteDetailClient({
    quoteId,
    pricingSetId,
    rateCard,
    itemId,
    mode = 'add-form',
    initialValues,
}: QuoteDetailClientProps) {
    const router = useRouter();
    const [showForm, setShowForm] = useState(false);
    const [isEditingItem, setIsEditingItem] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const handleSuccess = () => {
        setShowForm(false);
        setIsEditingItem(false);
        router.refresh();
    };

    const handleDuplicateItem = async () => {
        if (!itemId) return;

        setIsLoading(true);
        try {
            const result = await duplicateQuoteItemAction(quoteId, itemId);
            if ('error' in result) {
                alert(result.error);
            } else {
                router.refresh();
            }
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to duplicate');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteItem = async () => {
        if (!itemId) return;
        if (!confirm('Delete this line item?')) return;

        setIsLoading(true);
        try {
            const result = await deleteQuoteItemAction(quoteId, itemId);
            if ('error' in result) {
                alert(result.error);
            } else {
                router.refresh();
            }
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to delete');
        } finally {
            setIsLoading(false);
        }
    };

    // Item actions mode - show duplicate/delete buttons
    if (mode === 'item-actions' && itemId) {
        if (isEditingItem && initialValues) {
            return (
                <div className="mt-4 border-t border-neutral-200 pt-4">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold text-neutral-900">Edit Line Item</h3>
                        <button
                            onClick={() => setIsEditingItem(false)}
                            className="text-neutral-500 hover:text-neutral-900"
                        >
                            <X size={16} />
                        </button>
                    </div>
                    <QuoteLineItemForm
                        quoteId={quoteId}
                        pricingSetId={pricingSetId}
                        rateCard={rateCard}
                        onSuccess={handleSuccess}
                        onCancel={() => setIsEditingItem(false)}
                        initialValues={initialValues}
                        itemId={itemId}
                    />
                </div>
            );
        }

        return (
            <div className="flex items-center gap-2 mt-1">
                <button
                    onClick={() => setIsEditingItem(true)}
                    disabled={isLoading}
                    className="text-xs text-neutral-500 hover:text-neutral-700 disabled:opacity-50"
                    title="Edit item"
                >
                    <Edit2 size={12} />
                </button>
                <button
                    onClick={handleDuplicateItem}
                    disabled={isLoading}
                    className="text-xs text-neutral-500 hover:text-neutral-700 disabled:opacity-50"
                    title="Duplicate item"
                >
                    {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Copy size={12} />}
                </button>
                <button
                    onClick={handleDeleteItem}
                    disabled={isLoading}
                    className="text-xs text-neutral-500 hover:text-red-600 disabled:opacity-50"
                    title="Delete item"
                >
                    <Trash2 size={12} />
                </button>
            </div>
        );
    }

    // Add form mode — the engine-priced Panel + Letters calculator.
    // This is the SECONDARY path; the primary "Add line item" (manual price,
    // any job type) lives in AddItemPicker above.
    return (
        <Card className="mt-6 bg-neutral-50 border-neutral-200">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-neutral-700">
                            Specialised: Panel + Letters calculator
                        </h3>
                        <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                            engine
                        </span>
                    </div>
                    <p className="text-xs text-neutral-500 mt-0.5">
                        engine-priced from the rate card · dynamic pricing for more job types is coming in later phases
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setShowForm(!showForm)}
                    className="btn-secondary inline-flex items-center gap-2 whitespace-nowrap"
                >
                    {showForm ? (
                        <>
                            <ChevronUp size={14} />
                            hide calculator
                        </>
                    ) : (
                        <>
                            <Plus size={14} />
                            use calculator
                        </>
                    )}
                </button>
            </div>

            {showForm && (
                <div className="mt-4 pt-4 border-t border-neutral-200">
                    <QuoteLineItemForm
                        quoteId={quoteId}
                        pricingSetId={pricingSetId}
                        rateCard={rateCard}
                        onSuccess={handleSuccess}
                        onCancel={() => setShowForm(false)}
                    />
                </div>
            )}
        </Card>
    );
}
