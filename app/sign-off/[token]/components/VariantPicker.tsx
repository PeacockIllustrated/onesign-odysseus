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
 * Per-component variant picker for the client approval page.
 *
 * Themed via the CSS custom properties set on the sign-off page wrapper
 * (`--accent`, `--panelBg`, `--text`, …), so it follows the page's light/dark
 * toggle without needing a prop.
 *
 * - Images are click-to-zoom (opens lightbox via onZoom).
 * - Selection is via a radio button beneath the description, so only
 *   one variant per component can be picked at a time.
 */
export function VariantPicker({ componentName, variants, chosenVariantId, onChoose, onZoom }: Props) {
    if (variants.length === 0) {
        return (
            <p className="text-sm italic" style={{ color: 'var(--muted)' }}>
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
                        className="rounded-2xl border overflow-hidden transition-all"
                        style={{
                            borderColor: chosen ? 'var(--accent)' : 'var(--panelBorder)',
                            background: chosen ? 'var(--bannerBg)' : 'var(--panelBg)',
                            boxShadow: chosen ? '0 0 30px -8px var(--accent)' : 'none',
                        }}
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
                            <div
                                className="w-full h-48 sm:h-56 flex items-center justify-center text-sm italic"
                                style={{ background: 'var(--imgBg)', color: 'var(--faint)' }}
                            >
                                no image
                            </div>
                        )}

                        {/* Info + radio selection */}
                        <div className="p-3.5">
                            <p className="text-sm font-bold" style={{ color: 'var(--heading)' }}>
                                {v.label}{v.name ? ` — ${v.name}` : ''}
                            </p>
                            {v.description && (
                                <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--muted)' }}>
                                    {v.description}
                                </p>
                            )}

                            {/* Radio button — the ONLY way to select */}
                            <label
                                className="mt-3 flex items-center gap-2 cursor-pointer rounded-xl border px-3 py-2.5 transition-colors"
                                style={{
                                    borderColor: chosen ? 'var(--accent)' : 'var(--inputBorder)',
                                    background: chosen ? 'var(--bannerBg)' : 'transparent',
                                    color: chosen ? 'var(--accent)' : 'var(--muted)',
                                }}
                            >
                                <input
                                    type="radio"
                                    name={`variant-${componentName}`}
                                    checked={chosen}
                                    onChange={() => onChoose(v.id)}
                                    className="w-4 h-4 shrink-0"
                                    style={{ accentColor: 'var(--accentSolid)' }}
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
