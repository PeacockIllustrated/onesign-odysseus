// app/shop-floor/ShopFloorClient.tsx
'use client';

import { useState, useEffect, useTransition } from 'react';
import { Play, Pause, CheckCircle, ChevronDown, AlertCircle } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase';
import {
    startJob,
    pauseJob,
    advanceJobToNextStage,
    getJobDetailAction,
    getShopFloorJobsAction,
} from '@/lib/production/actions';
import type { ProductionStage, JobItemWithJob, JobDetail } from '@/lib/production/types';
import { isJobOverdue, formatDueDate } from '@/lib/production/utils';

interface ShopFloorClientProps {
    stages: ProductionStage[];
    initialJobs: JobItemWithJob[];
    initialStageSlug: string;
}

export function ShopFloorClient({ stages, initialJobs, initialStageSlug }: ShopFloorClientProps) {
    const [activeSlug, setActiveSlug] = useState(initialStageSlug);
    const [jobs, setJobs] = useState<JobItemWithJob[]>(initialJobs);
    const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
    const [expandedDetail, setExpandedDetail] = useState<JobDetail | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [pendingJobId, setPendingJobId] = useState<string | null>(null);
    const [, startTransition] = useTransition();

    const activeStage = stages.find(s => s.slug === activeSlug);

    // Realtime subscription — refetch queue on any change to production_jobs
    useEffect(() => {
        const supabase = createBrowserClient();
        const channel = supabase
            .channel('shop_floor_realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'production_jobs' },
                () => {
                    getShopFloorJobsAction(activeSlug).then(setJobs);
                }
            )
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [activeSlug]);

    // Refetch when switching stages
    useEffect(() => {
        getShopFloorJobsAction(activeSlug).then(setJobs);
    }, [activeSlug]);

    // Load detail when card expanded
    useEffect(() => {
        if (!expandedJobId) {
            setExpandedDetail(null);
            return;
        }
        getJobDetailAction(expandedJobId).then(setExpandedDetail);
    }, [expandedJobId]);

    function handleExpand(jobId: string) {
        setExpandedJobId(prev => prev === jobId ? null : jobId);
    }

    function handleStart(jobId: string) {
        setErrorMessage(null);
        setPendingJobId(jobId);
        startTransition(async () => {
            try {
                const result = await startJob(jobId);
                if ('error' in result) {
                    setErrorMessage(result.error);
                } else {
                    const updated = await getShopFloorJobsAction(activeSlug);
                    setJobs(updated);
                }
            } finally {
                setPendingJobId(null);
            }
        });
    }

    function handlePause(jobId: string) {
        setErrorMessage(null);
        setPendingJobId(jobId);
        startTransition(async () => {
            try {
                const result = await pauseJob(jobId);
                if ('error' in result) {
                    setErrorMessage(result.error);
                } else {
                    const updated = await getShopFloorJobsAction(activeSlug);
                    setJobs(updated);
                }
            } finally {
                setPendingJobId(null);
            }
        });
    }

    function handleAdvance(jobId: string) {
        setErrorMessage(null);
        setPendingJobId(jobId);
        startTransition(async () => {
            try {
                const result = await advanceJobToNextStage(jobId);
                if ('error' in result) {
                    setErrorMessage(result.error);
                } else {
                    const updated = await getShopFloorJobsAction(activeSlug);
                    setJobs(updated);
                }
            } finally {
                setPendingJobId(null);
            }
        });
    }

    return (
        <div>
            {/* Error banner */}
            {errorMessage && (
                <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <AlertCircle size={16} className="flex-shrink-0" />
                        <span className="text-sm font-medium">{errorMessage}</span>
                    </div>
                    <button
                        onClick={() => setErrorMessage(null)}
                        className="text-red-600 hover:text-red-800 font-bold text-lg leading-none ml-3"
                        aria-label="Dismiss error"
                    >
                        &times;
                    </button>
                </div>
            )}

            {/* Stage tabs */}
            <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
                {stages.map(stage => {
                    const count = stage.slug === activeSlug ? jobs.length : null;
                    return (
                        <button
                            key={stage.slug}
                            onClick={() => setActiveSlug(stage.slug)}
                            className={`
                                flex-shrink-0 flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold
                                transition-colors border-2
                                ${stage.slug === activeSlug
                                    ? 'bg-[#4e7e8c] text-white border-[#4e7e8c]'
                                    : 'bg-white text-neutral-700 border-neutral-200 hover:border-[#4e7e8c]'}
                            `}
                        >
                            <div
                                className="w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: stage.slug === activeSlug ? 'rgba(255,255,255,0.8)' : stage.color }}
                            />
                            {stage.name}
                            {count !== null && (
                                <span className={`
                                    text-xs px-1.5 py-0.5 rounded-full font-bold
                                    ${stage.slug === activeSlug ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-600'}
                                `}>
                                    {count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Stage header */}
            {activeStage && (
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: activeStage.color }} />
                    <h2 className="text-lg font-bold text-neutral-900">{activeStage.name}</h2>
                    <span className="text-sm text-neutral-500">{jobs.length} job{jobs.length !== 1 ? 's' : ''}</span>
                </div>
            )}

            {/* Job cards */}
            {jobs.length === 0 ? (
                <div className="bg-white rounded-xl border border-neutral-200 p-12 text-center">
                    <p className="text-neutral-500 font-medium">No jobs in this stage</p>
                    <p className="text-sm text-neutral-400 mt-1">Jobs will appear here when moved to {activeStage?.name}</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {jobs.map(item => (
                        <div
                            key={item.id}
                            className={`bg-white rounded-xl border-2 transition-all ${
                                item.status === 'in_progress' ? 'border-neutral-200' : 'border-amber-300 opacity-80'
                            }`}
                        >
                            {/* Card header */}
                            <div className="p-4">
                                <div className="flex items-start justify-between gap-3 mb-2">
                                    <div className="flex-1 min-w-0">
                                        <code className="text-xs font-mono text-[#4e7e8c] font-semibold">
                                            {item.job.job_number}{item.item_number ? ` / ${item.item_number}` : ''}
                                        </code>
                                        <p className="text-lg font-bold text-neutral-900 leading-tight truncate">
                                            {item.job.client_name}
                                        </p>
                                        <p className="text-sm text-neutral-600 mt-0.5 line-clamp-2">{item.description}</p>
                                    </div>
                                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                                        {item.job.priority === 'urgent' && (
                                            <span className="text-xs font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                                                URGENT
                                            </span>
                                        )}
                                        {item.job.priority === 'high' && (
                                            <span className="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                                                HIGH
                                            </span>
                                        )}
                                        {item.job.due_date && (
                                            <span className={`text-xs flex items-center gap-1 ${
                                                isJobOverdue(item.job.due_date) ? 'text-red-600 font-bold' : 'text-neutral-500'
                                            }`}>
                                                {isJobOverdue(item.job.due_date) && <AlertCircle size={12} />}
                                                Due {formatDueDate(item.job.due_date)}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Action buttons — large touch targets */}
                                <div className="flex gap-2 mt-3">
                                    {item.status !== 'in_progress' && (
                                        <button
                                            onClick={() => handleStart(item.id)}
                                            disabled={pendingJobId === item.id}
                                            className="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 flex-1"
                                        >
                                            <Play size={16} />
                                            Start
                                        </button>
                                    )}
                                    {item.status === 'in_progress' && (
                                        <button
                                            onClick={() => handlePause(item.id)}
                                            disabled={pendingJobId === item.id}
                                            className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                                        >
                                            <Pause size={16} />
                                            Pause
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleAdvance(item.id)}
                                        disabled={pendingJobId === item.id}
                                        className="flex items-center gap-2 px-4 py-2.5 bg-[#4e7e8c] hover:bg-[#3a5f6a] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 flex-1"
                                    >
                                        <CheckCircle size={16} />
                                        Complete → Next Stage
                                    </button>
                                    <button
                                        onClick={() => handleExpand(item.id)}
                                        className="p-2.5 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
                                        aria-label="View details"
                                    >
                                        <ChevronDown
                                            size={16}
                                            className={`transition-transform ${expandedJobId === item.id ? 'rotate-180' : ''}`}
                                        />
                                    </button>
                                </div>
                            </div>

                            {/* Expanded department instructions */}
                            {expandedJobId === item.id && (
                                <div className="border-t border-neutral-200 p-4 bg-neutral-50 rounded-b-xl">
                                    {!expandedDetail ? (
                                        <p className="text-sm text-neutral-500">Loading…</p>
                                    ) : expandedDetail.instructions.filter(i => i.stage_id === activeStage?.id).length === 0 ? (
                                        <p className="text-sm text-neutral-500">No instructions for this stage.</p>
                                    ) : (
                                        <div className="space-y-2">
                                            <p className="text-xs font-semibold uppercase text-neutral-500">Instructions</p>
                                            {expandedDetail.instructions
                                                .filter(i => i.stage_id === activeStage?.id)
                                                .map(inst => (
                                                    <div key={inst.id} className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                                        <p className="text-sm text-neutral-800">{inst.instruction}</p>
                                                    </div>
                                                ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
