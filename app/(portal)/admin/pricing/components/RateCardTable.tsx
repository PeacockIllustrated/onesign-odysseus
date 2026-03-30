'use client';

/**
 * RateCardTable Component
 * 
 * Generic editable table for rate card data with add/edit/delete.
 */

import { useState } from 'react';
import { Plus, Pencil, Trash2, Loader2, X, Check } from 'lucide-react';
import { addRateCardRowAction, updateRateCardRowAction, deleteRateCardRowAction } from '@/lib/quoter/pricing-actions';

type RateCardTable =
    | 'panel_prices'
    | 'panel_finishes'
    | 'manufacturing_rates'
    | 'illumination_profiles'
    | 'transformers'
    | 'opal_prices'
    | 'consumables'
    | 'letter_finish_rules'
    | 'letter_price_table';

interface Column {
    key: string;
    label: string;
    type: 'text' | 'number' | 'select';
    options?: string[];
    suffix?: string;
    required?: boolean;
}

interface RateCardTableProps {
    table: RateCardTable;
    pricingSetId: string;
    columns: Column[];
    data: Record<string, unknown>[];
    isEditable: boolean;
    onRefresh: () => void;
}

function formatValue(value: unknown, column: Column): string {
    if (value === null || value === undefined) return '—';

    if (column.type === 'number' && column.suffix === 'pence') {
        return `£${((value as number) / 100).toFixed(2)}`;
    }

    if (column.suffix) {
        return `${value}${column.suffix}`;
    }

    return String(value);
}

function parsePenceInput(value: string): number {
    // Convert pound input to pence
    const num = parseFloat(value);
    return Math.round(num * 100);
}

