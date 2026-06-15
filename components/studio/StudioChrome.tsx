'use client';

// components/studio/StudioChrome.tsx
//
// The interactive bits of the Studio kit — anything that needs client state.
// Kept apart from the server-safe StudioStage so a server component (the hub)
// doesn't pull a client boundary it doesn't need.

import { Moon, Sun } from 'lucide-react';

/**
 * The marquee interaction: a tactile day / night switch. Sliding the knob to
 * the moon darkens the stage and lights any configured illumination — the
 * "wow" beat for an illuminated-signage product. Shared by the visualiser
 * concept and any future lit-preview surface.
 */
export function DayNightSwitch({
    night,
    onChange,
}: {
    night: boolean;
    onChange: (v: boolean) => void;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={night}
            aria-label="Toggle day / night preview"
            onClick={() => onChange(!night)}
            title="Day / night preview"
            className="relative flex h-10 w-[5.5rem] items-center rounded-full border border-white/25 bg-[#0c1114]/60 px-1 shadow-lg backdrop-blur-md transition-colors hover:border-white/45"
        >
            <Sun
                size={15}
                aria-hidden
                className={`absolute left-2.5 transition-opacity ${
                    night ? 'text-white/60 opacity-70' : 'text-amber-300 opacity-100'
                }`}
            />
            <Moon
                size={14}
                aria-hidden
                className={`absolute right-2.5 transition-opacity ${
                    night ? 'text-sky-200 opacity-100' : 'text-white/60 opacity-70'
                }`}
            />
            <span
                className="z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-md transition-transform duration-300 ease-out"
                style={{ transform: night ? 'translateX(46px)' : 'translateX(0)' }}
            >
                {night ? (
                    <Moon size={14} aria-hidden className="text-[#1a1f23]" />
                ) : (
                    <Sun size={15} aria-hidden className="text-amber-500" />
                )}
            </span>
        </button>
    );
}
