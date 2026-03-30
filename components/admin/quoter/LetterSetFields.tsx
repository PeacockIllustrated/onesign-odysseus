'use client';

/**
 * LetterSetFields Component
 * 
 * Dynamic form fields for 1-3 letter sets within the quote line item form.
 */

import { useFieldArray, UseFormReturn } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import type { PanelLettersV1Input } from '@/lib/quoter/types';

interface LetterSetFieldsProps {
    form: UseFormReturn<PanelLettersV1Input>;
    allowedFinishes: Map<string, Set<string>>;
}

const LETTER_TYPES = ['Fabricated', 'Komacel', 'Acrylic'] as const;
const HEIGHT_OPTIONS = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800, 900, 1000];

export function LetterSetFields({ form, allowedFinishes }: LetterSetFieldsProps) {
    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: 'letter_sets',
    });

    const watchLetterSets = form.watch('letter_sets');

    const getFinishesForType = (letterType: string): string[] => {
        const finishes = allowedFinishes.get(letterType);
        return finishes ? Array.from(finishes) : [];
    };

    const addLetterSet = () => {
        if (fields.length < 3) {
            append({
                type: 'Fabricated',
                qty: 1,
                height_mm: 200,
                finish: 'Powder Coating',
                illuminated: false,
            });
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-neutral-900">Letter Sets</h3>
                {fields.length < 3 && (
                    <button
                        type="button"
                        onClick={addLetterSet}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                    >
                        <Plus size={14} />
                        Add Letter Set
                    </button>
                )}
            </div>

            {fields.map((field, index) => {
                const currentType = watchLetterSets?.[index]?.type || 'Fabricated';
                const availableFinishes = getFinishesForType(currentType);

                return (
                    <div
                        key={field.id}
                        className="p-4 bg-neutral-50 rounded-[var(--radius-sm)] border border-neutral-200"
                    >
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-medium text-neutral-500">
                                Letter Set {index + 1}
                            </span>
                            {fields.length > 1 && (
                                <button
                                    type="button"
                                    onClick={() => remove(index)}
                                    className="p-1 text-red-500 hover:text-red-600"
                                    title="Remove letter set"
                                >
                                    <Trash2 size={14} />
                                </button>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            {/* Type */}
                            <div>
                                <label className="block text-xs font-medium text-neutral-600 mb-1">
                                    Type
                                </label>
                                <select
                                    {...form.register(`letter_sets.${index}.type`)}
                                    className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                                    onChange={(e) => {
                                        form.setValue(`letter_sets.${index}.type`, e.target.value as (typeof LETTER_TYPES)[number]);
                                        // Reset finish to first available for new type
                                        const newFinishes = getFinishesForType(e.target.value);
                                        if (newFinishes.length > 0) {
                                            form.setValue(`letter_sets.${index}.finish`, newFinishes[0]);
                                        }
                                    }}
                                >
                                    {LETTER_TYPES.map((type) => (
                                        <option key={type} value={type}>{type}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Finish */}
                            <div>
                                <label className="block text-xs font-medium text-neutral-600 mb-1">
                                    Finish
                                </label>
                                <select
                                    {...form.register(`letter_sets.${index}.finish`)}
                                    className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                                >
                                    {availableFinishes.map((finish) => (
                                        <option key={finish} value={finish}>{finish}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Quantity */}
                            <div>
                                <label className="block text-xs font-medium text-neutral-600 mb-1">
                                    Quantity
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    {...form.register(`letter_sets.${index}.qty`, { valueAsNumber: true })}
                                    className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                                />
                            </div>

                            {/* Height */}
                            <div>
                                <label className="block text-xs font-medium text-neutral-600 mb-1">
                                    Height (mm)
                                </label>
                                <select
                                    {...form.register(`letter_sets.${index}.height_mm`, { valueAsNumber: true })}
                                    className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                                >
                                    {HEIGHT_OPTIONS.map((h) => (
                                        <option key={h} value={h}>{h}mm</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Illuminated toggle */}
                        <div className="mt-3">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    {...form.register(`letter_sets.${index}.illuminated`)}
                                    className="w-4 h-4 rounded border-neutral-300 text-black focus:ring-black"
                                />
                                <span className="text-sm text-neutral-700">Illuminated</span>
                            </label>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
