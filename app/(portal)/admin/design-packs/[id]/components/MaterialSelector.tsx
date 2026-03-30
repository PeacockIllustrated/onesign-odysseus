'use client';

import { useState, useEffect } from 'react';
import { DesignPackData, CostTier } from '@/lib/design-packs/types';
import { updateDesignPackData, lockSection, unlockSection } from '@/lib/design-packs/actions';
import { getCostTierSymbol, getCostTierLabel } from '@/lib/design-packs/utils';
import { Lock, Unlock, Loader2, Star } from 'lucide-react';

interface MaterialSelectorProps {
    packId: string;
    data: DesignPackData;
}

const SUBSTRATES: Array<{
    id: string;
    label: string;
    description: string;
    cost_tier: CostTier;
    durability: number;
}> = [
    {
        id: 'aluminium-composite',
        label: 'aluminium composite',
        description: 'lightweight, weather-resistant, ideal for large format',
        cost_tier: 2,
        durability: 5,
    },
    {
        id: 'dibond',
        label: 'dibond',
        description: 'rigid aluminium composite, premium finish',
        cost_tier: 3,
        durability: 5,
    },
    {
        id: 'acrylic',
        label: 'acrylic',
        description: 'lightweight, transparent or opaque, modern aesthetic',
        cost_tier: 2,
        durability: 4,
    },
    {
        id: 'stainless-steel',
        label: 'stainless steel',
        description: 'premium metal finish, architectural grade',
        cost_tier: 3,
        durability: 5,
    },
    {
        id: 'aluminium-sheet',
        label: 'aluminium sheet',
        description: 'traditional metal signage, proven reliability',
        cost_tier: 2,
        durability: 5,
    },
    {
        id: 'hdu',
        label: 'hdu (high-density urethane)',
        description: 'precision carving, dimensional lettering',
        cost_tier: 3,
        durability: 5,
    },
    {
        id: 'timber',
        label: 'timber',
        description: 'natural aesthetic, suited for heritage sites',
        cost_tier: 2,
        durability: 3,
    },
    {
        id: 'oak',
        label: 'oak',
        description: 'premium hardwood, traditional craftsmanship',
        cost_tier: 3,
        durability: 4,
    },
    {
        id: 'recycled-plastic',
        label: 'recycled plastic',
        description: 'sustainable, low maintenance, good longevity',
        cost_tier: 2,
        durability: 4,
    },
    {
        id: 'hdpe',
        label: 'hdpe (high-density polyethylene)',
        description: 'recyclable plastic, excellent weather resistance',
        cost_tier: 2,
        durability: 5,
    },
    {
        id: 'stone',
        label: 'stone',
        description: 'permanent installation, natural integration',
        cost_tier: 3,
        durability: 5,
    },
    {
        id: 'yorkstone',
        label: 'yorkstone',
        description: 'traditional british stone, heritage aesthetic',
        cost_tier: 3,
        durability: 5,
    },
    {
        id: 'cor-ten-steel',
        label: 'cor-ten steel',
        description: 'weathering steel, rustic patina finish',
        cost_tier: 3,
        durability: 5,
    },
    {
        id: 'glass',
        label: 'glass',
        description: 'contemporary, etched or vinyl applied',
        cost_tier: 3,
        durability: 4,
    },
    {
        id: 'foamex',
        label: 'foamex / pvc',
        description: 'budget-friendly, short to medium term',
        cost_tier: 1,
        durability: 2,
    },
];

