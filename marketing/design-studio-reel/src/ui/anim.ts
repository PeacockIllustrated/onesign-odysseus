import { Easing, interpolate, spring } from 'remotion';
import { EASE, FPS } from '../theme';

type Bez = [number, number, number, number];

export const bez = (e: Bez) => Easing.bezier(e[0], e[1], e[2], e[3]);

/** 0→1 ramp between two frames with an easing curve (clamped). */
export function ramp(
    frame: number,
    from: number,
    to: number,
    easing: Bez = EASE.out,
): number {
    return interpolate(frame, [from, to], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: bez(easing),
    });
}

/** Fade + slide-up entrance. Returns style props to spread onto an element. */
export function enter(
    frame: number,
    at: number,
    dur = 14,
    dist = 26,
): { opacity: number; transform: string } {
    const t = ramp(frame, at, at + dur, EASE.out);
    return {
        opacity: t,
        transform: `translateY(${(1 - t) * dist}px)`,
    };
}

/** Symmetric fade-in / hold / fade-out window. */
export function windowOpacity(
    frame: number,
    inAt: number,
    outAt: number,
    fade = 12,
): number {
    return interpolate(
        frame,
        [inAt, inAt + fade, outAt - fade, outAt],
        [0, 1, 1, 0],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
    );
}

/** A gentle overshoot spring value 0→1. */
export function pop(
    frame: number,
    fps: number,
    at: number,
    damping = 12,
): number {
    return spring({
        frame: frame - at,
        fps,
        config: { damping, mass: 0.7, stiffness: 140 },
    });
}

/** Count from a→b over a frame window, rounded. Good for live spec numbers. */
export function countTo(
    frame: number,
    from: number,
    to: number,
    startF: number,
    endF: number,
    easing: Bez = EASE.inOut,
): number {
    const t = ramp(frame, startF, endF, easing);
    return Math.round(from + (to - from) * t);
}

export const secs = (s: number) => Math.round(s * FPS);