export function RateCardTableComponent({
    table,
    pricingSetId,
    columns,
    data,
    isEditable,
    onRefresh,
}: RateCardTableProps) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValues, setEditValues] = useState<Record<string, string>>({});
    const [isAdding, setIsAdding] = useState(false);
    const [newValues, setNewValues] = useState<Record<string, string>>({});
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const startEdit = (row: Record<string, unknown>) => {
        setEditingId(row.id as string);
        const values: Record<string, string> = {};
        for (const col of columns) {
            const val = row[col.key];
            if (col.type === 'number' && col.suffix === 'pence') {
                values[col.key] = ((val as number) / 100).toFixed(2);
            } else {
                values[col.key] = val === null || val === undefined ? '' : String(val);
            }
        }
        setEditValues(values);
        setError(null);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditValues({});
        setError(null);
    };

    const saveEdit = async () => {
        setIsSaving(true);
        setError(null);

        try {
            const data: Record<string, string | number | null> = {};
            for (const col of columns) {
                const val = editValues[col.key];
                if (col.type === 'number') {
                    if (col.suffix === 'pence') {
                        data[col.key] = parsePenceInput(val);
                    } else {
                        data[col.key] = val ? parseFloat(val) : 0;
                    }
                } else {
                    data[col.key] = val || null;
                }
            }

            const result = await updateRateCardRowAction(table, editingId!, pricingSetId, data);

            if ('error' in result) {
                setError(result.error);
                return;
            }

            cancelEdit();
            onRefresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (rowId: string) => {
        if (!confirm('Are you sure you want to delete this row?')) return;

        setIsSaving(true);
        try {
            const result = await deleteRateCardRowAction(table, rowId, pricingSetId);
            if ('error' in result) {
                setError(result.error);
            } else {
                onRefresh();
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete');
        } finally {
            setIsSaving(false);
        }
    };

    const startAdd = () => {
        setIsAdding(true);
        const values: Record<string, string> = {};
        for (const col of columns) {
            values[col.key] = col.options?.[0] || '';
        }
        setNewValues(values);
        setError(null);
    };

    const cancelAdd = () => {
        setIsAdding(false);
        setNewValues({});
        setError(null);
    };

    const saveAdd = async () => {
        setIsSaving(true);
        setError(null);

        try {
            const data: Record<string, string | number | null> = {};
            for (const col of columns) {
                const val = newValues[col.key];
                if (col.type === 'number') {
                    if (col.suffix === 'pence') {
                        data[col.key] = parsePenceInput(val);
                    } else {
                        data[col.key] = val ? parseFloat(val) : 0;
                    }
                } else {
                    data[col.key] = val || null;
                }
            }

            const result = await addRateCardRowAction(table, pricingSetId, data);

            if ('error' in result) {
                setError(result.error);
                return;
            }

            cancelAdd();
            onRefresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to add');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-2">
            {error && (
                <div className="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    {error}
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-neutral-200">
                            {columns.map((col) => (
                                <th key={col.key} className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase">
                                    {col.label}
                                </th>
                            ))}
                            {isEditable && <th className="px-3 py-2 w-20"></th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                        {data.map((row) => (
                            <tr key={row.id as string} className="hover:bg-neutral-50">
                                {editingId === row.id ? (
                                    <>
                                        {columns.map((col) => (
                                            <td key={col.key} className="px-3 py-1">
                                                {col.type === 'select' && col.options ? (
                                                    <select
                                                        value={editValues[col.key] || ''}
                                                        onChange={(e) => setEditValues({ ...editValues, [col.key]: e.target.value })}
                                                        className="w-full px-2 py-1 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-black"
                                                    >
                                                        {col.options.map((opt) => (
                                                            <option key={opt} value={opt}>{opt}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <input
                                                        type={col.type === 'number' ? 'number' : 'text'}
                                                        step={col.suffix === 'pence' ? '0.01' : undefined}
                                                        value={editValues[col.key] || ''}
                                                        onChange={(e) => setEditValues({ ...editValues, [col.key]: e.target.value })}
                                                        className="w-full px-2 py-1 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-black"
                                                    />
                                                )}
                                            </td>
                                        ))}
                                        <td className="px-3 py-1">
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={saveEdit}
                                                    disabled={isSaving}
                                                    className="p-1 text-green-600 hover:text-green-700 disabled:opacity-50"
                                                >
                                                    {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                                </button>
                                                <button
                                                    onClick={cancelEdit}
                                                    disabled={isSaving}
                                                    className="p-1 text-neutral-500 hover:text-neutral-700"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </>
                                ) : (
                                    <>
                                        {columns.map((col) => (
                                            <td key={col.key} className="px-3 py-2 text-neutral-700">
                                                {formatValue(row[col.key], col)}
                                            </td>
                                        ))}
                                        {isEditable && (
                                            <td className="px-3 py-2">
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => startEdit(row)}
                                                        className="p-1 text-neutral-400 hover:text-neutral-600"
                                                        title="Edit"
                                                    >
                                                        <Pencil size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(row.id as string)}
                                                        className="p-1 text-neutral-400 hover:text-red-600"
                                                        title="Delete"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </>
                                )}
                            </tr>
                        ))}

                        {/* Add row */}
                        {isAdding && (
                            <tr className="bg-blue-50">
                                {columns.map((col) => (
                                    <td key={col.key} className="px-3 py-1">
                                        {col.type === 'select' && col.options ? (
                                            <select
                                                value={newValues[col.key] || ''}
                                                onChange={(e) => setNewValues({ ...newValues, [col.key]: e.target.value })}
                                                className="w-full px-2 py-1 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-black"
                                            >
                                                {col.options.map((opt) => (
                                                    <option key={opt} value={opt}>{opt}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <input
                                                type={col.type === 'number' ? 'number' : 'text'}
                                                step={col.suffix === 'pence' ? '0.01' : undefined}
                                                value={newValues[col.key] || ''}
                                                onChange={(e) => setNewValues({ ...newValues, [col.key]: e.target.value })}
                                                placeholder={col.label}
                                                className="w-full px-2 py-1 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-black"
                                            />
                                        )}
                                    </td>
                                ))}
                                <td className="px-3 py-1">
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={saveAdd}
                                            disabled={isSaving}
                                            className="p-1 text-green-600 hover:text-green-700 disabled:opacity-50"
                                        >
                                            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                        </button>
                                        <button
                                            onClick={cancelAdd}
                                            disabled={isSaving}
                                            className="p-1 text-neutral-500 hover:text-neutral-700"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {isEditable && !isAdding && (
                <button
                    onClick={startAdd}
                    className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                >
                    <Plus size={14} />
                    Add Row
                </button>
            )}
        </div>
    );
}
