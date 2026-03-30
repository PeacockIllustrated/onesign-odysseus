'use client';

import { useState, useEffect } from 'react';
import { DesignPackData, ColourSpec } from '@/lib/design-packs/types';
import { DEFAULT_BRAND_COLOURS } from '@/lib/design-packs/types';
import { updateDesignPackData, lockSection, unlockSection } from '@/lib/design-packs/actions';
import {
    enrichColourWithContrast,
    getContrastRating,
    calculateContrastRatio,
} from '@/lib/design-packs/utils';
import { Lock, Unlock, Loader2, Plus, X } from 'lucide-react';

interface ColourPaletteBuilderProps {
    packId: string;
    data: DesignPackData;
}

export function ColourPaletteBuilder({ packId, data }: ColourPaletteBuilderProps) {
    const [palette, setPalette] = useState(data.colours || DEFAULT_BRAND_COLOURS);
    const [saving, setSaving] = useState(false);
    const [locking, setLocking] = useState(false);

    const isLocked = data.colours?.locked || false;

    // Sync with server data
    useEffect(() => {
        if (data.colours) {
            setPalette(data.colours);
        }
    }, [data.colours]);

    const handleSave = async (newPalette: typeof palette) => {
        setSaving(true);
        const result = await updateDesignPackData(packId, {
            colours: newPalette,
        });
        setSaving(false);

        if ('error' in result) {
            console.error('failed to save:', result.error);
        }
    };

    const handleAddAccent = () => {
        if (isLocked || palette.accents.length >= 4) return;

        const newPalette = {
            ...palette,
            accents: [
                ...palette.accents,
                enrichColourWithContrast('#0066CC', `accent ${palette.accents.length + 1}`),
            ],
        };
        setPalette(newPalette);
        handleSave(newPalette);
    };

    const handleRemoveAccent = (index: number) => {
        if (isLocked) return;

        const newPalette = {
            ...palette,
            accents: palette.accents.filter((_, i) => i !== index),
        };
        setPalette(newPalette);
        handleSave(newPalette);
    };

    const handleUpdateAccent = (index: number, field: 'hex' | 'name', value: string) => {
        if (isLocked) return;

        const newAccents = [...palette.accents];
        if (field === 'hex') {
            newAccents[index] = enrichColourWithContrast(value, newAccents[index].name);
        } else {
            newAccents[index] = { ...newAccents[index], name: value };
        }

        const newPalette = { ...palette, accents: newAccents };
        setPalette(newPalette);
        handleSave(newPalette);
    };

    const handleUpdatePrimary = (field: 'hex' | 'name', value: string) => {
        if (isLocked) return;

        let updatedPrimary = palette.primary;
        if (field === 'hex') {
            updatedPrimary = enrichColourWithContrast(value, palette.primary.name);
        } else {
            updatedPrimary = { ...palette.primary, name: value };
        }

        const newPalette = { ...palette, primary: updatedPrimary };
        setPalette(newPalette);
        handleSave(newPalette);
    };

    const handleUpdateSecondary = (field: 'hex' | 'name', value: string) => {
        if (isLocked) return;

        let updatedSecondary = palette.secondary;
        if (field === 'hex') {
            updatedSecondary = enrichColourWithContrast(value, palette.secondary.name);
        } else {
            updatedSecondary = { ...palette.secondary, name: value };
        }

        const newPalette = { ...palette, secondary: updatedSecondary };
        setPalette(newPalette);
        handleSave(newPalette);
    };

    const handleToggleLock = async () => {
        setLocking(true);
        const result = isLocked
            ? await unlockSection(packId, 'colours')
            : await lockSection(packId, 'colours');

        setLocking(false);

        if ('error' in result) {
            console.error('failed to toggle lock:', result.error);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm text-neutral-600">
                        select primary and secondary brand colours, plus up to 4 accent colours for highlights and details
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {saving && (
                        <span className="text-xs text-neutral-500 flex items-center gap-1">
                            <Loader2 size={12} className="animate-spin" />
                            saving...
                        </span>
                    )}
                    {palette && (
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

            {/* Brand Colours (Editable) */}
            <div>
                <h4 className="text-xs font-medium text-neutral-500 uppercase mb-3">primary brand colours</h4>
                <div className="grid grid-cols-2 gap-4">
                    <ColourSwatch
                        colour={palette.primary}
                        locked={isLocked}
                        onUpdate={handleUpdatePrimary}
                    />
                    <ColourSwatch
                        colour={palette.secondary}
                        locked={isLocked}
                        onUpdate={handleUpdateSecondary}
                    />
                </div>
                <p className="text-xs text-neutral-500 mt-2">
                    primary colour is typically used for backgrounds, secondary for text and foreground elements
                </p>
            </div>

            {/* Accent Colours */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-medium text-neutral-500 uppercase">
                        accent colours (optional)
                    </h4>
                    {!isLocked && palette.accents.length < 4 && (
                        <button
                            onClick={handleAddAccent}
                            className="btn-secondary text-xs inline-flex items-center gap-1"
                        >
                            <Plus size={14} />
                            add accent
                        </button>
                    )}
                </div>

                {palette.accents.length === 0 ? (
                    <div className="text-center py-8 border-2 border-dashed border-neutral-200 rounded-[var(--radius-md)]">
                        <p className="text-sm text-neutral-500 mb-2">no accent colours yet</p>
                        {!isLocked && (
                            <button onClick={handleAddAccent} className="btn-secondary text-xs">
                                add your first accent colour
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-4">
                        {palette.accents.map((colour, index) => (
                            <div key={index} className="relative">
                                <ColourSwatch
                                    colour={colour}
                                    locked={isLocked}
                                    onUpdate={(field, value) =>
                                        handleUpdateAccent(index, field, value)
                                    }
                                />
                                {!isLocked && (
                                    <button
                                        onClick={() => handleRemoveAccent(index)}
                                        className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Material Preview Info */}
            <div className="text-xs text-neutral-500 p-3 bg-neutral-50 rounded-[var(--radius-sm)]">
                <p className="font-medium text-neutral-700 mb-1">colour & finish considerations:</p>
                <ul className="space-y-1">
                    <li>• vinyl: glossy finish, colours appear vibrant</li>
                    <li>• powder coat: matte finish, colours appear slightly muted</li>
                    <li>• paint: semi-gloss, true colour representation</li>
                    <li>• outdoor signage: colours appear 10-15% less saturated in overcast/shaded conditions</li>
                    <li>• wcag contrast ratio: aim for 4.5:1 minimum for outdoor readability</li>
                </ul>
            </div>
        </div>
    );
}

interface ColourSwatchProps {
    colour: ColourSpec;
    locked: boolean;
    readOnly?: boolean;
    onUpdate?: (field: 'hex' | 'name', value: string) => void;
}

function ColourSwatch({ colour, locked, readOnly, onUpdate }: ColourSwatchProps) {
    const contrastRatio = calculateContrastRatio(colour.hex, '#FFFFFF');
    const rating = contrastRatio ? getContrastRating(contrastRatio) : 'unknown';

    return (
        <div className="border border-neutral-200 rounded-[var(--radius-md)] overflow-hidden">
            {/* Colour Preview */}
            <div className="h-24 relative" style={{ backgroundColor: colour.hex }}>
                {!readOnly && !locked && (
                    <input
                        type="color"
                        value={colour.hex}
                        onChange={(e) => onUpdate?.('hex', e.target.value)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                )}
                <div className="absolute bottom-2 right-2 bg-white/90 px-2 py-1 rounded text-xs font-mono">
                    {colour.hex}
                </div>
            </div>

            {/* Colour Info */}
            <div className="p-3 bg-white">
                {readOnly || locked ? (
                    <p className="font-medium text-neutral-900">{colour.name}</p>
                ) : (
                    <input
                        type="text"
                        value={colour.name}
                        onChange={(e) => onUpdate?.('name', e.target.value)}
                        className="w-full px-2 py-1 text-sm font-medium border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                    />
                )}

                {/* Contrast Info */}
                {contrastRatio && (
                    <div className="mt-2 text-xs">
                        <p className="text-neutral-500">
                            contrast vs white: {contrastRatio.toFixed(1)}:1
                        </p>
                        <p className={`font-medium ${
                            contrastRatio >= 4.5 ? 'text-green-600' : 'text-amber-600'
                        }`}>
                            {rating}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
