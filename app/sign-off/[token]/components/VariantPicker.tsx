'use client';

import { ResilientImage } from './ResilientImage';

/** Sentinel stored in `selections[componentId]` when the client picks
 *  "none of these" for a component (i.e. wants changes, not an approval). */
export const NONE_VARIANT = '__none__';

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
    /** Feedback text for the "none of these" choice. */
    noneComment: string;
    onNoneComment: (v: string) => void;
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
 * - A "none of these" option lets the client reject every design for this
 *   component and leave feedback instead of approving one.
 */
export function VariantPicker({ componentName, variants, chosenVariantId, onChoose, onZoom, noneComment, onNoneComment }: Props) {
    if (variants.length === 0) {
        return (
            <p className="text-sm italic" style={{ color: 'var(--muted)' }}>
                No variants provided for {componentName}.
            </p>
        );
    }

    const noneChosen = chosenVariantId === NONE_VARIANT;

    return (
        <div>
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

            {/* None of these — reject every option for this component and ask for changes */}
            <label
                className="mt-4 flex items-center gap-2 cursor-pointer rounded-xl border px-3 py-2.5 transition-colors"
                style={{
                    borderColor: noneChosen ? 'var(--warnBorder)' : 'var(--inputBorder)',
                    background: noneChosen ? 'var(--warnBg)' : 'transparent',
                    color: noneChosen ? 'var(--warnText)' : 'var(--muted)',
                }}
            >
                <input
                    type="radio"
                    name={`variant-${componentName}`}
                    checked={noneChosen}
                    onChange={() => onChoose(NONE_VARIANT)}
                    className="w-4 h-4 shrink-0"
                    style={{ accentColor: 'var(--warnSolid)' }}
                />
                <span className="text-xs font-semibold">
                    {noneChosen ? '✓ None of these — I’d like changes' : 'None of these — request changes'}
                </span>
            </label>

            {noneChosen && (
                <textarea
                    value={noneComment}
                    onChange={(e) => onNoneComment(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder="What would you like us to change or try for this one?"
                    className="mt-2 w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                    style={{
                        border: '1px solid var(--warnBorder)',
                        background: 'var(--warnBg)',
                        color: 'var(--text)',
                        fontFamily: 'inherit',
                        resize: 'vertical',
                        minHeight: '64px',
                    }}
                />
            )}
        </div>
    );
}
