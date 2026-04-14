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
import { Plus, LayoutGrid, List as ListIcon, AlertCircle } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase';
import { moveJobItemToStage } from '@/lib/production/actions';
import type { ItemBoardColumn, JobItemWithJob, JobItem, ProductionStage } from '@/lib/production/types';
import { isJobOverdue, formatDueDate } from '@/lib/production/utils';
import { ItemCard } from './JobCard';
import { ClientGroupCard } from './ClientGroupCard';
import { JobDetailPanel } from './JobDetailPanel';
import { CreateJobModal } from './CreateJobModal';

type BoardView = 'kanban' | 'list';
const VIEW_STORAGE_KEY = 'odysseus-jobs-view';

function insertItemSorted(items: JobItemWithJob[], item: JobItemWithJob): JobItemWithJob[] {
    const all = items.filter(i => i.id !== item.id).concat(item);
    return all.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

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
    const preDragBoardRef = useRef<ItemBoardColumn[]>([]);
    const [view, setView] = useState<BoardView>('kanban');

    // Load persisted view preference
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const saved = window.localStorage.getItem(VIEW_STORAGE_KEY);
        if (saved === 'kanban' || saved === 'list') setView(saved);
    }, []);

    function changeView(next: BoardView) {
        setView(next);
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(VIEW_STORAGE_KEY, next);
        }
    }

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
                                return { ...col, items: insertItemSorted(filtered, updatedItem) };
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
                        items: insertItemSorted(without, { ...currentItem, current_stage_id: newStageId, stage: targetStage }),
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
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                <span className="text-sm text-neutral-500">
                    {totalItems} active item{totalItems !== 1 ? 's' : ''}
                </span>
                <div className="flex items-center gap-2">
                    {/* View toggle */}
                    <div className="inline-flex items-center bg-neutral-100 rounded-[var(--radius-sm)] p-0.5">
                        <button
                            onClick={() => changeView('kanban')}
                            aria-pressed={view === 'kanban'}
                            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-[calc(var(--radius-sm)-2px)] transition-colors ${
                                view === 'kanban'
                                    ? 'bg-white text-neutral-900 shadow-sm'
                                    : 'text-neutral-500 hover:text-neutral-700'
                            }`}
                        >
                            <LayoutGrid size={13} />
                            Kanban
                        </button>
                        <button
                            onClick={() => changeView('list')}
                            aria-pressed={view === 'list'}
                            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-[calc(var(--radius-sm)-2px)] transition-colors ${
                                view === 'list'
                                    ? 'bg-white text-neutral-900 shadow-sm'
                                    : 'text-neutral-500 hover:text-neutral-700'
                            }`}
                        >
                            <ListIcon size={13} />
                            List
                        </button>
                    </div>

                    <button
                        onClick={() => setCreateOpen(true)}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-[#4e7e8c] hover:bg-[#3a5f6a] rounded-[var(--radius-sm)] transition-colors"
                    >
                        <Plus size={14} />
                        New job
                    </button>
                </div>
            </div>

            {view === 'kanban' ? (
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
            ) : (
                <ListView board={board} onRowClick={setDetailItemId} />
            )}

            {detailItemId && (
                <JobDetailPanel
                    itemId={detailItemId}
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
                flex-shrink-0 w-[85vw] sm:w-[240px] md:w-[272px] flex flex-col rounded-lg border border-neutral-200/60
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

            {/* Cards — grouped by client */}
            <div className="p-2 flex-1 space-y-2 min-h-[120px]">
                {(() => {
                    // Group items by client name, preserving insertion order
                    const grouped = new Map<string, JobItemWithJob[]>();
                    for (const item of column.items) {
                        const key = item.job.client_name;
                        if (!grouped.has(key)) grouped.set(key, []);
                        grouped.get(key)!.push(item);
                    }
                    return Array.from(grouped.entries()).map(([clientName, items]) => (
                        <ClientGroupCard
                            key={clientName}
                            clientName={clientName}
                            items={items}
                            onCardClick={onCardClick}
                        />
                    ));
                })()}
            </div>
        </div>
    );
}

const PRIORITY_PILL: Record<string, string> = {
    urgent: 'bg-red-50 text-red-700 border-red-200',
    high: 'bg-amber-50 text-amber-700 border-amber-200',
    normal: 'bg-neutral-50 text-neutral-600 border-neutral-200',
    low: 'bg-neutral-50 text-neutral-500 border-neutral-200',
};

function ListView({
    board,
    onRowClick,
}: {
    board: ItemBoardColumn[];
    onRowClick: (id: string) => void;
}) {
    const nonEmpty = board.filter(col => col.items.length > 0);

    if (nonEmpty.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center text-sm text-neutral-400">
                No active items
            </div>
        );
    }

    return (
        <div className="flex-1 min-h-0 overflow-auto pb-6">
            <div className="space-y-5">
                {nonEmpty.map(col => (
                    <section key={col.stage.id}>
                        {/* Stage header */}
                        <div className="flex items-center gap-2 mb-2 sticky top-0 bg-[var(--background,white)] py-1 z-10">
                            <div
                                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: col.stage.color }}
                            />
                            <h3 className="text-xs font-semibold text-neutral-700 uppercase tracking-wider">
                                {col.stage.name}
                            </h3>
                            <span className="text-xs text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded font-medium">
                                {col.items.length}
                            </span>
                        </div>

                        {/* Table */}
                        <div className="border border-neutral-200 rounded-[var(--radius-sm)] overflow-hidden bg-white">
                            <table className="w-full text-sm">
                                <thead className="bg-neutral-50 text-[10px] uppercase tracking-wider text-neutral-500">
                                    <tr>
                                        <th className="text-left font-semibold px-3 py-2 w-32">Job · Item</th>
                                        <th className="text-left font-semibold px-3 py-2">Client</th>
                                        <th className="text-left font-semibold px-3 py-2">Description</th>
                                        <th className="text-left font-semibold px-3 py-2 w-24">Priority</th>
                                        <th className="text-left font-semibold px-3 py-2 w-28">Due</th>
                                        <th className="text-left font-semibold px-3 py-2 w-28">Progress</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {col.items.map((item, idx) => {
                                        const overdue = isJobOverdue(item.job.due_date);
                                        const routingLen = item.stage_routing.length;
                                        const currentIdx = routingLen > 0
                                            ? item.stage_routing.indexOf(item.current_stage_id ?? '')
                                            : -1;
                                        const progressPct = routingLen > 0 && currentIdx >= 0
                                            ? Math.round(((currentIdx + 1) / routingLen) * 100)
                                            : 0;
                                        return (
                                            <tr
                                                key={item.id}
                                                onClick={() => onRowClick(item.id)}
                                                className={`cursor-pointer hover:bg-neutral-50 transition-colors ${
                                                    idx !== 0 ? 'border-t border-neutral-100' : ''
                                                }`}
                                            >
                                                <td className="px-3 py-2.5">
                                                    <code className="text-[11px] font-mono text-[#4e7e8c] font-semibold">
                                                        {item.job.job_number}
                                                        {item.item_number ? ` · ${item.item_number}` : ''}
                                                    </code>
                                                </td>
                                                <td className="px-3 py-2.5 font-medium text-neutral-900 truncate max-w-[180px]">
                                                    {item.job.client_name}
                                                </td>
                                                <td className="px-3 py-2.5 text-neutral-600 truncate max-w-[320px]">
                                                    {item.description}
                                                </td>
                                                <td className="px-3 py-2.5">
                                                    <span
                                                        className={`inline-block text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${
                                                            PRIORITY_PILL[item.job.priority] ?? PRIORITY_PILL.normal
                                                        }`}
                                                    >
                                                        {item.job.priority}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2.5">
                                                    {item.job.due_date ? (
                                                        <span
                                                            className={`inline-flex items-center gap-1 text-xs ${
                                                                overdue
                                                                    ? 'text-red-600 font-semibold'
                                                                    : 'text-neutral-500'
                                                            }`}
                                                        >
                                                            {overdue && <AlertCircle size={12} />}
                                                            {formatDueDate(item.job.due_date)}
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-neutral-300">—</span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2.5">
                                                    {routingLen > 0 ? (
                                                        <div className="flex items-center gap-2">
                                                            <div className="flex-1 h-1.5 bg-neutral-100 rounded-full overflow-hidden min-w-[50px]">
                                                                <div
                                                                    className="h-full bg-[#4e7e8c] rounded-full transition-all"
                                                                    style={{ width: `${progressPct}%` }}
                                                                />
                                                            </div>
                                                            <span className="text-[10px] text-neutral-400 font-medium tabular-nums">
                                                                {currentIdx + 1}/{routingLen}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-[10px] text-neutral-300">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </section>
                ))}
            </div>
        </div>
    );
}