const FINISHES: Record<string, Array<{ id: string; label: string; description: string }>> = {
    'aluminium-composite': [
        { id: 'powder-coat', label: 'powder coat', description: 'durable matte finish' },
        { id: 'vinyl-wrap', label: 'vinyl wrap', description: 'full colour flexibility' },
        { id: 'wet-spray', label: 'wet spray', description: 'smooth gloss finish' },
        { id: 'digital-print', label: 'digital print', description: 'high-resolution direct print' },
    ],
    dibond: [
        { id: 'powder-coat', label: 'powder coat', description: 'durable matte finish' },
        { id: 'vinyl-wrap', label: 'vinyl wrap', description: 'full colour flexibility' },
        { id: 'digital-print', label: 'digital print', description: 'high-resolution direct print' },
    ],
    acrylic: [
        { id: 'vinyl-applied', label: 'vinyl applied', description: 'surface or reverse applied' },
        { id: 'digital-print', label: 'digital print', description: 'direct UV print' },
        { id: 'laser-cut', label: 'laser cut', description: 'precision edge finishing' },
        { id: 'led-illuminated', label: 'led illuminated', description: 'backlit or edge-lit' },
    ],
    'stainless-steel': [
        { id: 'brushed', label: 'brushed', description: 'directional satin finish' },
        { id: 'polished', label: 'polished', description: 'mirror finish' },
        { id: 'etched', label: 'etched', description: 'chemically etched detail' },
        { id: 'painted', label: 'painted', description: 'powder coat or wet spray' },
    ],
    'aluminium-sheet': [
        { id: 'powder-coat', label: 'powder coat', description: 'durable factory finish' },
        { id: 'wet-spray', label: 'wet spray', description: 'custom colour match' },
        { id: 'vinyl-wrap', label: 'vinyl wrap', description: 'applied graphics' },
        { id: 'anodised', label: 'anodised', description: 'protective oxide layer' },
    ],
    hdu: [
        { id: 'carved', label: 'carved', description: '3d dimensional lettering' },
        { id: 'painted', label: 'painted', description: 'hand-painted details' },
        { id: 'gilded', label: 'gilded', description: 'gold or metal leaf' },
        { id: 'textured', label: 'textured', description: 'sandstone or woodgrain effect' },
    ],
    timber: [
        { id: 'engraved', label: 'engraved', description: 'routed lettering, natural look' },
        { id: 'routed', label: 'routed', description: 'carved depth, tactile finish' },
        { id: 'painted', label: 'painted', description: 'traditional hand-painted' },
        { id: 'stained', label: 'stained', description: 'wood stain with varnish' },
    ],
    oak: [
        { id: 'engraved', label: 'engraved', description: 'routed lettering' },
        { id: 'carved', label: 'carved', description: 'deep relief carving' },
        { id: 'oiled', label: 'oiled', description: 'natural oil finish' },
        { id: 'painted', label: 'painted', description: 'traditional signwriting' },
    ],
    'recycled-plastic': [
        { id: 'engraved', label: 'engraved', description: 'precision machined' },
        { id: 'vinyl-wrap', label: 'vinyl wrap', description: 'applied graphics' },
        { id: 'molded-color', label: 'molded color', description: 'through-colour material' },
    ],
    hdpe: [
        { id: 'engraved', label: 'engraved', description: 'cnc routed detail' },
        { id: 'vinyl-applied', label: 'vinyl applied', description: 'surface graphics' },
        { id: 'molded-color', label: 'molded color', description: 'integral colour' },
    ],
    stone: [
        { id: 'engraved', label: 'engraved', description: 'sandblasted or carved' },
        { id: 'incised', label: 'incised', description: 'v-cut carved lettering' },
        { id: 'relief', label: 'relief', description: 'raised lettering' },
    ],
    yorkstone: [
        { id: 'engraved', label: 'engraved', description: 'sandblasted detail' },
        { id: 'incised', label: 'incised', description: 'traditional carved letters' },
    ],
    'cor-ten-steel': [
        { id: 'natural-patina', label: 'natural patina', description: 'weathered rust finish' },
        { id: 'laser-cut', label: 'laser cut', description: 'precision cut detail' },
        { id: 'plasma-cut', label: 'plasma cut', description: 'industrial cut edges' },
    ],
    glass: [
        { id: 'etched', label: 'etched', description: 'sandblasted frosted detail' },
        { id: 'vinyl-applied', label: 'vinyl applied', description: 'surface or reverse' },
        { id: 'digital-print', label: 'digital print', description: 'ceramic print fired' },
    ],
    foamex: [
        { id: 'vinyl-wrap', label: 'vinyl wrap', description: 'full coverage graphics' },
        { id: 'digital-print', label: 'digital print', description: 'direct print' },
    ],
};

const MAINTENANCE_NOTES: Record<string, string> = {
    'aluminium-composite': 'minimal maintenance, occasional cleaning',
    dibond: 'minimal maintenance, occasional cleaning',
    timber: 'annual re-oiling or sealing required',
    'recycled-plastic': 'low maintenance, pressure wash annually',
    stone: 'no maintenance, occasional brushing',
};

