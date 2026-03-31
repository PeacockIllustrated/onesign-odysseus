'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader, Card } from '@/app/(portal)/components/ui';
import { getComponentTypeLabel } from '@/lib/artwork/utils';
import { updateComponentStageDefaults } from '@/lib/artwork/actions';
import type { ComponentStageDefault } from '@/lib/artwork/types';
import type { ProductionStage } from '@/lib/production/types';

const COMPONENT_TYPES = [
    'panel',
    'vinyl',
    'acrylic',
    'push_through',
    'dibond',
    'aperture_cut',
    'foamex',
    'other',
] as const;

const EXCLUDED_SLUGS = ['order-book', 'artwork-approval', 'goods-out'];

interface SettingsClientProps {
    defaults: ComponentStageDefault[];
    stages: ProductionStage[];
}

export function SettingsClient({ defaults, stages }: SettingsClientProps) {
    const departmentStages = stages.filter(
        (s) => !EXCLUDED_SLUGS.includes(s.slug)
    );

    // Build initial mapping from existing defaults
    const initialMappings: Record<string, string> = {};
    for (const d of defaults) {
        initialMappings[d.component_type] = d.stage_id;
    }

    const [mappings, setMappings] = useState<Record<string, string>>(initialMappings);
    const [isPending, startTransition] = useTransition();
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    function handleChange(componentType: string, stageId: string) {
        setMappings((prev) => {
            const next = { ...prev };
            if (stageId === '') {
                delete next[componentType];
            } else {
                next[componentType] = stageId;
            }
            return next;
        });
        setFeedback(null);
    }

    function handleSave() {
        startTransition(async () => {
            const payload = COMPONENT_TYPES.map((ct) => ({
                componentType: ct,
                stageId: mappings[ct] || null,
            }));

            const result = await updateComponentStageDefaults(payload);

            if ('error' in result) {
                setFeedback({ type: 'error', message: result.error });
            } else {
                setFeedback({ type: 'success', message: 'defaults saved successfully' });
            }
        });
    }

    return (
        <div className="p-6 max-w-3xl mx-auto">
            <Link
                href="/admin/artwork"
                className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 mb-4 transition-colors"
            >
                <ArrowLeft size={14} />
                back to artwork
            </Link>

            <PageHeader
                title="component type defaults"
                description="Configure which department each component type is automatically assigned to when added to an artwork pack."
            />

            <Card>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="border-b border-neutral-200 bg-neutral-50">
                            <tr>
                                <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                                    component type
                                </th>
                                <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                                    default department
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                            {COMPONENT_TYPES.map((ct) => {
                                const selectedStageId = mappings[ct] || '';
                                const selectedStage = departmentStages.find(
                                    (s) => s.id === selectedStageId
                                );

                                return (
                                    <tr key={ct}>
                                        <td className="px-4 py-3 text-sm font-medium text-neutral-900">
                                            {getComponentTypeLabel(ct)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                {selectedStage && (
                                                    <div
                                                        className="w-2.5 h-2.5 rounded-full shrink-0"
                                                        style={{ backgroundColor: selectedStage.color }}
                                                    />
                                                )}
                                                <select
                                                    value={selectedStageId}
                                                    onChange={(e) =>
                                                        handleChange(ct, e.target.value)
                                                    }
                                                    className="flex-1 min-w-0 px-3 py-1.5 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black bg-white"
                                                >
                                                    <option value="">
                                                        -- no default --
                                                    </option>
                                                    {departmentStages.map((stage) => (
                                                        <option
                                                            key={stage.id}
                                                            value={stage.id}
                                                        >
                                                            {stage.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="flex items-center justify-between gap-3 px-4 py-4 border-t border-neutral-200">
                    <div>
                        {feedback && (
                            <p
                                className={`text-sm ${
                                    feedback.type === 'success'
                                        ? 'text-green-700'
                                        : 'text-red-700'
                                }`}
                            >
                                {feedback.message}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={isPending}
                        className="btn-primary"
                    >
                        {isPending ? 'saving...' : 'save defaults'}
                    </button>
                </div>
            </Card>
        </div>
    );
}
