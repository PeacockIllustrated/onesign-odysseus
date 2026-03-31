// app/(portal)/admin/jobs/JobBoardClient.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
    DndContext,
    DragEndEvent,
    DragStartEvent,
    DragOverlay,
    PointerSensor,
    useSensor,
    useSensors,
    useDroppable,
} from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase';
import { moveJobItemToStage } from '@/lib/production/actions';
import type { ItemBoardColumn, JobItemWithJob, JobItem, ProductionStage } from '@/lib/production/types';
import { ItemCard } from './JobCard';
import { JobDetailPanel } from './JobDetailPanel';
import { CreateJobModal } from './CreateJobModal';

interface JobBoardClientProps {
    initialBoard: ItemBoardColumn[];
    stages: ProductionStage[];
}

export function JobBoardClient({ initialBoard, stages }: JobBoardClientProps) {
    const router = useRouter();
    const [board, setBoard] = useState<ItemBoardColumn[]>(initialBoard);
    const [detailItemId, setDetailItemId] = useState<string | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [draggingItem, setDraggingItem] = useState<JobItemWithJob | null>(null);
    const preDragBoardRef = useRef<ItemBoardColumn[]>(board);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
    );

    // Realtime: update board state when items move
    useEffect(() => {
        const supabase = createBrowserClient();
        const stageMap = new Map(stages.map(s => [s.id, s]));

        const channel = supabase
            .channel('item_board_realtime')
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'job_items' },
                (payload) => {
                    const updated = payload.new as JobItem;
                    setBoard(prev => {
                        // Find the item in the existing board to preserve .job context
                        const existingItem = prev.flatMap(c => c.items).find(i => i.id === updated.id);
                        if (!existingItem) return prev;
                        const stage = stageMap.get(updated.current_stage_id ?? '') ?? null;
                        const updatedItem: JobItemWithJob = { ...existingItem, ...updated, stage };
                        return prev.map(col => {
                            const filtered = col.items.filter(i => i.id !== updated.id);
                            if (col.stage.id === updated.current_stage_id) {
                                return { ...col, items: [...filtered, updatedItem] };
                            }
                            return { ...col, items: filtered };
                        });
                    });
                }
            )
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'job_items' },
                () => {
                    // Can't easily hydrate .job from realtime alone — trigger a full refresh
                    router.refresh();
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [stages, router]);

    function handleDragStart(event: DragStartEvent) {
        preDragBoardRef.current = board;
        const itemId = String(event.active.id);
        const item = board.flatMap(c => c.items).find(i => i.id === itemId) ?? null;
        setDraggingItem(item);
    }

    async function handleDragEnd(event: DragEndEvent) {
        setDraggingItem(null);
        const { active, over } = event;
        if (!over) return;

        const itemId = active.id as string;
        const newStageId = over.id as string;
        const currentItem = board.flatMap(c => c.items).find(i => i.id === itemId);
        if (!currentItem || currentItem.current_stage_id === newStageId) return;

        const targetStage = stages.find(s => s.id === newStageId);
        if (!targetStage) return;

        // Optimistic update
        setBoard(prev =>
            prev.map(col => {
                const without = col.items.filter(i => i.id !== itemId);
                if (col.stage.id === newStageId) {
                    return {
                        ...col,
                        items: [...without, { ...currentItem, current_stage_id: newStageId, stage: targetStage }],
                    };
                }
                return { ...col, items: without };
            })
        );

        const result = await moveJobItemToStage(itemId, newStageId);
        if ('error' in result) {
            // Revert on failure
            setBoard(preDragBoardRef.current);
            console.error('Failed to move item:', result.error);
        }
    }

    const totalItems = board.flatMap(c => c.items).length;

    return (
        <>
            <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-neutral-500">
                    {totalItems} active item{totalItems !== 1 ? 's' : ''}
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
                            onCardClick={setDetailItemId}
                        />
                    ))}
                </div>

                <DragOverlay>
                    {draggingItem && (
                        <div className="rotate-2 opacity-90">
                            <ItemCard item={draggingItem} onClick={() => {}} />
                        </div>
                    )}
                </DragOverlay>
            </DndContext>

            {detailItemId && (
                <JobDetailPanel
                    jobId={detailItemId}
                    onClose={() => setDetailItemId(null)}
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
    column: ItemBoardColumn;
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
                    {column.items.length}
                </span>
            </div>

            {/* Cards */}
            <div className="p-2 flex-1 space-y-2 min-h-[120px]">
                {column.items.map(item => (
                    <ItemCard
                        key={item.id}
                        item={item}
                        onClick={() => onCardClick(item.id)}
                    />
                ))}
            </div>
        </div>
    );
}
