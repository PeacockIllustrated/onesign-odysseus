'use client';

import { useState, useEffect } from 'react';
import { DesignPackData, IconFamily } from '@/lib/design-packs/types';
import { updateDesignPackData, lockSection, unlockSection } from '@/lib/design-packs/actions';
import { Lock, Unlock, Loader2, Circle, Disc, Target, Palette } from 'lucide-react';

interface GraphicStylePickerProps {
    packId: string;
    data: DesignPackData;
}

const ICON_FAMILIES: Array<{
    id: IconFamily;
    label: string;
    description: string;
    example: React.ReactNode;
}> = [
    {
        id: 'line',
        label: 'line',
        description: 'minimal outline icons, clean and modern',
        example: (
            <div className="flex gap-3">
                <Circle size={32} strokeWidth={1.5} />
                <Target size={32} strokeWidth={1.5} />
                <Palette size={32} strokeWidth={1.5} />
            </div>
        ),
    },
    {
        id: 'filled',
        label: 'filled',
        description: 'solid icons, strong visual presence',
        example: (
            <div className="flex gap-3">
                <Circle size={32} fill="currentColor" />
                <Disc size={32} fill="currentColor" />
                <Target size={32} fill="currentColor" />
            </div>
        ),
    },
    {
        id: 'duotone',
        label: 'duotone',
        description: 'two-tone icons with depth',
        example: (
            <div className="flex gap-3">
                <Circle size={32} strokeWidth={2} fill="currentColor" opacity={0.3} />
                <Disc size={32} strokeWidth={2} fill="currentColor" opacity={0.3} />
                <Target size={32} strokeWidth={2} fill="currentColor" opacity={0.3} />
            </div>
        ),
    },
    {
        id: 'illustrative',
        label: 'illustrative',
        description: 'detailed icons with character',
        example: (
            <div className="flex gap-3">
                <Circle size={32} strokeWidth={2.5} />
                <Target size={32} strokeWidth={2.5} />
                <Palette size={32} strokeWidth={2.5} />
            </div>
        ),
    },
];

const PATTERN_STYLES = [
    { id: 'none', label: 'none', description: 'clean, no pattern' },
    { id: 'subtle-grid', label: 'subtle grid', description: 'minimal grid overlay' },
    { id: 'diagonal-lines', label: 'diagonal lines', description: 'dynamic striped background' },
    { id: 'organic', label: 'organic', description: 'natural texture pattern' },
];

export function GraphicStylePicker({ packId, data }: GraphicStylePickerProps) {
    const [iconFamily, setIconFamily] = useState<IconFamily>(data.graphic_style?.icon_family || 'line');
    const [patternStyle, setPatternStyle] = useState<string>(data.graphic_style?.pattern_style || 'none');
    const [saving, setSaving] = useState(false);
    const [locking, setLocking] = useState(false);

    const isLocked = data.graphic_style?.locked || false;

    // Sync with server data
    useEffect(() => {
        if (data.graphic_style) {
            setIconFamily(data.graphic_style.icon_family);
            setPatternStyle(data.graphic_style.pattern_style || 'none');
        }
    }, [data.graphic_style]);

    const handleSave = async (newIconFamily: IconFamily, newPattern: string) => {
        setSaving(true);
        const result = await updateDesignPackData(packId, {
            graphic_style: {
                icon_family: newIconFamily,
                pattern_style: newPattern,
                locked: false,
            },
        });
        setSaving(false);

        if ('error' in result) {
            console.error('failed to save:', result.error);
        }
    };

    const handleSelectIconFamily = (family: IconFamily) => {
        if (isLocked) return;
        setIconFamily(family);
        handleSave(family, patternStyle);
    };

    const handleSelectPattern = (pattern: string) => {
        if (isLocked) return;
        setPatternStyle(pattern);
        handleSave(iconFamily, pattern);
    };

    const handleToggleLock = async () => {
        setLocking(true);
        const result = isLocked
            ? await unlockSection(packId, 'graphic_style')
            : await lockSection(packId, 'graphic_style');

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
                        select icon style and optional background patterns
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {saving && (
                        <span className="text-xs text-neutral-500 flex items-center gap-1">
                            <Loader2 size={12} className="animate-spin" />
                            saving...
                        </span>
                    )}
                    {data.graphic_style && (
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

            {/* Icon Family Selection */}
            <div>
                <h4 className="text-xs font-medium text-neutral-500 uppercase mb-3">icon family</h4>
                <div className="grid grid-cols-2 gap-3">
                    {ICON_FAMILIES.map((family) => {
                        const isSelected = iconFamily === family.id;

                        return (
                            <button
                                key={family.id}
                                onClick={() => handleSelectIconFamily(family.id)}
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
                                        <h5 className="font-medium text-neutral-900">{family.label}</h5>
                                        <p className="text-xs text-neutral-500 mt-0.5">
                                            {family.description}
                                        </p>
                                    </div>
                                    {isSelected && (
                                        <div className="w-4 h-4 rounded-full bg-black flex items-center justify-center">
                                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                                        </div>
                                    )}
                                </div>
                                <div className="text-neutral-700">{family.example}</div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Pattern Style Selection */}
            <div>
                <h4 className="text-xs font-medium text-neutral-500 uppercase mb-3">
                    background pattern (optional)
                </h4>
                <div className="grid grid-cols-2 gap-3">
                    {PATTERN_STYLES.map((pattern) => {
                        const isSelected = patternStyle === pattern.id;

                        return (
                            <button
                                key={pattern.id}
                                onClick={() => handleSelectPattern(pattern.id)}
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
                                <div className="flex items-start justify-between">
                                    <div>
                                        <h5 className="font-medium text-neutral-900">{pattern.label}</h5>
                                        <p className="text-xs text-neutral-500 mt-0.5">
                                            {pattern.description}
                                        </p>
                                    </div>
                                    {isSelected && (
                                        <div className="w-4 h-4 rounded-full bg-black flex items-center justify-center">
                                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                                        </div>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Usage Guidelines */}
            <div className="text-xs text-neutral-500 p-3 bg-neutral-50 rounded-[var(--radius-sm)]">
                <p className="font-medium text-neutral-700 mb-1">usage guidelines:</p>
                <ul className="space-y-1">
                    <li>• line icons: best for wayfinding and directional signage</li>
                    <li>• filled icons: ideal for information boards and regulatory signs</li>
                    <li>• duotone: works well for interpretive/educational signage</li>
                    <li>• illustrative: suited for visitor centres and themed environments</li>
                </ul>
            </div>
        </div>
    );
}
