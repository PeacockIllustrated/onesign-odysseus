'use client';

import { useState } from 'react';
import { ICON_LIBRARY, getAllCategories, searchIcons, type GraphicIcon, type IconCategory } from '@/lib/design-packs/graphic-library';
import { Search, X } from 'lucide-react';

interface GraphicLibraryProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectIcon: (iconId: string) => void;
    currentColor: string;
}

export function GraphicLibrary({ isOpen, onClose, onSelectIcon, currentColor }: GraphicLibraryProps) {
    const [selectedCategory, setSelectedCategory] = useState<IconCategory | 'all'>('all');
    const [searchQuery, setSearchQuery] = useState('');

    if (!isOpen) return null;

    const categories = getAllCategories();

    // Filter icons based on category and search
    let filteredIcons: GraphicIcon[] = [];
    if (searchQuery.trim()) {
        filteredIcons = searchIcons(searchQuery);
    } else if (selectedCategory === 'all') {
        filteredIcons = ICON_LIBRARY;
    } else {
        filteredIcons = ICON_LIBRARY.filter(icon => icon.category === selectedCategory);
    }

    const handleSelectIcon = (iconId: string) => {
        onSelectIcon(iconId);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white rounded-[var(--radius-md)] w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-neutral-200">
                    <div>
                        <h2 className="text-lg font-medium text-neutral-900">graphic library</h2>
                        <p className="text-sm text-neutral-600 mt-0.5">
                            choose from {ICON_LIBRARY.length} professional icons
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-[var(--radius-sm)] transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Search */}
                <div className="p-6 border-b border-neutral-200">
                    <div className="relative">
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="search icons (e.g., parking, arrow, coffee)..."
                            className="w-full pl-10 pr-4 py-2.5 text-sm border border-neutral-300 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                        />
                    </div>
                </div>

                {/* Category Filters */}
                {!searchQuery && (
                    <div className="px-6 py-4 border-b border-neutral-200">
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => setSelectedCategory('all')}
                                className={`
                                    px-3 py-1.5 text-xs font-medium rounded-full border-2 transition-all
                                    ${selectedCategory === 'all'
                                        ? 'border-black bg-black text-white'
                                        : 'border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400'}
                                `}
                            >
                                all ({ICON_LIBRARY.length})
                            </button>
                            {categories.map((category) => (
                                <button
                                    key={category.id}
                                    onClick={() => setSelectedCategory(category.id)}
                                    className={`
                                        px-3 py-1.5 text-xs font-medium rounded-full border-2 transition-all
                                        ${selectedCategory === category.id
                                            ? 'border-black bg-black text-white'
                                            : 'border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400'}
                                    `}
                                >
                                    {category.label} ({category.count})
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Icon Grid */}
                <div className="flex-1 overflow-y-auto p-6">
                    {filteredIcons.length === 0 ? (
                        <div className="text-center py-12">
                            <p className="text-neutral-500 text-sm">no icons found matching "{searchQuery}"</p>
                            <p className="text-neutral-400 text-xs mt-1">try a different search term</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                            {filteredIcons.map((icon) => {
                                const IconComponent = icon.component;
                                return (
                                    <button
                                        key={icon.id}
                                        onClick={() => handleSelectIcon(icon.id)}
                                        className="group flex flex-col items-center gap-2 p-4 border-2 border-neutral-200 rounded-[var(--radius-sm)] hover:border-black hover:bg-neutral-50 transition-all"
                                        title={icon.name}
                                    >
                                        <div className="p-3 rounded-[var(--radius-sm)] bg-neutral-100 group-hover:bg-white transition-colors">
                                            <IconComponent
                                                size={32}
                                                strokeWidth={1.5}
                                                style={{ color: currentColor }}
                                            />
                                        </div>
                                        <span className="text-xs text-neutral-600 group-hover:text-black text-center line-clamp-2 transition-colors">
                                            {icon.name}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-neutral-200 bg-neutral-50">
                    <div className="flex items-center justify-between">
                        <div className="text-xs text-neutral-600">
                            <p className="font-medium">tip: icons will use your selected brand colours</p>
                            <p className="text-neutral-500 mt-0.5">position, size, and rotation can be adjusted after placement</p>
                        </div>
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-neutral-700 hover:text-black transition-colors"
                        >
                            cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
