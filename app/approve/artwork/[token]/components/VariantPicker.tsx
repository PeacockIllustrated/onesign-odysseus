'use client';

import { Check } from 'lucide-react';

interface Variant {
    id: string;
    label: string;
    name: string | null;
    description: string | null;
    thumbnail_url: string | null;
}

interface Props {
    componentName: string;
    variants: Variant[];
    chosenVariantId: string | null;
    onChoose: (variantId: string) => void;
}

export function VariantPicker({ componentName, variants, chosenVariantId, onChoose }: Props) {
    if (variants.length === 0) {
        return (
            <p className="text-sm italic text-neutral-500">
                No variants provided for {componentName}.
            </p>
        );
    }

    if (variants.length === 1) {
        const v = variants[0];
        const chosen = chosenVariantId === v.id;
        return (
            <button
                type="button"
                onClick={() => onChoose(v.id)}
                className={`block w-full rounded-lg border-2 p-3 text-left transition-colors ${
                    chosen ? 'border-green-700 bg-green-50' : 'border-neutral-200 hover:border-neutral-400'
                }`}
            >
                <div className="flex items-start gap-3">
                    {v.thumbnail_url && (
                        <img src={v.thumbnail_url} alt={v.name ?? v.label} className="w-24 h-24 object-cover rounded" />
                    )}
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{v.name ?? `Option ${v.label}`}</p>
                        {v.description && <p className="text-xs text-neutral-600 mt-1">{v.description}</p>}
                    </div>
                    {chosen && <Check size={20} className="text-green-700" />}
                </div>
                <p className="mt-2 text-[11px] text-neutral-500">
                    {chosen ? '✓ Approved' : 'Tap to approve this design'}
                </p>
            </button>
        );
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {variants.map((v) => {
                const chosen = chosenVariantId === v.id;
                return (
                    <button
                        key={v.id}
                        type="button"
                        onClick={() => onChoose(v.id)}
                        className={`relative rounded-lg border-2 p-3 text-left transition-colors ${
                            chosen ? 'border-green-700 bg-green-50 ring-2 ring-green-700' : 'border-neutral-200 hover:border-neutral-400'
                        }`}
                    >
                        {chosen && (
                            <span className="absolute top-2 right-2 bg-green-700 text-white rounded-full p-1">
                                <Check size={14} />
                            </span>
                        )}
                        {v.thumbnail_url && (
                            <img
                                src={v.thumbnail_url}
                                alt={v.name ?? v.label}
                                className="w-full h-40 object-cover rounded mb-2"
                            />
                        )}
                        <p className="text-sm font-bold">
                            {v.label}{v.name ? ` — ${v.name}` : ''}
                        </p>
                        {v.description && <p className="text-xs text-neutral-600 mt-1">{v.description}</p>}
                    </button>
                );
            })}
        </div>
    );
}
