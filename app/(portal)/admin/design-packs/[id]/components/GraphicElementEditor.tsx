'use client';

import { useState } from 'react';
import { GraphicElement } from '@/lib/design-packs/types';
import { getIconById } from '@/lib/design-packs/graphic-library';
import { Trash2, Move, RotateCw, Maximize2, Palette } from 'lucide-react';

interface GraphicElementEditorProps {
    elements: GraphicElement[];
    signWidth: number;
    signHeight: number;
    availableColors: string[];
    onUpdate: (elements: GraphicElement[]) => void;
}

export function GraphicElementEditor({
    elements,
    signWidth,
    signHeight,
    availableColors,
    onUpdate
}: GraphicElementEditorProps) {
    const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
    const [expandedElement, setExpandedElement] = useState<string | null>(null);

    const selectedElement = elements.find(el => el.id === selectedElementId);

    const handleUpdateElement = (id: string, updates: Partial<GraphicElement>) => {
        const updated = elements.map(el =>
            el.id === id ? { ...el, ...updates } : el
        );
        onUpdate(updated);
    };

    const handleDeleteElement = (id: string) => {
        const updated = elements.filter(el => el.id !== id);
        onUpdate(updated);
        if (selectedElementId === id) {
            setSelectedElementId(null);
        }
    };

    const toggleExpand = (id: string) => {
        setExpandedElement(expandedElement === id ? null : id);
    };

    if (elements.length === 0) {
        return (
            <div className="text-center py-8 bg-neutral-50 rounded-[var(--radius-sm)] border-2 border-dashed border-neutral-300">
                <p className="text-sm text-neutral-600">no graphic elements added yet</p>
                <p className="text-xs text-neutral-500 mt-1">
                    use the "add graphic" button to place icons on your sign
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-neutral-700">
                    graphic elements ({elements.length})
                </p>
            </div>

            <div className="space-y-2">
                {elements.map((element) => {
                    const icon = getIconById(element.icon_id);
                    const isExpanded = expandedElement === element.id;
                    const isSelected = selectedElementId === element.id;
                    const IconComponent = icon?.component;

                    return (
                        <div
                            key={element.id}
                            className={`
                                border-2 rounded-[var(--radius-sm)] transition-all
                                ${isSelected ? 'border-black bg-neutral-50' : 'border-neutral-200 bg-white'}
                            `}
                        >
                            {/* Header */}
                            <div
                                className="flex items-center justify-between p-3 cursor-pointer"
                                onClick={() => {
                                    setSelectedElementId(element.id);
                                    toggleExpand(element.id);
                                }}
                            >
                                <div className="flex items-center gap-3">
                                    {IconComponent && (
                                        <div className="p-2 bg-neutral-100 rounded-[var(--radius-sm)]">
                                            <IconComponent
                                                size={20}
                                                strokeWidth={1.5}
                                                style={{ color: element.color }}
                                            />
                                        </div>
                                    )}
                                    <div>
                                        <p className="text-sm font-medium text-neutral-900">
                                            {icon?.name || 'Unknown Icon'}
                                        </p>
                                        <p className="text-xs text-neutral-500">
                                            {Math.round(element.x)}px, {Math.round(element.y)}px · {element.size}px · {element.rotation}°
                                        </p>
                                    </div>
                                </div>

                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteElement(element.id);
                                    }}
                                    className="p-1.5 text-neutral-500 hover:text-red-600 hover:bg-red-50 rounded-[var(--radius-sm)] transition-colors"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>

                            {/* Controls (Expanded) */}
                            {isExpanded && (
                                <div className="px-3 pb-3 space-y-3 border-t border-neutral-200 pt-3">
                                    {/* Position */}
                                    <div>
                                        <label className="flex items-center gap-2 text-xs font-medium text-neutral-700 mb-2">
                                            <Move size={14} />
                                            position
                                        </label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="text-xs text-neutral-600 block mb-1">x (horizontal)</label>
                                                <input
                                                    type="number"
                                                    value={Math.round(element.x)}
                                                    onChange={(e) => handleUpdateElement(element.id, { x: Number(e.target.value) })}
                                                    className="w-full px-2 py-1.5 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                                                    min="0"
                                                    max={signWidth}
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs text-neutral-600 block mb-1">y (vertical)</label>
                                                <input
                                                    type="number"
                                                    value={Math.round(element.y)}
                                                    onChange={(e) => handleUpdateElement(element.id, { y: Number(e.target.value) })}
                                                    className="w-full px-2 py-1.5 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                                                    min="0"
                                                    max={signHeight}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Size */}
                                    <div>
                                        <label className="flex items-center gap-2 text-xs font-medium text-neutral-700 mb-2">
                                            <Maximize2 size={14} />
                                            size: {element.size}px
                                        </label>
                                        <input
                                            type="range"
                                            value={element.size}
                                            onChange={(e) => handleUpdateElement(element.id, { size: Number(e.target.value) })}
                                            className="w-full"
                                            min="20"
                                            max="200"
                                            step="5"
                                        />
                                    </div>

                                    {/* Rotation */}
                                    <div>
                                        <label className="flex items-center gap-2 text-xs font-medium text-neutral-700 mb-2">
                                            <RotateCw size={14} />
                                            rotation: {element.rotation}°
                                        </label>
                                        <input
                                            type="range"
                                            value={element.rotation}
                                            onChange={(e) => handleUpdateElement(element.id, { rotation: Number(e.target.value) })}
                                            className="w-full"
                                            min="0"
                                            max="360"
                                            step="15"
                                        />
                                    </div>

                                    {/* Color */}
                                    <div>
                                        <label className="flex items-center gap-2 text-xs font-medium text-neutral-700 mb-2">
                                            <Palette size={14} />
                                            color
                                        </label>
                                        <div className="flex flex-wrap gap-2">
                                            {availableColors.map((color) => (
                                                <button
                                                    key={color}
                                                    onClick={() => handleUpdateElement(element.id, { color })}
                                                    className={`
                                                        w-8 h-8 rounded-[var(--radius-sm)] border-2 transition-all
                                                        ${element.color === color ? 'border-black scale-110' : 'border-neutral-300 hover:border-neutral-400'}
                                                    `}
                                                    style={{ backgroundColor: color }}
                                                    title={color}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    {/* Opacity */}
                                    <div>
                                        <label className="text-xs font-medium text-neutral-700 block mb-2">
                                            opacity: {Math.round(element.opacity * 100)}%
                                        </label>
                                        <input
                                            type="range"
                                            value={element.opacity}
                                            onChange={(e) => handleUpdateElement(element.id, { opacity: Number(e.target.value) })}
                                            className="w-full"
                                            min="0"
                                            max="1"
                                            step="0.1"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
