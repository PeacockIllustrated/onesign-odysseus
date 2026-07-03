// Minimal inline icon set (stroke-based, matches lucide's feel) so the reel
// has no icon-font dependency during render.
import React from 'react';

type P = { size?: number; color?: string; strokeWidth?: number };

const base = (size: number, color: string, sw: number): React.SVGProps<SVGSVGElement> => ({
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: sw,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
});

export const Sun = ({ size = 20, color = '#fff', strokeWidth = 2 }: P) => (
    <svg {...base(size, color, strokeWidth)}>
        <circle cx="12" cy="12" r="4" />
        {Array.from({ length: 8 }).map((_, i) => {
            const a = (i * Math.PI) / 4;
            const x1 = 12 + Math.cos(a) * 7;
            const y1 = 12 + Math.sin(a) * 7;
            const x2 = 12 + Math.cos(a) * 9.5;
            const y2 = 12 + Math.sin(a) * 9.5;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
        })}
    </svg>
);

export const Moon = ({ size = 20, color = '#fff', strokeWidth = 2 }: P) => (
    <svg {...base(size, color, strokeWidth)}>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" fill={color} stroke="none" />
    </svg>
);

export const Check = ({ size = 20, color = '#fff', strokeWidth = 2.4 }: P) => (
    <svg {...base(size, color, strokeWidth)}>
        <path d="M20 6 9 17l-5-5" />
    </svg>
);

export const ArrowRight = ({ size = 20, color = '#fff', strokeWidth = 2.2 }: P) => (
    <svg {...base(size, color, strokeWidth)}>
        <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
);

export const Shield = ({ size = 20, color = '#fff', strokeWidth = 2 }: P) => (
    <svg {...base(size, color, strokeWidth)}>
        <path d="M12 3 5 6v5c0 4.5 3 8 7 9 4-1 7-4.5 7-9V6l-7-3Z" />
        <path d="m9 12 2 2 4-4" />
    </svg>
);

export const Sparkle = ({ size = 20, color = '#fff', strokeWidth = 2 }: P) => (
    <svg {...base(size, color, strokeWidth)}>
        <path d="M12 3v18M3 12h18" opacity={0} />
        <path
            d="M12 3c.6 3.9 2.1 5.4 6 6-3.9.6-5.4 2.1-6 6-.6-3.9-2.1-5.4-6-6 3.9-.6 5.4-2.1 6-6Z"
            fill={color}
            stroke="none"
        />
    </svg>
);

export const Send = ({ size = 20, color = '#fff', strokeWidth = 2 }: P) => (
    <svg {...base(size, color, strokeWidth)}>
        <path d="M22 2 11 13" />
        <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
    </svg>
);

export const Upload = ({ size = 20, color = '#fff', strokeWidth = 2 }: P) => (
    <svg {...base(size, color, strokeWidth)}>
        <path d="M12 16V4M7 9l5-5 5 5" />
        <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
);

export const HelpCircle = ({ size = 20, color = '#fff', strokeWidth = 2 }: P) => (
    <svg {...base(size, color, strokeWidth)}>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7M12 17h.01" />
    </svg>
);
