'use client';

import { ResilientImage } from './ResilientImage';

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
 * Per-component variant picker for the client approval page (Studio dark skin).
 *
 * - Images are click-to-zoom (opens lightbox via onZoom).
 * - Selection is via a radio button beneath the description, so only
 *   one variant per component can be picked at a time.
 */
export function VariantPicker({ componentName, variants, chosenVariantId, onChoose, onZoom }: Props) {
    if (variants.length === 0) {
        return (
            <p className="text-sm italic text-white/50">
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
                        className={`rounded-2xl border overflow-hidden transition-all ${
                            chosen
                                ? 'border-[#9ed0dc] bg-[#9ed0dc]/10 ring-1 ring-[#9ed0dc]/60 shadow-[0_0_30px_-8px_rgba(158,208,220,0.5)]'
                                : 'border-white/10 bg-white/[0.03] hover:border-white/25'
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
                                <ResilientImage
                                    src={v.thumbnail_url}
                                    alt={alt}
                                    className="w-full h-48 sm:h-56 object-cover"
                                />
                                <span className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center">
                                    <span className="opacity-0 group-hover:opacity-100 bg-black/70 text-white text-xs font-semibold px-3 py-1.5 rounded-full transition-opacity backdrop-blur-sm">
                                        click to zoom
                                    </span>
                                </span>
                            </button>
                        ) : (
                            <div className="w-full h-48 sm:h-56 bg-white/[0.04] flex items-center justify-center text-white/40 text-sm italic">
                                no image
                            </div>
                        )}

                        {/* Info + radio selection */}
                        <div className="p-3.5">
                            <p className="text-sm font-bold text-white">
                                {v.label}{v.name ? ` — ${v.name}` : ''}
                            </p>
                            {v.description && (
                                <p className="text-xs text-white/60 mt-1 leading-relaxed">
                                    {v.description}
                                </p>
                            )}

                            {/* Radio button — the ONLY way to select */}
                            <label
                                className={`mt-3 flex items-center gap-2 cursor-pointer rounded-xl border px-3 py-2.5 transition-colors ${
                                    chosen
                                        ? 'border-[#9ed0dc]/70 bg-[#9ed0dc]/15 text-[#cdeaf1]'
                                        : 'border-white/15 hover:border-white/35 text-white/70'
                                }`}
                            >
                                <input
                                    type="radio"
                                    name={`variant-${componentName}`}
                                    checked={chosen}
                                    onChange={() => onChoose(v.id)}
                                    className="accent-[#4e7e8c] w-4 h-4 shrink-0"
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
