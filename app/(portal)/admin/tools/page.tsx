// app/(portal)/admin/tools/page.tsx
import Link from 'next/link';
import {
    ArrowRight,
    ArrowUpRight,
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
import { requireAdmin } from '@/lib/auth';

export const metadata = { title: 'Studio · Onesign Odysseus' };

interface Tool {
    name: string;
    blurb: string;
    href: string;
    icon: LucideIcon;
    /** Micro category tag. */
    tag: string;
    /** Pipeline / output chips. */
    meta: string[];
    /** Opens an unauth, customer-facing surface in a new tab. */
    external?: boolean;
}

const FLAGSHIP: Tool = {
    name: 'Panel Visualiser',
    blurb: 'Fold aluminium signs in real-time 3D — apertures, push-through, vinyl, stand-off, illumination and a projecting blade — then unfold to production-ready DXF + a dimensioned cut sheet.',
    href: '/admin/visualiser',
    icon: Box,
    tag: 'Visualiser',
    meta: ['3D preview', 'Unfold', 'DXF / PDF'],
};

const TOOLS: Tool[] = [
    {
        name: 'Built-up returns',
        blurb: 'Letter return take-off: weld breaks at sharp corners + the stock length, a 3D built-up preview, a detailed cut sheet, and a one-file handoff to the nester.',
        href: '/admin/visualiser/returns',
        icon: Hammer,
        tag: 'Take-off',
        meta: ['3D', 'Cut sheet', 'Nester'],
    },
    {
        name: 'Neon length tool',
        blurb: 'Measure every run of neon flex, size the transformers, and print an annotated run-length sheet with a glowing 3D preview.',
        href: '/admin/visualiser/neon',
        icon: Ruler,
        tag: 'Neon',
        meta: ['Measure', 'Glow', 'PDF'],
    },
    {
        name: 'Image → SVG',
        blurb: 'Vectorise a PNG / JPG — a clean cut silhouette or a full-colour layered trace, with live threshold, colour and detail controls. Download or drop into the visualiser.',
        href: '/admin/visualiser/vectorise',
        icon: ImageUp,
        tag: 'Convert',
        meta: ['Colour', 'Silhouette', 'SVG'],
    },
    {
        name: 'LED layout & wiring',
        blurb: 'Lay LED modules into illuminated letters or cabinets, chain them into runs, size the drivers from the rate card, and export a wiring drawing + power schedule.',
        href: '/admin/visualiser/led-layout',
        icon: Lightbulb,
        tag: 'Illumination',
        meta: ['Modules', 'Drivers', 'Wiring PDF'],
    },
    {
        name: 'Acrylic nesting',
        blurb: 'Pack cut pieces onto configurable sheets with the bottom-left-fill engine — counters kept welded, off-cut suggestions, per-sheet SVG / DXF / summary.',
        href: '/admin/nesting',
        icon: Puzzle,
        tag: 'Nesting',
        meta: ['Pack', 'SVG / DXF', 'Off-cuts'],
    },
    {
        name: 'Design packs',
        blurb: 'Build and present printable design packs — colour, typography, materials and live sign previews — then export the finished pack.',
        href: '/admin/design-packs',
        icon: Palette,
        tag: 'Packs',
        meta: ['Present', 'Export'],
    },
    {
        name: 'Design requests',
        blurb: 'Inbound signs customers built themselves in the public studio and sent in. Triage the spec and promote it straight into the visualiser.',
        href: '/admin/design-requests',
        icon: PenTool,
        tag: 'Inbound',
        meta: ['Inbox', 'Realtime'],
    },
    {
        name: 'Logo binder',
        blurb: 'Your shared library of client logos — saved from the converter and selectable at every upload point. Browse, rename, re-assign clients, delete.',
        href: '/admin/binder',
        icon: BookMarked,
        tag: 'Library',
        meta: ['Logos', 'Per-client', 'Reusable'],
    },
    {
        name: 'Public design studio',
        blurb: 'The customer-facing visualiser — a lead-gen front door where clients build their own sign in 3D and send it to us for a quote.',
        href: '/design',
        icon: Globe,
        tag: 'Public',
        meta: ['Unauth', 'Lead-gen'],
        external: true,
    },
];

export default async function ToolsPage() {
    await requireAdmin();

    return (
        <div className="mx-auto max-w-6xl pb-16">
            {/* Hero */}
            <section className="pt-2">
                <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#4e7e8c]">
                    <span className="h-px w-7 bg-[#4e7e8c]" />
                    Onesign · Odysseus
                </p>
                <h1 className="mt-3 text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">
                    The Studio
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-500">
                    Our in-house design &amp; fabrication tools — everything for
                    turning a sign from idea into a production-ready cut file, in
                    one place.
                </p>
            </section>

            {/* Flagship */}
            <FlagshipCard tool={FLAGSHIP} index={1} />

            {/* Tool portfolio */}
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {TOOLS.map((tool, i) => (
                    <ToolCard key={tool.href} tool={tool} index={i + 2} />
                ))}
            </div>

            {/* Footer note */}
            <p className="mt-8 text-center text-xs text-neutral-400">
                Built in-house at Onesign &amp; Digital · Team Valley, Gateshead
            </p>
        </div>
    );
}

function num(index: number): string {
    return String(index).padStart(2, '0');
}

function FlagshipCard({ tool, index }: { tool: Tool; index: number }) {
    const Icon = tool.icon;
    return (
        <Link
            href={tool.href}
            className="group relative mt-8 block overflow-hidden rounded-xl border border-neutral-200 bg-white transition-all duration-200 hover:-translate-y-0.5 hover:border-[#4e7e8c]/60 hover:shadow-[0_10px_40px_-12px_rgba(58,95,106,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4e7e8c]"
        >
            {/* Top accent line that draws in on hover */}
            <span className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-gradient-to-r from-[#4e7e8c] to-[#3a5f6a] transition-transform duration-300 group-hover:scale-x-100" />

            <div className="grid items-stretch gap-0 md:grid-cols-[1.4fr_1fr]">
                {/* Copy */}
                <div className="p-6 sm:p-8">
                    <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#e8f0f3] text-[#3a5f6a] transition-colors group-hover:bg-[#4e7e8c] group-hover:text-white">
                            <Icon size={20} />
                        </span>
                        <span className="rounded-full border border-[#cfe0e6] bg-[#e8f0f3] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#3a5f6a]">
                            Flagship · {tool.tag}
                        </span>
                    </div>
                    <h2 className="mt-5 text-2xl font-bold tracking-tight text-neutral-900">
                        {tool.name}
                    </h2>
                    <p className="mt-2 max-w-md text-sm leading-relaxed text-neutral-500">
                        {tool.blurb}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-1.5">
                        {tool.meta.map((m) => (
                            <span
                                key={m}
                                className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600"
                            >
                                {m}
                            </span>
                        ))}
                    </div>
                    <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-[#3a5f6a]">
                        Open visualiser
                        <ArrowRight
                            size={16}
                            className="transition-transform duration-200 group-hover:translate-x-1"
                        />
                    </span>
                </div>

                {/* Decorative iso-panel motif */}
                <div className="relative hidden min-h-[200px] overflow-hidden bg-gradient-to-br from-[#eef4f6] to-[#dde9ed] md:block">
                    <span className="absolute right-6 top-5 text-6xl font-bold tabular-nums text-[#4e7e8c]/15">
                        {num(index)}
                    </span>
                    <IsoPanel />
                </div>
            </div>
        </Link>
    );
}

function ToolCard({ tool, index }: { tool: Tool; index: number }) {
    const Icon = tool.icon;
    return (
        <Link
            href={tool.href}
            target={tool.external ? '_blank' : undefined}
            rel={tool.external ? 'noopener noreferrer' : undefined}
            className="group relative flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#4e7e8c]/60 hover:shadow-[0_10px_30px_-14px_rgba(58,95,106,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4e7e8c]"
        >
            <span className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-gradient-to-r from-[#4e7e8c] to-[#3a5f6a] transition-transform duration-300 group-hover:scale-x-100" />

            <div className="flex items-start justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8f0f3] text-[#3a5f6a] transition-colors group-hover:bg-[#4e7e8c] group-hover:text-white">
                    <Icon size={18} />
                </span>
                <span className="text-2xl font-bold tabular-nums text-neutral-200 transition-colors group-hover:text-[#4e7e8c]/40">
                    {num(index)}
                </span>
            </div>

            <h3 className="mt-4 flex items-center gap-1.5 text-base font-bold tracking-tight text-neutral-900">
                {tool.name}
                {tool.external && (
                    <ArrowUpRight size={14} className="text-neutral-400" />
                )}
            </h3>
            <p className="mt-1.5 flex-1 text-xs leading-relaxed text-neutral-500">
                {tool.blurb}
            </p>

            <div className="mt-3 flex items-center justify-between">
                <div className="flex flex-wrap gap-1">
                    {tool.meta.map((m) => (
                        <span
                            key={m}
                            className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400"
                        >
                            {m}
                        </span>
                    ))}
                </div>
                <ArrowRight
                    size={15}
                    className="shrink-0 text-[#4e7e8c] opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100"
                />
            </div>
        </Link>
    );
}

/** Line-art folded panel with an aperture — quiet brand motif for the hero. */
function IsoPanel() {
    return (
        <svg
            viewBox="0 0 240 200"
            className="absolute inset-0 h-full w-full"
            fill="none"
            stroke="#4e7e8c"
            strokeLinejoin="round"
            strokeLinecap="round"
            aria-hidden="true"
        >
            <g opacity="0.5" strokeWidth="1.5">
                {/* Face */}
                <path d="M70 64 L182 44 L196 120 L84 140 Z" />
                {/* Top return (fold) */}
                <path d="M70 64 L96 40 L208 20 L182 44 Z" opacity="0.7" />
                {/* Right return (fold) */}
                <path d="M182 44 L208 20 L222 96 L196 120 Z" opacity="0.7" />
                {/* Aperture cut */}
                <path
                    d="M104 78 L150 70 L156 104 L110 112 Z"
                    opacity="0.9"
                    strokeDasharray="4 4"
                />
            </g>
        </svg>
    );
}
