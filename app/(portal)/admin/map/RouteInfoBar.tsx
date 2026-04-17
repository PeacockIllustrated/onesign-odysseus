'use client';

import { X } from 'lucide-react';
import { formatDuration, formatDistance, TRAFFIC_COLOURS } from '@/lib/mapbox/utils';
import type { ActiveRoute } from './RouteLayer';

interface Props {
    routes: ActiveRoute[];
    onRemove: (id: string) => void;
    onClearAll: () => void;
}

export function RouteInfoBar({ routes, onRemove, onClearAll }: Props) {
    if (routes.length === 0) return null;

    return (
        <div className="mb-3 space-y-1">
            {routes.map((r) => (
                <div
                    key={r.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded border bg-white text-sm"
                    style={{ borderColor: r.colour, borderLeftWidth: 4 }}
                >
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <span className="font-semibold text-neutral-900 truncate">{r.siteName}</span>
                        <span className="text-neutral-400">·</span>
                        <span className="text-neutral-700">{formatDistance(r.distance)}</span>
                        <span className="text-neutral-400">·</span>
                        <span className="text-neutral-700">{formatDuration(r.duration)}</span>
                        <span
                            className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full text-white shrink-0"
                            style={{ background: TRAFFIC_COLOURS[r.trafficStatus] }}
                        >
                            {r.trafficStatus}
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={() => onRemove(r.id)}
                        className="text-neutral-400 hover:text-neutral-700 shrink-0"
                        aria-label={`Remove route to ${r.siteName}`}
                    >
                        <X size={14} />
                    </button>
                </div>
            ))}
            {routes.length > 1 && (
                <button
                    type="button"
                    onClick={onClearAll}
                    className="text-xs text-red-600 hover:underline"
                >
                    clear all routes
                </button>
            )}
        </div>
    );
}
