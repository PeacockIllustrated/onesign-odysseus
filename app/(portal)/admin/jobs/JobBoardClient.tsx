// app/(portal)/admin/jobs/JobBoardClient.tsx
'use client';

import { useState, useEffect } from 'react';
import {
    DndContext,
    DragEndEvent,
    DragOverlay,
    PointerSensor,
    useSensor,
    useSensors,
    useDroppable,
} from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase';
import { moveJobToStage } from '@/lib/production/actions';
import type { BoardColumn, JobWithStage, ProductionJob, ProductionStage } from '@/lib/production/types';
import { JobCard } from './JobCard';
import { JobDetailPanel } from './JobDetailPanel';
import { CreateJobModal } from './CreateJobModal';

interface JobBoardClientProps {
    initialBoard: BoardColumn[];
    stages: ProductionStage[];
}

export function JobBoardClient({ initialBoard, stages }: JobBoardClientProps) {
    const [board, setBoard] = useState<BoardColumn[]>(initialBoard);
    const [detailJobId, setDetailJobId] = useState<string | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [draggingJob, setDraggingJob] = useState<JobWithStage | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
    );

    // Realtime: update board state when other users move jobs
    useEffect(() => {
        const supabase = createBrowserClient();
        const stageMap = new Map(stages.map(s => [s.id, s]));

        const channel = supabase
            .channel('job_board_realtime')
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'production_jobs' },
                (payload) => {
                    const updated = payload.new as ProductionJob;
                    setBoard(prev =>
                        prev.map(col => {
                            const filtered = col.jobs.filter(j => j.id !== updated.id);
                            if (col.stage.id === updated.current_stage_id) {
                                const stage = stageMap.get(updated.current_stage_id!) ?? null;
                                return {
                                    ...col,
                                    jobs: [...filtered, { ...updated, stage }],
                                };
                            }
                            return { ...col, jobs: filtered };
                        })
                    );
                }
            )
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'production_jobs' },
                (payload) => {
                    const newJob = payload.new as ProductionJob;
                    const stage = newJob.current_stage_id
                        ? stageMap.get(newJob.current_stage_id) ?? null
                        : null;
                    setBoard(prev =>
                        prev.map(col =>
                            col.stage.id === newJob.current_stage_id
                                ? { ...col, jobs: [...col.jobs, { ...newJob, stage }] }
                                : col
                        )
                    );
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [stages]);

    function handleDragStart(event: any) {
        const jobId = event.active.id as string;
        const job = board.flatMap(c => c.jobs).find(j => j.id === jobId) ?? null;
        setDraggingJob(job);
    }

    async function handleDragEnd(event: DragEndEvent) {
        setDraggingJob(null);
        const { active, over } = event;
        if (!over) return;

        const jobId = active.id as string;
        const newStageId = over.id as string;
        const currentJob = board.flatMap(c => c.jobs).find(j => j.id === jobId);
        if (!currentJob || currentJob.current_stage_id === newStageId) return;

        const targetStage = stages.find(s => s.id === newStageId);
        if (!targetStage) return;

        // Optimistic update
        setBoard(prev =>
            prev.map(col => {
                const without = col.jobs.filter(j => j.id !== jobId);
                if (col.stage.id === newStageId) {
                    return {
                        ...col,
                        jobs: [...without, { ...currentJob, current_stage_id: newStageId, stage: targetStage }],
                    };
                }
                return { ...col, jobs: without };
            })
        );

        const result = await moveJobToStage(jobId, newStageId);
        if ('error' in result) {
            // Revert on failure
            setBoard(initialBoard);
            console.error('Failed to move job:', result.error);
        }
    }

    const totalJobs = board.flatMap(c => c.jobs).length;

    return (
        <>
            <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-neutral-500">
                    {totalJobs} active job{totalJobs !== 1 ? 's' : ''}
                </span>
                <button
                    onClick={() => setCreateOpen(true)}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-[#4e7e8c] hover:bg-[#3a5f6a] rounded-[var(--radius-sm)] transition-colors"
                >
                    <Plus size={14} />
                    New job
                </button>
            </div>

            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                <div className="flex gap-3 overflow-x-auto pb-6 flex-1 min-h-0">
                    {board.map(col => (
                        <KanbanColumn
                            key={col.stage.id}
                            column={col}
                            onCardClick={setDetailJobId}
                        />
                    ))}
                </div>

                <DragOverlay>
                    {draggingJob && (
                        <div className="rotate-2 opacity-90">
                            <JobCard job={draggingJob} onClick={() => {}} />
                        </div>
                    )}
                </DragOverlay>
            </DndContext>

            {detailJobId && (
                <JobDetailPanel
                    jobId={detailJobId}
                    onClose={() => setDetailJobId(null)}
                    stages={stages}
                />
            )}

            <CreateJobModal
                open={createOpen}
                onClose={() => setCreateOpen(false)}
            />
        </>
    );
}

function KanbanColumn({
    column,
    onCardClick,
}: {
    column: BoardColumn;
    onCardClick: (id: string) => void;
}) {
    const { isOver, setNodeRef } = useDroppable({ id: column.stage.id });

    return (
        <div
            ref={setNodeRef}
            className={`
                flex-shrink-0 w-[272px] flex flex-col rounded-lg border border-neutral-200/60
                transition-colors duration-150
                ${isOver ? 'border-[#4e7e8c] shadow-sm' : ''}
            `}
            style={{ backgroundColor: `${column.stage.color}0d` }}
        >
            {/* Column header */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-neutral-200/60">
                <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: column.stage.color }}
                />
                <span className="text-xs font-semibold text-neutral-700 uppercase tracking-wider flex-1 truncate">
                    {column.stage.name}
                </span>
                <span className="text-xs text-neutral-400 bg-white/70 px-1.5 py-0.5 rounded font-medium">
                    {column.jobs.length}
                </span>
            </div>

            {/* Cards */}
            <div className="p-2 flex-1 space-y-2 min-h-[120px]">
                {column.jobs.map(job => (
                    <JobCard
                        key={job.id}
                        job={job}
                        onClick={() => onCardClick(job.id)}
                    />
                ))}
            </div>
        </div>
    );
}
