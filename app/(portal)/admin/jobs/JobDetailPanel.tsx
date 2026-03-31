// app/(portal)/admin/jobs/JobDetailPanel.tsx
'use client';

import { useState, useEffect, useTransition } from 'react';
import { X, Clock, AlertCircle, Plus } from 'lucide-react';
import type { ProductionStage } from '@/lib/production/types';
import {
    getJobItemDetailAction,
    moveJobItemToStage,
    addDepartmentInstruction,
    setItemWorkCentre,
} from '@/lib/production/actions';
import { isJobOverdue, formatDueDate } from '@/lib/production/utils';

// Local type alias to avoid importing the unexported type
type JobItemDetail = Awaited<ReturnType<typeof getJobItemDetailAction>>;

interface JobDetailPanelProps {
    itemId: string;
    onClose: () => void;
    stages: ProductionStage[];
}

export function JobDetailPanel({ itemId, onClose, stages }: JobDetailPanelProps) {
    const [detail, setDetail] = useState<NonNullable<JobItemDetail> | null>(null);
    const [loading, setLoading] = useState(true);
    const [isPending, startTransition] = useTransition();
    const [newInstruction, setNewInstruction] = useState('');
    const [instructionStageId, setInstructionStageId] = useState('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        getJobItemDetailAction(itemId)
            .then(d => {
                setDetail(d);
            })
            .catch(err => {
                console.error('Failed to load item detail:', err);
            })
            .finally(() => {
                setLoading(false);
            });
    }, [itemId]);

    function handleMoveStage(stageId: string) {
        const capturedItemId = itemId;
        startTransition(async () => {
            const result = await moveJobItemToStage(capturedItemId, stageId);
            if ('error' in result) { setError(result.error); return; }
            setError(null);
            const updated = await getJobItemDetailAction(capturedItemId);
            if (capturedItemId === itemId) setDetail(updated);
        });
    }

    function handleSetWorkCentre(wcId: string | null) {
        const capturedItemId = itemId;
        startTransition(async () => {
            const result = await setItemWorkCentre(capturedItemId, wcId);
            if ('error' in result) { setError(result.error); return; }
            setError(null);
            const updated = await getJobItemDetailAction(capturedItemId);
            if (capturedItemId === itemId) setDetail(updated);
        });
    }

    function handleAddInstruction() {
        if (!newInstruction.trim() || !instructionStageId || !detail) return;
        const capturedItemId = itemId;
        startTransition(async () => {
            const result = await addDepartmentInstruction(detail.job_id, instructionStageId, newInstruction.trim());
            if ('error' in result) { setError(result.error); return; }
            setError(null);
            setNewInstruction('');
            setInstructionStageId('');
            const updated = await getJobItemDetailAction(capturedItemId);
            if (capturedItemId === itemId) setDetail(updated);
        });
    }

    // Stage routing pipeline data
    const routingStages = detail
        ? detail.stage_routing
            .map(id => stages.find(s => s.id === id))
            .filter((s): s is ProductionStage => Boolean(s))
        : [];
    const currentIdx = detail
        ? routingStages.findIndex(s => s.id === detail.current_stage_id)
        : -1;

    // Move targets: stages in the routing that are not the current stage.
    // Fall back to all stages if no routing is configured.
    const moveTargets = detail
        ? (detail.stage_routing.length > 0
            ? stages.filter(s => detail.stage_routing.includes(s.id) && s.id !== detail.current_stage_id)
            : stages.filter(s => s.id !== detail.current_stage_id))
        : [];

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/30 z-40"
                onClick={onClose}
            />

            {/* Panel */}
            <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
                    <div>
                        {detail ? (
                            <>
                                <code className="text-xs font-mono text-[#4e7e8c] font-semibold">
                                    {detail.job.job_number}{detail.item_number ? ` · ${detail.item_number}` : ''}
                                </code>
                                <p className="text-sm font-semibold text-neutral-900 mt-0.5">
                                    {detail.job.client_name}
                                </p>
                            </>
                        ) : (
                            <div className="h-8 w-48 bg-neutral-100 rounded animate-pulse" />
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-neutral-400 hover:text-neutral-700 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {loading ? (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-sm text-neutral-500">Loading…</div>
                    </div>
                ) : !detail ? (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-sm text-neutral-500">Item not found</div>
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto p-5 space-y-6">
                        {error && (
                            <div className="bg-red-50 border border-red-200 rounded px-3 py-2 text-xs text-red-700 flex items-center justify-between">
                                {error}
                                <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-600">✕</button>
                            </div>
                        )}

                        {/* Meta grid */}
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p className="text-xs font-medium text-neutral-500 uppercase mb-1">Current Stage</p>
                                <div className="flex items-center gap-2">
                                    {detail.stage && (
                                        <div
                                            className="w-2 h-2 rounded-full"
                                            style={{ backgroundColor: detail.stage.color }}
                                        />
                                    )}
                                    <span>{detail.stage?.name ?? '—'}</span>
                                </div>
                            </div>
                            <div>
                                <p className="text-xs font-medium text-neutral-500 uppercase mb-1">Item Status</p>
                                <span className={`capitalize font-medium ${
                                    detail.status === 'completed' ? 'text-green-700' :
                                    detail.status === 'in_progress' ? 'text-blue-700' :
                                    'text-neutral-600'
                                }`}>
                                    {detail.status.replace('_', ' ')}
                                </span>
                            </div>
                            <div>
                                <p className="text-xs font-medium text-neutral-500 uppercase mb-1">Priority</p>
                                <span className={`capitalize font-medium ${
                                    detail.job.priority === 'urgent' ? 'text-red-600' :
                                    detail.job.priority === 'high' ? 'text-amber-600' : 'text-neutral-700'
                                }`}>
                                    {detail.job.priority}
                                </span>
                            </div>
                            <div>
                                <p className="text-xs font-medium text-neutral-500 uppercase mb-1">Due Date</p>
                                <span className={isJobOverdue(detail.job.due_date) ? 'text-red-600 font-semibold flex items-center gap-1' : 'text-neutral-700'}>
                                    {isJobOverdue(detail.job.due_date) && <AlertCircle size={12} />}
                                    {formatDueDate(detail.job.due_date) ?? '—'}
                                </span>
                            </div>
                        </div>

                        {/* Stage routing pipeline */}
                        {routingStages.length > 0 && (
                            <div>
                                <p className="text-xs font-medium text-neutral-500 uppercase mb-2">Stage Route</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {routingStages.map((s, idx) => {
                                        const isCurrent = s.id === detail.current_stage_id;
                                        const isPast = currentIdx >= 0 && idx < currentIdx;
                                        const opacity = isCurrent ? 1 : isPast ? 0.4 : 0.2;
                                        return (
                                            <span
                                                key={s.id}
                                                className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border"
                                                style={{
                                                    borderColor: isCurrent ? s.color : '#e5e7eb',
                                                    boxShadow: isCurrent ? `0 0 0 2px ${s.color}40` : undefined,
                                                    opacity,
                                                }}
                                            >
                                                <div
                                                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                                    style={{ backgroundColor: s.color }}
                                                />
                                                {s.name}
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Work centre picker */}
                        {detail.work_centres.length > 0 && (
                            <div>
                                <p className="text-xs font-medium text-neutral-500 uppercase mb-2">Work Centre</p>
                                <select
                                    value={detail.work_centre_id || ''}
                                    onChange={e => handleSetWorkCentre(e.target.value || null)}
                                    disabled={isPending}
                                    className="w-full text-sm border border-neutral-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#4e7e8c] disabled:opacity-50"
                                >
                                    <option value="">— Unassigned —</option>
                                    {detail.work_centres.map(wc => (
                                        <option key={wc.id} value={wc.id}>{wc.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Artwork approval banner */}
                        {detail.stage?.is_approval_stage && (
                            <div className="bg-orange-50 border border-orange-200 rounded p-3">
                                <p className="text-xs font-semibold text-orange-700 uppercase mb-1">Artwork Approval Stage</p>
                                <p className="text-sm text-neutral-700 mb-2">This item is awaiting artwork sign-off.</p>
                                <a
                                    href="/admin/artwork"
                                    className="text-xs text-[#4e7e8c] hover:underline"
                                >
                                    View Artwork Jobs →
                                </a>
                            </div>
                        )}

                        {/* Move to stage */}
                        <div>
                            <p className="text-xs font-medium text-neutral-500 uppercase mb-2">Move to Stage</p>
                            <div className="flex flex-wrap gap-2">
                                {moveTargets.map(s => (
                                    <button
                                        key={s.id}
                                        disabled={isPending}
                                        onClick={() => handleMoveStage(s.id)}
                                        className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-colors bg-neutral-100 text-neutral-700 hover:bg-neutral-200 disabled:opacity-50"
                                    >
                                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                                        {s.name}
                                    </button>
                                ))}
                                {moveTargets.length === 0 && (
                                    <p className="text-sm text-neutral-400">No further stages</p>
                                )}
                            </div>
                        </div>

                        {/* Department instructions */}
                        <div>
                            <p className="text-xs font-medium text-neutral-500 uppercase mb-2">Department Instructions</p>
                            {detail.instructions.length > 0 ? (
                                <div className="space-y-2 mb-3">
                                    {detail.instructions.map(inst => (
                                        <div key={inst.id} className="bg-amber-50 border border-amber-200 rounded p-3">
                                            {inst.stage && (
                                                <p className="text-[10px] font-semibold uppercase text-amber-700 mb-1">
                                                    {inst.stage.name}
                                                </p>
                                            )}
                                            <p className="text-sm text-neutral-800">{inst.instruction}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-neutral-400 mb-3">No instructions yet</p>
                            )}

                            {/* Add instruction form */}
                            <div className="space-y-2">
                                <select
                                    value={instructionStageId}
                                    onChange={e => setInstructionStageId(e.target.value)}
                                    className="w-full text-sm border border-neutral-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#4e7e8c]"
                                >
                                    <option value="">Select stage…</option>
                                    {stages.map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newInstruction}
                                        onChange={e => setNewInstruction(e.target.value)}
                                        placeholder="Add instruction for this stage…"
                                        className="flex-1 text-sm border border-neutral-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#4e7e8c]"
                                        onKeyDown={e => e.key === 'Enter' && handleAddInstruction()}
                                    />
                                    <button
                                        onClick={handleAddInstruction}
                                        disabled={!newInstruction.trim() || !instructionStageId || isPending}
                                        className="px-3 py-1.5 text-sm bg-[#4e7e8c] text-white rounded disabled:opacity-40 hover:bg-[#3a5f6a] transition-colors"
                                    >
                                        <Plus size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Stage log */}
                        {detail.stage_log.length > 0 && (
                            <div>
                                <p className="text-xs font-medium text-neutral-500 uppercase mb-2">Stage History</p>
                                <div className="space-y-1">
                                    {detail.stage_log.map(entry => (
                                        <div key={entry.id} className="flex items-start gap-2 text-xs text-neutral-500 py-1">
                                            <Clock size={12} className="mt-0.5 flex-shrink-0" />
                                            <div>
                                                <span className="text-neutral-700">
                                                    {entry.from_stage ? `${entry.from_stage.name} → ` : ''}
                                                    <span className="font-medium">{entry.to_stage?.name}</span>
                                                </span>
                                                {entry.moved_by_name && (
                                                    <span className="ml-1">by {entry.moved_by_name}</span>
                                                )}
                                                {entry.notes && (
                                                    <p className="text-neutral-400 italic mt-0.5">{entry.notes}</p>
                                                )}
                                                <p className="text-neutral-300 mt-0.5">
                                                    {new Date(entry.moved_at).toLocaleString('en-GB', {
                                                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                                                    })}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </>
    );
}
