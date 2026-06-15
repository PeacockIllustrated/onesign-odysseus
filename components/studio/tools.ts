// components/studio/tools.ts
//
// The Studio tool registry — the single source of truth for every in-house
// design & fabrication tool, the phase of the signage journey it belongs to,
// and how it presents. The hub renders the whole journey from this; any future
// cross-tool wayfinding reads the same list, so the suite can never drift out
// of sync with itself.

import {
    BookMarked,
    Box,
    Globe,
    Hammer,
    ImageUp,
    Lightbulb,
    Palette,
    PenTool,
    Puzzle,
    Ruler,
    type LucideIcon,
} from 'lucide-react';

/** The stages a sign moves through, idea → installed. */
export type StudioPhase =
    | 'capture'
    | 'artwork'
    | 'design'
    | 'engineer'
    | 'present';

export interface StudioTool {
    id: string;
    name: string;
    href: string;
    icon: LucideIcon;
    phase: StudioPhase;
    /** Micro category tag. */
    tag: string;
    blurb: string;
    /** Pipeline / output chips. */
    meta: string[];
    /** Opens an unauth, customer-facing surface in a new tab. */
    external?: boolean;
    /** The hero of the suite — laid out larger. */
    flagship?: boolean;
    /** A sibling "concept / cinematic" surface, if the tool has one. */
    conceptHref?: string;
}

/** The journey, in order. Each phase narrates one step of making a sign. */
export const STUDIO_PHASES: {
    id: StudioPhase;
    label: string;
    lead: string;
}[] = [
    {
        id: 'capture',
        label: 'Capture',
        lead: 'Where a sign starts — a customer builds their own, or a brief lands in the inbox.',
    },
    {
        id: 'artwork',
        label: 'Artwork',
        lead: 'Turn a logo or lettering into clean, cuttable vectors.',
    },
    {
        id: 'design',
        label: 'Design',
        lead: 'Configure the sign in real-time 3D — by type and construction.',
    },
    {
        id: 'engineer',
        label: 'Engineer',
        lead: 'Lay the parts out for the shop floor.',
    },
    {
        id: 'present',
        label: 'Present',
        lead: 'Package the design for sign-off and hand it over.',
    },
];

export const STUDIO_TOOLS: StudioTool[] = [
    // ── Capture ──────────────────────────────────────────────────────────
    {
        id: 'public-studio',
        name: 'Public design studio',
        href: '/design',
        icon: Globe,
        phase: 'capture',
        tag: 'Public',
        blurb: 'The customer-facing visualiser — a lead-gen front door where clients build their own sign in 3D and send it in for a quote.',
        meta: ['Unauth', 'Lead-gen'],
        external: true,
    },
    {
        id: 'design-requests',
        name: 'Design requests',
        href: '/admin/design-requests',
        icon: PenTool,
        phase: 'capture',
        tag: 'Inbound',
        blurb: 'Signs customers built themselves and sent in. Triage the spec and promote it straight into the visualiser.',
        meta: ['Inbox', 'Realtime'],
    },
    // ── Artwork ──────────────────────────────────────────────────────────
    {
        id: 'vectorise',
        name: 'Image → SVG',
        href: '/admin/visualiser/vectorise',
        icon: ImageUp,
        phase: 'artwork',
        tag: 'Convert',
        blurb: 'Vectorise a PNG / JPG — a clean cut silhouette or a full-colour layered trace, with live threshold, colour and detail controls.',
        meta: ['Colour', 'Silhouette', 'SVG'],
    },
    {
        id: 'binder',
        name: 'Logo binder',
        href: '/admin/binder',
        icon: BookMarked,
        phase: 'artwork',
        tag: 'Library',
        blurb: 'Your shared library of client logos — saved from the converter and selectable at every upload point. Browse, rename, re-assign clients, delete.',
        meta: ['Logos', 'Per-client', 'Reusable'],
    },
    // ── Design ───────────────────────────────────────────────────────────
    {
        id: 'visualiser',
        name: 'Panel Visualiser',
        href: '/admin/visualiser',
        icon: Box,
        phase: 'design',
        tag: 'Flagship',
        blurb: 'Fold aluminium signs in real-time 3D — apertures, push-through, vinyl, stand-off, illumination and a projecting blade — then unfold to production-ready DXF + a dimensioned cut sheet.',
        meta: ['3D preview', 'Unfold', 'DXF / PDF'],
        flagship: true,
        conceptHref: '/admin/visualiser/preview',
    },
    {
        id: 'returns',
        name: 'Built-up returns',
        href: '/admin/visualiser/returns',
        icon: Hammer,
        phase: 'design',
        tag: 'Take-off',
        blurb: 'Letter return take-off: weld breaks at sharp corners + the stock length, a 3D built-up preview, a detailed cut sheet, and a one-file handoff to the nester.',
        meta: ['3D', 'Cut sheet', 'Nester'],
    },
    {
        id: 'neon',
        name: 'Neon length tool',
        href: '/admin/visualiser/neon',
        icon: Ruler,
        phase: 'design',
        tag: 'Neon',
        blurb: 'Measure every run of neon flex, size the transformers, and print an annotated run-length sheet with a glowing 3D preview.',
        meta: ['Measure', 'Glow', 'PDF'],
    },
    {
        id: 'led-layout',
        name: 'LED layout & wiring',
        href: '/admin/visualiser/led-layout',
        icon: Lightbulb,
        phase: 'design',
        tag: 'Illumination',
        blurb: 'Lay LED modules into illuminated letters or cabinets, chain them into runs, size the drivers from the rate card, and export a wiring drawing + power schedule.',
        meta: ['Modules', 'Drivers', 'Wiring PDF'],
    },
    // ── Engineer ─────────────────────────────────────────────────────────
    {
        id: 'nesting',
        name: 'Acrylic nesting',
        href: '/admin/nesting',
        icon: Puzzle,
        phase: 'engineer',
        tag: 'Nesting',
        blurb: 'Pack cut pieces onto configurable sheets with the bottom-left-fill engine — counters kept welded, off-cut suggestions, per-sheet SVG / DXF / summary.',
        meta: ['Pack', 'SVG / DXF', 'Off-cuts'],
    },
    // ── Present ──────────────────────────────────────────────────────────
    {
        id: 'design-packs',
        name: 'Design packs',
        href: '/admin/design-packs',
        icon: Palette,
        phase: 'present',
        tag: 'Packs',
        blurb: 'Build and present printable design packs — colour, typography, materials and live sign previews — then export the finished pack.',
        meta: ['Present', 'Export'],
    },
];

/** Tools belonging to a phase, in registry order. */
export function toolsForPhase(phase: StudioPhase): StudioTool[] {
    return STUDIO_TOOLS.filter((t) => t.phase === phase);
}
