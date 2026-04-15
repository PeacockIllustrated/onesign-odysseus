'use client';

/**
 * Picker that sits above the existing panel_letters_v1 add-form.
 * Lets the user choose between the engine-calculated form and the
 * generic manual-priced form.
 */

import { useState } from 'react';
import { Plus, Calculator, FileText } from 'lucide-react';
import { Card } from '@/app/(portal)/components/ui';
import { GenericItemForm } from './GenericItemForm';

interface Props {
    quoteId: string;
}

export function AddItemPicker({ quoteId }: Props) {
    const [mode, setMode] = useState<'closed' | 'generic'>('closed');

    if (mode === 'generic') {
        return (
            <Card className="mt-6">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-sm font-semibold text-neutral-900">
                            add generic line item
                        </h2>
                        <p className="text-xs text-neutral-500">
                            manual pricing · for anything the panel + letters engine doesn&rsquo;t cover
                        </p>
                    </div>
                </div>
                <GenericItemForm quoteId={quoteId} onDone={() => setMode('closed')} />
            </Card>
        );
    }

    return (
        <div className="mt-6 flex flex-wrap gap-2">
            <button
                type="button"
                onClick={() => setMode('generic')}
                className="btn-secondary inline-flex items-center gap-2"
            >
                <FileText size={14} />
                add generic item <span className="text-neutral-400 text-xs">(manual price)</span>
            </button>
            <p className="text-xs text-neutral-500 self-center ml-2">
                use the engine-calculated form below for panel + letters jobs
            </p>
        </div>
    );
}
