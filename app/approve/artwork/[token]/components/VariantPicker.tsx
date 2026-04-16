'use client';

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
    /** When provided, clicking an image opens the caller's lightbox. */
    onZoom?: (url: string, alt: string) => void;
}

/**
 * Per-component variant picker for the client approval page.
 *
 * - Images are click-to-zoom (opens lightbox via onZoom).
 * - Selection is via a radio button beneath the description, so only
 *   one variant per component can be picked at a time.
 */
export function VariantPicker({ componentName, variants, chosenVariantId, onChoose, onZoom }: Props) {
    if (variants.length === 0) {
        return (
            <p className="text-sm italic text-neutral-500">
                No variants provided for {componentName}.
            </p>
        );
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {variants.map((v) => {
                const chosen = chosenVariantId === v.id;
                const alt = v.name ?? `Option ${v.label}`;

                return (
                    <div
                        key={v.id}
                        className={`rounded-lg border-2 overflow-hidden transition-colors ${
                            chosen
                                ? 'border-green-700 bg-green-50 ring-2 ring-green-700'
                                : 'border-neutral-200'
                        }`}
                    >
                        {/* Image — click to zoom, NOT to select */}
                        {v.thumbnail_url ? (
                            <button
                                type="button"
                                onClick={() => onZoom?.(v.thumbnail_url!, alt)}
                                className="block w-full cursor-zoom-in relative group"
                                aria-label={`Zoom ${alt}`}
                            >
                                <img
                                    src={v.thumbnail_url}
                                    alt={alt}
                                    className="w-full h-48 sm:h-56 object-cover"
                                />
                                <span className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                    <span className="opacity-0 group-hover:opacity-100 bg-black/70 text-white text-xs font-semibold px-3 py-1.5 rounded-full transition-opacity">
                                        click to zoom
                                    </span>
                                </span>
                            </button>
                        ) : (
                            <div className="w-full h-48 sm:h-56 bg-neutral-100 flex items-center justify-center text-neutral-400 text-sm italic">
                                no image
                            </div>
                        )}

                        {/* Info + radio selection */}
                        <div className="p-3">
                            <p className="text-sm font-bold text-neutral-900">
                                {v.label}{v.name ? ` — ${v.name}` : ''}
                            </p>
                            {v.description && (
                                <p className="text-xs text-neutral-600 mt-1 leading-relaxed">
                                    {v.description}
                                </p>
                            )}

                            {/* Radio button — the ONLY way to select */}
                            <label
                                className={`mt-3 flex items-center gap-2 cursor-pointer rounded-lg border px-3 py-2.5 transition-colors ${
                                    chosen
                                        ? 'border-green-700 bg-green-100 text-green-900'
                                        : 'border-neutral-300 hover:border-neutral-400 text-neutral-700'
                                }`}
                            >
                                <input
                                    type="radio"
                                    name={`variant-${componentName}`}
                                    checked={chosen}
                                    onChange={() => onChoose(v.id)}
                                    className="accent-green-700 w-4 h-4 shrink-0"
                                />
                                <span className="text-xs font-semibold">
                                    {chosen ? '✓ This is my choice' : 'Choose this design'}
                                </span>
                            </label>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