export function MaterialSelector({ packId, data }: MaterialSelectorProps) {
    const [substrate, setSubstrate] = useState<string>(data.materials?.substrate || '');
    const [finish, setFinish] = useState<string>(data.materials?.finish || '');
    const [saving, setSaving] = useState(false);
    const [locking, setLocking] = useState(false);

    const isLocked = data.materials?.locked || false;

    // Sync with server data
    useEffect(() => {
        if (data.materials) {
            setSubstrate(data.materials.substrate);
            setFinish(data.materials.finish);
        }
    }, [data.materials]);

    const selectedSubstrate = SUBSTRATES.find((s) => s.id === substrate);
    const availableFinishes = substrate ? FINISHES[substrate] || [] : [];

    const handleSelectSubstrate = async (substrateId: string) => {
        if (isLocked) return;

        const newSubstrate = SUBSTRATES.find((s) => s.id === substrateId);
        if (!newSubstrate) return;

        setSubstrate(substrateId);
        // Reset finish when substrate changes
        const defaultFinish = FINISHES[substrateId]?.[0]?.id || '';
        setFinish(defaultFinish);

        setSaving(true);
        const result = await updateDesignPackData(packId, {
            materials: {
                substrate: substrateId,
                finish: defaultFinish,
                cost_tier: newSubstrate.cost_tier,
                locked: false,
            },
        });
        setSaving(false);

        if ('error' in result) {
            console.error('failed to save:', result.error);
        }
    };

    const handleSelectFinish = async (finishId: string) => {
        if (isLocked || !selectedSubstrate) return;

        setFinish(finishId);

        setSaving(true);
        const result = await updateDesignPackData(packId, {
            materials: {
                substrate,
                finish: finishId,
                cost_tier: selectedSubstrate.cost_tier,
                locked: false,
            },
        });
        setSaving(false);

        if ('error' in result) {
            console.error('failed to save:', result.error);
        }
    };

    const handleToggleLock = async () => {
        setLocking(true);
        const result = isLocked
            ? await unlockSection(packId, 'materials')
            : await lockSection(packId, 'materials');

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
                        select substrate material and finishing process
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {saving && (
                        <span className="text-xs text-neutral-500 flex items-center gap-1">
                            <Loader2 size={12} className="animate-spin" />
                            saving...
                        </span>
                    )}
                    {data.materials && (
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

            {/* Substrate Selection */}
            <div>
                <h4 className="text-xs font-medium text-neutral-500 uppercase mb-3">substrate</h4>
                <div className="grid grid-cols-1 gap-3">
                    {SUBSTRATES.map((sub) => {
                        const isSelected = substrate === sub.id;

                        return (
                            <button
                                key={sub.id}
                                onClick={() => handleSelectSubstrate(sub.id)}
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
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h5 className="font-medium text-neutral-900">{sub.label}</h5>
                                            <span className="text-xs text-neutral-500">
                                                {getCostTierSymbol(sub.cost_tier)}
                                            </span>
                                        </div>
                                        <p className="text-xs text-neutral-500 mb-2">{sub.description}</p>
                                        <div className="flex items-center gap-3 text-xs">
                                            <div className="flex items-center gap-1">
                                                <span className="text-neutral-500">durability:</span>
                                                <div className="flex gap-0.5">
                                                    {Array.from({ length: 5 }).map((_, i) => (
                                                        <Star
                                                            key={i}
                                                            size={12}
                                                            className={
                                                                i < sub.durability
                                                                    ? 'fill-neutral-900 text-neutral-900'
                                                                    : 'text-neutral-300'
                                                            }
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                            <div>
                                                <span className="text-neutral-500">cost tier:</span>{' '}
                                                <span className="font-medium">
                                                    {getCostTierLabel(sub.cost_tier)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    {isSelected && (
                                        <div className="w-5 h-5 rounded-full bg-black flex items-center justify-center ml-3">
                                            <div className="w-2 h-2 rounded-full bg-white" />
                                        </div>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Finish Selection */}
            {substrate && availableFinishes.length > 0 && (
                <div>
                    <h4 className="text-xs font-medium text-neutral-500 uppercase mb-3">finish</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {availableFinishes.map((fin) => {
                            const isSelected = finish === fin.id;

                            return (
                                <button
                                    key={fin.id}
                                    onClick={() => handleSelectFinish(fin.id)}
                                    disabled={isLocked}
                                    className={`
                                        text-left p-3 rounded-[var(--radius-md)] border-2 transition-all
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
                                            <h5 className="font-medium text-neutral-900">{fin.label}</h5>
                                            <p className="text-xs text-neutral-500 mt-0.5">
                                                {fin.description}
                                            </p>
                                        </div>
                                        {isSelected && (
                                            <div className="w-4 h-4 rounded-full bg-black flex items-center justify-center ml-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-white" />
                                            </div>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Maintenance Info */}
            {substrate && MAINTENANCE_NOTES[substrate] && (
                <div className="text-xs text-neutral-500 p-3 bg-neutral-50 rounded-[var(--radius-sm)]">
                    <p className="font-medium text-neutral-700 mb-1">maintenance requirements:</p>
                    <p>{MAINTENANCE_NOTES[substrate]}</p>
                </div>
            )}
        </div>
    );
}
