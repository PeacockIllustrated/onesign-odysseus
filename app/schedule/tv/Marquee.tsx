'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/**
 * A horizontal band whose contents drift past when there are more of them than
 * fit.
 *
 * The holding lists have no natural length — "to be scheduled" is however much
 * work is waiting — but on a wall the band they sit in is a fixed slice of the
 * screen. Previously the overflow was simply clipped with a scrollbar nobody
 * can reach, so anything past the first row or two was invisible. Here the row
 * moves instead, so the whole list comes round.
 *
 * When the content already fits, nothing animates and nothing is duplicated —
 * a short list sits still, which is what you want most days.
 */
export function Marquee({
    children,
    /** Pixels per second. Slow enough to read a card as it passes. */
    speed = 28,
    /** Blank space between the end of the list and its repeat. */
    gapPx = 32,
}: {
    children: ReactNode;
    speed?: number;
    gapPx?: number;
}) {
    const viewportRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const [overflowing, setOverflowing] = useState(false);
    const [duration, setDuration] = useState(0);

    useEffect(() => {
        const viewport = viewportRef.current;
        const content = contentRef.current;
        if (!viewport || !content) return;

        let frame = 0;
        const measure = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const room = viewport.clientWidth;
                const needed = content.scrollWidth;
                if (room <= 0 || needed <= 0) return;

                const over = needed > room + 1;
                setOverflowing(over);
                // One full pass travels the content plus the gap before the
                // duplicate lands exactly where the original started, so a
                // constant px/sec keeps a long list moving at the same
                // readable pace as a short one.
                setDuration(over ? (needed + gapPx) / speed : 0);
            });
        };

        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(viewport);
        ro.observe(content);
        return () => {
            cancelAnimationFrame(frame);
            ro.disconnect();
        };
    }, [speed, gapPx, children]);

    return (
        <div className="tvb-marquee" ref={viewportRef} data-moving={overflowing}>
            <div
                className="tvb-marquee-track"
                style={
                    overflowing
                        ? ({
                              animationDuration: `${duration}s`,
                              gap: `${gapPx}px`,
                              // Read by the keyframe: the track is two runs plus
                              // one gap, so a full cycle is half the track plus
                              // half the gap.
                              ['--tvb-gap']: `${gapPx}px`,
                          } as CSSProperties)
                        : undefined
                }
            >
                <div className="tvb-marquee-run" ref={contentRef}>
                    {children}
                </div>
                {/* The repeat is what makes the loop seamless: by the time the
                    first copy has left, the second is in its place. Hidden from
                    assistive tech so the list isn't announced twice. */}
                {overflowing && (
                    <div className="tvb-marquee-run" aria-hidden>
                        {children}
                    </div>
                )}
            </div>
        </div>
    );
}
