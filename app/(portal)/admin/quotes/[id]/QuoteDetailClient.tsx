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

    // Add form mode
    return (
        <Card>
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-neutral-900">Add Line Item</h2>
                <button
                    type="button"
                    onClick={() => setShowForm(!showForm)}
                    className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                    {showForm ? (
                        <>
                            <ChevronUp size={16} />
                            Hide Form
                        </>
                    ) : (
                        <>
                            <Plus size={16} />
                            Panel + Letters (v1)
                        </>
                    )}
                </button>
            </div>

            {showForm && (
                <QuoteLineItemForm
                    quoteId={quoteId}
                    pricingSetId={pricingSetId}
                    rateCard={rateCard}
                    onSuccess={handleSuccess}
                    onCancel={() => setShowForm(false)}
                />
            )}

            {!showForm && (
                <p className="text-sm text-neutral-500 py-4 text-center">
                    Click &quot;Panel + Letters (v1)&quot; to add a line item
                </p>
            )}
        </Card>
    );
}
