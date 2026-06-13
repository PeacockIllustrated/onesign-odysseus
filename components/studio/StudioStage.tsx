// components/studio/StudioStage.tsx
//
// The cinematic stage — a full-bleed dark canvas with a soft accent halo, the
// shared backdrop for every immersive Studio surface (the hub, the visualiser
// concept, future tool stages). Server-safe (no hooks) so it can wrap content
// in both server and client components.
import type { ReactNode } from 'react';
import { STUDIO, stageBackground } from './tokens';

export function StudioStage({
    night = false,
    className = '',
    children,
}: {
    /** Deep near-black backdrop so illumination can glow. */
    night?: boolean;
    className?: string;
    children: ReactNode;
}) {
    return (
        <div
            className={`relative overflow-hidden rounded-3xl border border-white/10 shadow-2xl ${className}`}
            style={{
                background: stageBackground(night),
                transition: 'background 0.7s ease',
            }}
        >
            {/* Soft accent halo for depth — muted at night. */}
            <div
                aria-hidden
                className="pointer-events-none absolute -top-1/3 left-1/2 h-[60%] w-[80%] -translate-x-1/2 rounded-full blur-3xl"
                style={{
                    background: STUDIO.accentGlow,
                    opacity: night ? 0.05 : 0.1,
                    transition: 'opacity 0.7s ease',
                }}
            />
            {children}
        </div>
    );
}
