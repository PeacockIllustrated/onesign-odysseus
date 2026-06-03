'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

interface Props {
    url: string | null;
    alt: string;
}

/**
 * Minimal tap-to-fullscreen viewer. Opens a fixed overlay showing the
 * artwork at the largest size the viewport allows. Pinch-zoom / double-tap
 * reset rely on the browser's native image zoom on tablets.
 */
export function ArtworkZoom({ url, alt }: Props) {
    const [open, setOpen] = useState(false);

    if (!url) {
        return (
            <div className="w-full aspect-[16/9] rounded-lg border-2 border-dashed border-neutral-300 bg-neutral-100 flex items-center justify-center text-neutral-500 italic text-sm">
                no artwork uploaded yet
            </div>
        );
    }

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="relative block w-full rounded-lg overflow-hidden border-2 border-neutral-200 bg-neutral-50 focus:outline-none focus:ring-4 focus:ring-[#4e7e8c]"
                aria-label="Zoom artwork"
            >
                <img src={url} alt={alt} className="w-full max-h-[55vh] object-contain" />
                <span className="absolute bottom-2 right-2 bg-black/70 text-white text-[11px] font-semibold px-2 py-1 rounded">
                    🔍 tap to zoom
                </span>
            </button>

            {open && (
                <div
                    className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
                    onClick={() => setOpen(false)}
                >
                    <button
                        type="button"
                        onClick={() => setOpen(false)}
                        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
                        aria-label="Close zoom"
                    >
                        <X size={22} />
                    </button>
                    <img
                        src={url}
                        alt={alt}
                        className="max-w-[95vw] max-h-[95vh] object-contain touch-pinch-zoom"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}
        </>
    );
}
