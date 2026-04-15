'use client';

import { Check, Maximize2 } from 'lucide-react';

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
    /** Optional — when provided, each variant thumbnail gets a "zoom"
     *  corner button that opens the image in the caller's lightbox
     *  without selecting the variant. */
    onZoom?: (url: string, alt: string) => void;
}

/**
 * Small zoom overlay button. Positioned absolute top-right of the
 * thumbnail wrapper. stopPropagation so tapping it doesn't also fire
 * the variant's onChoose handler.
 */
function ZoomBtn({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label="Zoom image"
            className="absolute top-2 left-2 z-10 bg-black/65 hover:bg-black/80 text-white rounded-full p-1.5 shadow-md"
        >
            <Maximize2 size={12} />
        </button>
    );
}

export function VariantPicker({ componentName, variants, chosenVariantId, onChoose, onZoom }: Props) {
    if (variants.length === 0) {
        return (
            <p className="text-sm italic text-neutral-500">
                No variants provided for {componentName}.
            </p>
        );
    }

    const handleZoom = (url: string, alt: string) => (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        if (onZoom) onZoom(url, alt);
    };

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
                        <div className="relative shrink-0">
                            <img
                                src={v.thumbnail_url}
                                alt={v.name ?? v.label}
                                className="w-24 h-24 object-cover rounded"
                            />
                            {onZoom && (
                                <ZoomBtn onClick={handleZoom(v.thumbnail_url, v.name ?? `Option ${v.label}`)} />
                            )}
                        </div>
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
                            <div className="relative mb-2">
                                <img
                                    src={v.thumbnail_url}
                                    alt={v.name ?? v.label}
                                    className="w-full h-40 object-cover rounded"
                                />
                                {onZoom && (
                                    <ZoomBtn onClick={handleZoom(v.thumbnail_url, v.name ?? `Option ${v.label}`)} />
                                )}
                            </div>
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
