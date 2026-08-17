'use client';

import { useDroppable } from '@dnd-kit/core';
import type { ReactNode } from 'react';
import type { Lane, Slot } from '@/lib/schedule/types';

/**
 * What a drop means. Encoded into the droppable id so `handleDragEnd` can act
 * without a lookup table, and decoded back by `parseDropTarget`.
 */
export type DropTarget =
    /** `slot` omitted means "keep whatever slot the job already had" — the
        month view moves a card between days and vans without touching AM/PM. */
    | { kind: 'cell'; date: string; vanId: string; slot?: Slot }
    | { kind: 'holding'; lane: Lane };

export function dropTargetId(t: DropTarget): string {
    return t.kind === 'cell'
        ? `cell|${t.date}|${t.vanId}|${t.slot ?? ''}`
        : `holding|${t.lane}`;
}

export function parseDropTarget(id: string): DropTarget | null {
    const parts = id.split('|');
    if (parts[0] === 'cell' && parts.length === 4) {
        return {
            kind: 'cell',
            date: parts[1],
            vanId: parts[2],
            slot: parts[3] ? (parts[3] as Slot) : undefined,
        };
    }
    if (parts[0] === 'holding' && parts.length === 2) {
        return { kind: 'holding', lane: parts[1] as Lane };
    }
    return null;
}

interface Props {
    target: DropTarget;
    className?: string;
    children?: ReactNode;
}

export function DropZone({ target, className = '', children }: Props) {
    const id = dropTargetId(target);
    const { setNodeRef, isOver } = useDroppable({ id });
    return (
        <div ref={setNodeRef} className={`sb-drop ${className} ${isOver ? 'over' : ''}`}>
            {children}
        </div>
    );
}
