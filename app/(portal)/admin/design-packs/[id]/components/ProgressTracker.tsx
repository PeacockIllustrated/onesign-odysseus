'use client';

import { DesignPack } from '@/lib/design-packs/types';
import { Check } from 'lucide-react';

interface ProgressTrackerProps {
    pack: DesignPack;
}

export function ProgressTracker({ pack }: ProgressTrackerProps) {
    const sections = [
        {
            id: 'typography',
            label: 'typography',
            completed: pack.data_json.typography?.locked || false,
        },
        {
            id: 'colours',
            label: 'colours',
            completed: pack.data_json.colours?.locked || false,
        },
        {
            id: 'graphic-style',
            label: 'graphic style',
            completed: pack.data_json.graphic_style?.locked || false,
        },
        {
            id: 'materials',
            label: 'materials',
            completed: pack.data_json.materials?.locked || false,
        },
        {
            id: 'sign-types',
            label: 'sign types',
            completed: (pack.data_json.sign_types?.length || 0) > 0,
        },
        {
            id: 'environment',
            label: 'environment',
            completed: (pack.data_json.environment_previews?.length || 0) > 0,
        },
    ];

    const completedCount = sections.filter((s) => s.completed).length;
    const totalCount = sections.length;
    const percentage = Math.round((completedCount / totalCount) * 100);

    return (
        <div className="card-base">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h3 className="text-sm font-medium text-neutral-900">design pack progress</h3>
                    <p className="text-xs text-neutral-500 mt-0.5">
                        {completedCount} of {totalCount} sections complete
                    </p>
                </div>
                <div className="text-right">
                    <span className="text-2xl font-bold text-neutral-900 tabular-nums">
                        {percentage}%
                    </span>
                </div>
            </div>

            {/* Progress Bar */}
            <div className="h-2 bg-neutral-100 rounded-full overflow-hidden mb-4">
                <div
                    className="h-full bg-black transition-all duration-500 ease-out"
                    style={{ width: `${percentage}%` }}
                />
            </div>

            {/* Section Indicators */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {sections.map((section) => (
                    <a
                        key={section.id}
                        href={`#${section.id}`}
                        className={`
                            px-2 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium text-center
                            transition-all duration-200
                            ${
                                section.completed
                                    ? 'bg-black text-white'
                                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                            }
                        `}
                    >
                        <div className="flex items-center justify-center gap-1">
                            {section.completed && <Check size={12} />}
                            <span>{section.label}</span>
                        </div>
                    </a>
                ))}
            </div>
        </div>
    );
}
