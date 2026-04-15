'use client';

/**
 * Primary add-line-item card. Opens the generic manual-priced form — the
 * default path, works for any job type. The panel_letters_v1 engine-priced
 * form lives in a separate secondary card below (QuoteDetailClient).
 */

import { useState } from 'react';
import { Plus, FileText } from 'lucide-react';
import { Card } from '@/app/(portal)/components/ui';
import { GenericItemForm } from './GenericItemForm';

interface Props {
    quoteId: string;
}

export function AddItemPicker({ quoteId }: Props) {
    const [open, setOpen] = useState(false);

    if (open) {
        return (
            <Card className="mt-6">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-sm font-semibold text-neutral-900">
                            Add line item
                        </h2>
                        <p className="text-xs text-neutral-500 mt-0.5">
                            manual pricing · works for any job type
                        </p>
                    </div>
                </div>
                <GenericItemForm quoteId={quoteId} onDone={() => setOpen(false)} />
            </Card>
        );
    }

    return (
        <Card className="mt-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
                        <FileText size={16} className="text-neutral-500" />
                        Add line item
                    </h2>
                    <p className="text-xs text-neutral-500 mt-0.5">
                        manual pricing · works for any signage or service item
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="btn-primary inline-flex items-center gap-2 whitespace-nowrap"
                >
                    <Plus size={14} />
                    add item
                </button>
            </div>
        </Card>
    );
}
