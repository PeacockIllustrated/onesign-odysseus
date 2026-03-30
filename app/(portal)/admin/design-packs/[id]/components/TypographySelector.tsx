'use client';

import { useState, useEffect, useCallback } from 'react';
import { DesignPackData } from '@/lib/design-packs/types';
import { FONT_CATALOG, SIGNAGE_TYPOGRAPHY_LEVELS, FontCategory, getAllCategories, getCategoryLabel } from '@/lib/design-packs/font-catalog';
import { updateDesignPackData, lockSection, unlockSection } from '@/lib/design-packs/actions';
import { loadGoogleFont } from '@/lib/design-packs/font-loader';
import { Lock, Unlock, Loader2 } from 'lucide-react';

interface TypographySelectorProps {
    packId: string;
    data: DesignPackData;
}

export function TypographySelector({ packId, data }: TypographySelectorProps) {
    const [selectedPairId, setSelectedPairId] = useState<string | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<FontCategory | 'all'>('all');
    const [fontsLoaded, setFontsLoaded] = useState(false);
    const [saving, setSaving] = useState(false);
    const [locking, setLocking] = useState(false);

    const isLocked = data.typography?.locked || false;

    // Filter fonts by category
    const filteredFonts = selectedCategory === 'all'
        ? FONT_CATALOG
        : FONT_CATALOG.filter(pair => pair.category === selectedCategory);

    // Initialize selected pair from existing data
    useEffect(() => {
        if (data.typography) {
            const existingPair = FONT_CATALOG.find(
                (pair) => pair.primary_font.family === data.typography?.primary_font.family
            );
            if (existingPair) {
                setSelectedPairId(existingPair.id);
            }
        }
    }, [data.typography]);

    // Load fonts when pair is selected
    useEffect(() => {
        const selectedPair = FONT_CATALOG.find((pair) => pair.id === selectedPairId);
        if (!selectedPair) return;

        setFontsLoaded(false);

        Promise.all([
            loadGoogleFont(selectedPair.primary_font.google_font_url!),
            loadGoogleFont(selectedPair.secondary_font.google_font_url!),
        ])
            .then(() => setFontsLoaded(true))
            .catch((err) => {
                console.error('failed to load fonts:', err);
                setFontsLoaded(true); // Still show UI
            });
    }, [selectedPairId]);

    const handleSelectPair = useCallback(
        async (pairId: string) => {
            if (isLocked) return;

            const pair = FONT_CATALOG.find((p) => p.id === pairId);
            if (!pair) return;

            setSelectedPairId(pairId);
            setSaving(true);

            const result = await updateDesignPackData(packId, {
                typography: {
                    primary_font: pair.primary_font,
                    secondary_font: pair.secondary_font,
                    locked: false,
                },
            });

            setSaving(false);

            if ('error' in result) {
                console.error('failed to save:', result.error);
            }
        },
        [packId, isLocked]
    );

    const handleToggleLock = async () => {
        if (!data.typography) return;

        setLocking(true);
        const result = isLocked
            ? await unlockSection(packId, 'typography')
            : await lockSection(packId, 'typography');

        setLocking(false);

        if ('error' in result) {
            console.error('failed to toggle lock:', result.error);
        }
    };

    const selectedPair = FONT_CATALOG.find((pair) => pair.id === selectedPairId);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm text-neutral-600">
                        select a font pairing for signage. fonts shown at 1:10 scale.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {saving && (
                        <span className="text-xs text-neutral-500 flex items-center gap-1">
                            <Loader2 size={12} className="animate-spin" />
                            saving...
                        </span>
                    )}
                    {data.typography && (
                        <button
                            onClick={handleToggleLock}
                            disabled={locking}
                            className={`
                                btn-secondary inline-flex items-center gap-2 text-xs
                                ${isLocked ? 'bg-green-50 border-green-200 text-green-700' : ''}
                            `}
                        >
                            {locking ? (
                                <Loader2 size={14} className="animate-spin" />
                            ) : isLocked ? (
                                <Lock size={14} />
                            ) : (
                                <Unlock size={14} />
                            )}
                            {isLocked ? 'locked' : 'lock section'}
                        </button>
                    )}
                </div>
            </div>

            {/* Category Filters */}
            <div className="flex flex-wrap gap-2">
                <button
                    onClick={() => setSelectedCategory('all')}
                    disabled={isLocked}
                    className={`
                        px-3 py-1.5 text-xs font-medium rounded-full border-2 transition-all
                        ${selectedCategory === 'all'
                            ? 'border-black bg-black text-white'
                            : 'border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400'}
                        ${isLocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                    `}
                >
                    all ({FONT_CATALOG.length})
                </button>
                {getAllCategories().map((category) => {
                    const count = FONT_CATALOG.filter(p => p.category === category).length;
                    return (
                        <button
                            key={category}
                            onClick={() => setSelectedCategory(category)}
                            disabled={isLocked}
                            className={`
                                px-3 py-1.5 text-xs font-medium rounded-full border-2 transition-all
                                ${selectedCategory === category
                                    ? 'border-black bg-black text-white'
                                    : 'border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400'}
                                ${isLocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                            `}
                        >
                            {getCategoryLabel(category)} ({count})
                        </button>
                    );
                })}
            </div>

            {/* Font Pair Options */}
            <div className="grid grid-cols-1 gap-4">
                {filteredFonts.map((pair) => {
                    const isSelected = selectedPairId === pair.id;

                    return (
                        <button
                            key={pair.id}
                            onClick={() => handleSelectPair(pair.id)}
                            disabled={isLocked}
                            className={`
                                text-left p-4 rounded-[var(--radius-md)] border-2 transition-all
                                ${
                                    isSelected
                                        ? 'border-black bg-neutral-50'
                                        : 'border-neutral-200 hover:border-neutral-300'
                                }
                                ${isLocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                            `}
                        >
                            <div className="flex items-start justify-between mb-3">
                                <div>
                                    <h4 className="font-bold text-neutral-900">{pair.name}</h4>
                                    <p className="text-xs text-neutral-500 mt-0.5">
                                        {pair.description}
                                    </p>
                                </div>
                                {isSelected && (
                                    <div className="w-5 h-5 rounded-full bg-black flex items-center justify-center">
                                        <div className="w-2 h-2 rounded-full bg-white" />
                                    </div>
                                )}
                            </div>

                            {/* Font Preview */}
                            {isSelected && fontsLoaded && (
                                <div className="space-y-3 pt-3 border-t border-neutral-200">
                                    {SIGNAGE_TYPOGRAPHY_LEVELS.slice(0, 3).map((level) => (
                                        <div key={level.label}>
                                            <div
                                                style={{
                                                    fontFamily: `"${pair.primary_font.family}", sans-serif`,
                                                    fontWeight: pair.primary_font.weight,
                                                    fontSize: `${level.screen_px_1_10}px`,
                                                    lineHeight: 1.2,
                                                }}
                                            >
                                                {pair.preview_text.headline}
                                            </div>
                                            <p className="text-xs text-neutral-400 mt-1">
                                                {level.label} ({level.physical_mm}mm)
                                            </p>
                                        </div>
                                    ))}
                                    <div
                                        style={{
                                            fontFamily: `"${pair.secondary_font.family}", sans-serif`,
                                            fontWeight: pair.secondary_font.weight,
                                            fontSize: '16px',
                                            lineHeight: 1.5,
                                        }}
                                        className="text-neutral-700"
                                    >
                                        {pair.preview_text.body}
                                    </div>
                                    <p className="text-xs text-neutral-400">body text (secondary font)</p>
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Scale Reference */}
            {selectedPair && (
                <div className="text-xs text-neutral-500 p-3 bg-neutral-50 rounded-[var(--radius-sm)]">
                    <p>
                        <strong>primary font:</strong> {selectedPair.primary_font.family} (
                        {selectedPair.primary_font.weight})
                    </p>
                    <p>
                        <strong>secondary font:</strong> {selectedPair.secondary_font.family} (
                        {selectedPair.secondary_font.weight})
                    </p>
                    <p className="mt-2 text-neutral-400">
                        preview shown at 1:10 scale. actual signage will be 10× larger.
                    </p>
                </div>
            )}
        </div>
    );
}
