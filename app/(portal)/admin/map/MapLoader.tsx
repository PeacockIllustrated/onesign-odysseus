'use client';

import dynamic from 'next/dynamic';
import type { SitePin } from './page';

const MapClient = dynamic(() => import('./MapClient').then((m) => m.MapClient), {
    ssr: false,
    loading: () => (
        <div className="h-[600px] bg-neutral-100 animate-pulse rounded-lg flex items-center justify-center text-neutral-400 text-sm">
            Loading map…
        </div>
    ),
});

interface Props {
    pins: SitePin[];
}

export function MapLoader({ pins }: Props) {
    return <MapClient pins={pins} />;
}
