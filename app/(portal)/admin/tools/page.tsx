// app/(portal)/admin/tools/page.tsx
//
// Onesign Studio — the connective home for every in-house design & fabrication
// tool, laid out as one fully-realised signage journey: Capture → Artwork →
// Design → Engineer → Present. Cinematic, editorial, motion-led — the shared
// award-worthy language defined in components/studio, rendered from the single
// tool registry so the hub can never drift from the tools themselves.
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Sparkles } from 'lucide-react';
import { requireAdmin } from '@/lib/auth';
import { StudioStage } from '@/components/studio/StudioStage';
import { STUDIO } from '@/components/studio/tokens';
import {
    STUDIO_PHASES,
    STUDIO_TOOLS,
    toolsForPhase,
    type StudioTool,
} from '@/components/studio/tools';

export const metadata = { title: 'Studio · Onesign Odysseus' };

function num(index: number): string {
    return String(index).padStart(2, '0');
}

export default async function ToolsPage() {
    await requireAdmin();

    return (
        <div className="pb-8">
            <StudioStage className="px-5 py-9 sm:px-8 sm:py-12 md:px-12">
                {/* Entrance motion — one shared keyframe, disabled under
                    prefers-reduced-motion. */}
                <style>{`
.studio-in{animation:studioIn .6s cubic-bezier(.22,.61,.36,1) both}
@keyframes studioIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.studio-in{animation:none}}
                `}</style>

                <div className="relative mx-auto max-w-6xl">
                    {/* ── Hero ──────────────────────────────────────────── */}
                    <header className="studio-in">
                        <p className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#9ed0dc]">
                            <span className="h-px w-8 bg-[#9ed0dc]/70" />
                            Onesign · Studio
                        </p>
                        <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-5xl">
                            Every sign, from idea
                            <br className="hidden sm:block" /> to cut file.
                        </h1>
                        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/55">
                            One studio for the whole of signage — capture a
                            brief, prep the artwork, design it in real-time 3D,
                            engineer it for the shop floor and present it for
                            sign-off.
                        </p>
                        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] font-medium uppercase tracking-wide text-white/40">
                            <span className="tabular-nums">
                                {STUDIO_TOOLS.length} tools
                            </span>
                            <span className="h-3 w-px bg-white/15" />
                            <span>Real-time 3D</span>
                            <span className="h-3 w-px bg-white/15" />
                            <span>Production-ready</span>
                        </div>
                    </header>

                    {/* ── The journey ───────────────────────────────────── */}
                    <div className="mt-12 space-y-12 md:mt-16 md:space-y-16">
                        {STUDIO_PHASES.map((phase, pi) => {
                            const tools = toolsForPhase(phase.id);
                            if (tools.length === 0) return null;
                            return (
                                <section
                                    key={phase.id}
                                    className="grid gap-x-8 gap-y-5 md:grid-cols-[210px_1fr]"
                                >
                                    {/* Phase marker — the numbers run down the
                                        page as a quiet spine. */}
                                    <div className="studio-in self-start md:sticky md:top-6">
                                        <div className="flex items-baseline gap-3">
                                            <span className="text-3xl font-semibold tabular-nums text-[#9ed0dc]/35">
                                                {num(pi + 1)}
                                            </span>
                                            <h2 className="text-lg font-semibold tracking-tight text-white">
                                                {phase.label}
                                            </h2>
                                        </div>
                                        <p className="mt-2 max-w-[15rem] text-[12.5px] leading-relaxed text-white/45">
                                            {phase.lead}
                                        </p>
                                    </div>

                                    {/* Tool cards for this phase. */}
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        {tools.map((tool) => {
                                            // Stagger by the tool's place in the
                                            // overall journey (registry order),
                                            // so cards ease in down the page.
                                            const delay =
                                                STUDIO_TOOLS.findIndex(
                                                    (t) => t.id === tool.id,
                                                ) * 55;
                                            return tool.flagship ? (
                                                <FlagshipCard
                                                    key={tool.id}
                                                    tool={tool}
                                                    delay={delay}
                                                />
                                            ) : (
                                                <ToolCard
                                                    key={tool.id}
                                                    tool={tool}
                                                    delay={delay}
                                                />
                                            );
                                        })}
                                    </div>
                                </section>
                            );
                        })}
                    </div>

                    {/* ── Footer ────────────────────────────────────────── */}
                    <p className="mt-14 border-t border-white/10 pt-6 text-center text-[11px] tracking-wide text-white/35">
                        Built in-house at Onesign &amp; Digital · Team Valley,
                        Gateshead
                    </p>
                </div>
            </StudioStage>
        </div>
    );
}

