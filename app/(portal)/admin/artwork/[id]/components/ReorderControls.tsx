'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { moveComponent } from '@/lib/artwork/actions';

interface Props {
    componentId: string;
    isFirst: boolean;
    isLast: boolean;
}

/**
 * Up / down arrow pair for reordering a component on the main artwork job
 * page. Stops click propagation so the parent <Link> row doesn't navigate
 * into the component detail when the user is just shuffling order.
 */
export function ReorderControls({ componentId, isFirst, isLast }: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();

    const move = (direction: 'up' | 'down') => (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        startTransition(async () => {
            const res = await moveComponent(componentId, direction);
            if ('ok' in res) router.refresh();
        });
    };

    const btn =
        'w-6 h-6 rounded flex items-center justify-center text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors';

    return (
        <div
            className="flex flex-col items-center"
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
            }}
        >
            <button
                type="button"
                onClick={move('up')}
                disabled={isFirst || pending}
                className={btn}
                aria-label="move up"
                title="move up"
            >
                <ChevronUp size={14} />
            </button>
            <button
                type="button"
                onClick={move('down')}
                disabled={isLast || pending}
                className={btn}
                aria-label="move down"
                title="move down"
            >
                <ChevronDown size={14} />
            </button>
        </div>
    );
}
