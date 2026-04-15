'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
    src: string;
    alt?: string;
    /** Tailwind / classname for the container box (controls width, height, border). */
    className?: string;
    /** Maximum zoom factor (default 5x). */
    maxZoom?: number;
    /** Called whenever the internal zoom factor changes. Parents can use this to
     *  hide overlays while the user is zooming in. */
    onZoomChange?: (zoom: number) => void;
}

/**
 * Hover-to-zoom image.
 *
 * - Mouse over the image → cursor becomes a zoom-in magnifier.
 * - Scroll wheel → zoom in/out around the cursor position.
 *   While the cursor is over the image, page scroll is blocked (wheel event
 *   is preventDefault'd) so the user doesn't accidentally scroll the page
 *   off the image while zooming.
 * - Moving the cursor pans the image so the pixel under the cursor stays
 *   under the cursor (transform-origin follows the pointer).
 * - On mouse-leave the image snaps back to 1× and the page scroll is handed
 *   back to the browser automatically (wheel is only swallowed while hovered).
 */
export function ZoomableImage({
    src,
    alt,
    className = '',
    maxZoom = 5,
    onZoomChange,
}: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const hoveredRef = useRef(false);
    const [zoom, setZoom] = useState(1);
    const [origin, setOrigin] = useState({ x: 50, y: 50 });

    // Notify parent (so overlays can be hidden when zoomed)
    useEffect(() => {
        onZoomChange?.(zoom);
    }, [zoom, onZoomChange]);

    // Non-passive wheel listener — React's synthetic onWheel is passive by
    // default in modern versions, so preventDefault() there is a no-op and
    // the page scrolls anyway. Attach the native listener ourselves.
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const handler = (e: WheelEvent) => {
            if (!hoveredRef.current) return;
            e.preventDefault();
            setZoom((prev) => {
                // Log-ish steps — higher zoom = faster scroll per tick so
                // the feel stays consistent across the whole range.
                const step = -e.deltaY * 0.01 * Math.max(prev, 1);
                return Math.max(1, Math.min(maxZoom, prev + step));
            });
        };
        el.addEventListener('wheel', handler, { passive: false });
        return () => el.removeEventListener('wheel', handler);
    }, [maxZoom]);

    const onMove = (e: React.MouseEvent) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        setOrigin({
            x: ((e.clientX - rect.left) / rect.width) * 100,
            y: ((e.clientY - rect.top) / rect.height) * 100,
        });
    };

    const onEnter = () => {
        hoveredRef.current = true;
    };

    const onLeave = () => {
        hoveredRef.current = false;
        setZoom(1);
        setOrigin({ x: 50, y: 50 });
    };

    return (
        <div
            ref={containerRef}
            onMouseEnter={onEnter}
            onMouseLeave={onLeave}
            onMouseMove={onMove}
            className={`${className} overflow-hidden`}
            style={{
                cursor: zoom > 1 ? 'zoom-out' : 'zoom-in',
                touchAction: 'none',
            }}
            data-zoom={zoom > 1 ? 'on' : 'off'}
        >
            <img
                src={src}
                alt={alt}
                draggable={false}
                className="w-full h-full object-contain select-none"
                style={{
                    transform: `scale(${zoom})`,
                    transformOrigin: `${origin.x}% ${origin.y}%`,
                    // Smooth only when snapping back to 1×; during active zoom
                    // we want the image to react immediately for a responsive feel.
                    transition: zoom === 1 ? 'transform 180ms ease-out' : 'none',
                    display: 'block',
                    userSelect: 'none',
                }}
            />
        </div>
    );
}