/** A dark-glass tool card with a hover lift + drawn-in accent line. */
function ToolCard({ tool, delay }: { tool: StudioTool; delay: number }) {
    const Icon = tool.icon;
    return (
        <Link
            href={tool.href}
            target={tool.external ? '_blank' : undefined}
            rel={tool.external ? 'noopener noreferrer' : undefined}
            style={{ animationDelay: `${delay}ms` }}
            className="studio-in group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9ed0dc]/70"
        >
            <span className="absolute inset-x-0 top-0 h-px origin-left scale-x-0 bg-gradient-to-r from-[#4e7e8c] to-[#9ed0dc] transition-transform duration-300 group-hover:scale-x-100" />

            <div className="flex items-start justify-between gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-[#9ed0dc] transition-colors group-hover:bg-[#9ed0dc] group-hover:text-[#0c1114]">
                    <Icon size={18} />
                </span>
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/45">
                    {tool.tag}
                </span>
            </div>

            <h3 className="mt-4 flex items-center gap-1.5 text-[15px] font-semibold tracking-tight text-white">
                {tool.name}
                {tool.external && (
                    <ArrowUpRight size={14} className="text-white/40" />
                )}
            </h3>
            <p className="mt-1.5 flex-1 text-[12.5px] leading-relaxed text-white/50">
                {tool.blurb}
            </p>

            <div className="mt-4 flex items-center justify-between">
                <div className="flex flex-wrap gap-x-2.5 gap-y-1">
                    {tool.meta.map((m) => (
                        <span
                            key={m}
                            className="text-[10px] font-semibold uppercase tracking-wide text-white/35"
                        >
                            {m}
                        </span>
                    ))}
                </div>
                <ArrowRight
                    size={15}
                    className="shrink-0 text-[#9ed0dc] opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100"
                />
            </div>
        </Link>
    );
}

/** The flagship — a wider card spanning both columns, with a sibling link to
 *  its cinematic concept. Not a wrapping anchor (it holds two links), so the
 *  whole tile is a div with explicit actions. */
function FlagshipCard({ tool, delay }: { tool: StudioTool; delay: number }) {
    const Icon = tool.icon;
    return (
        <div
            style={{ animationDelay: `${delay}ms` }}
            className="studio-in group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045] backdrop-blur-sm transition-colors hover:border-white/25 sm:col-span-2"
        >
            <span className="absolute inset-x-0 top-0 h-px origin-left scale-x-0 bg-gradient-to-r from-[#4e7e8c] to-[#9ed0dc] transition-transform duration-300 group-hover:scale-x-100" />
            <div className="grid items-stretch md:grid-cols-[1.5fr_1fr]">
                <div className="p-6 sm:p-7">
                    <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#9ed0dc] text-[#0c1114]">
                            <Icon size={20} />
                        </span>
                        <span className="rounded-full border border-[#9ed0dc]/25 bg-[#9ed0dc]/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#9ed0dc]">
                            Flagship · {tool.tag}
                        </span>
                    </div>
                    <h3 className="mt-5 text-2xl font-semibold tracking-tight text-white">
                        {tool.name}
                    </h3>
                    <p className="mt-2 max-w-md text-[13px] leading-relaxed text-white/55">
                        {tool.blurb}
                    </p>
                    <div className="mt-5 flex flex-wrap items-center gap-3">
                        <Link
                            href={tool.href}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#9ed0dc] px-4 py-2 text-[13px] font-semibold text-[#0c1114] transition-transform hover:translate-x-0.5"
                        >
                            Open visualiser
                            <ArrowRight size={15} />
                        </Link>
                        {tool.conceptHref && (
                            <Link
                                href={tool.conceptHref}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3.5 py-2 text-[13px] font-medium text-white/80 transition-colors hover:border-white/35 hover:text-white"
                            >
                                <Sparkles size={14} />
                                Concept
                            </Link>
                        )}
                    </div>
                </div>

                {/* Quiet line-art folded-panel motif. */}
                <div className="relative hidden min-h-[210px] overflow-hidden border-l border-white/5 md:block">
                    <span className="absolute right-6 top-5 text-6xl font-semibold tabular-nums text-white/5">
                        ★
                    </span>
                    <IsoPanel />
                </div>
            </div>
        </div>
    );
}

/** Line-art folded panel with an aperture — the quiet brand motif. */
function IsoPanel() {
    return (
        <svg
            viewBox="0 0 240 210"
            className="absolute inset-0 h-full w-full"
            fill="none"
            stroke={STUDIO.accentGlow}
            strokeLinejoin="round"
            strokeLinecap="round"
            aria-hidden="true"
        >
            <g opacity="0.45" strokeWidth="1.4">
                <path d="M70 74 L182 54 L196 130 L84 150 Z" />
                <path d="M70 74 L96 50 L208 30 L182 54 Z" opacity="0.7" />
                <path d="M182 54 L208 30 L222 106 L196 130 Z" opacity="0.7" />
                <path
                    d="M104 88 L150 80 L156 114 L110 122 Z"
                    opacity="0.9"
                    strokeDasharray="4 4"
                />
            </g>
        </svg>
    );
}
