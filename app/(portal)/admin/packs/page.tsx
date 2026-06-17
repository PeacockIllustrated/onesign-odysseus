import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-admin';
import Link from 'next/link';
import { StudioPageHeader } from '@/app/(portal)/components/StudioPageHeader';
import { Package, Palette, BadgeCheck, ArrowRight, type LucideIcon } from 'lucide-react';

/**
 * Packs hub — one front door for every client-facing & works document tool.
 * Pure navigation: it links out to the existing builders, it does not touch
 * any of their logic (and the client sign-off flow is untouched).
 */
export default async function PacksHubPage() {
    await requireAdmin();
    const supabase = createAdminClient();

    const [prod, design, visual] = await Promise.all([
        supabase.from('production_packs').select('id', { count: 'exact', head: true }),
        supabase.from('design_packs').select('id', { count: 'exact', head: true }),
        supabase
            .from('artwork_jobs')
            .select('id', { count: 'exact', head: true })
            .eq('job_type', 'visual_approval'),
    ]);

    const cards: Array<{
        href: string; icon: LucideIcon; title: string; blurb: string; count: number; noun: string;
    }> = [
        {
            href: '/admin/production-packs',
            icon: Package,
            title: 'Production packs',
            blurb: 'Block-based, on-brand signage works packs — modular, repeatable, print-ready.',
            count: prod.count ?? 0,
            noun: 'pack',
        },
        {
            href: '/admin/design-packs',
            icon: Palette,
            title: 'Design packs',
            blurb: 'Interactive design-presentation decks for client sessions — type, colour, materials.',
            count: design.count ?? 0,
            noun: 'pack',
        },
        {
            href: '/admin/artwork?type=visual_approval',
            icon: BadgeCheck,
            title: 'Visual approval packs',
            blurb: 'Client sign-off packs — design options sent for approval via a secure link.',
            count: visual.count ?? 0,
            noun: 'job',
        },
    ];

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <StudioPageHeader
                eyebrow="Studio"
                title="packs"
                description="every client-facing & works document, in one place"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {cards.map((c) => {
                    const Icon = c.icon;
                    return (
                        <Link
                            key={c.href}
                            href={c.href}
                            className="group relative overflow-hidden rounded-2xl border border-neutral-200 bg-white p-5 transition-all hover:border-[#9ed0dc] hover:shadow-md"
                        >
                            <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#9ed0dc] to-[#4e7e8c] opacity-0 transition-opacity group-hover:opacity-100" />
                            <div className="flex items-start justify-between">
                                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#e8f0f3] text-[#4e7e8c]">
                                    <Icon size={20} />
                                </div>
                                <span className="text-2xl font-bold tabular-nums text-[#10242b]">{c.count}</span>
                            </div>
                            <h2 className="mt-4 text-base font-bold text-[#10242b]">{c.title}</h2>
                            <p className="mt-1 text-sm leading-relaxed text-neutral-500">{c.blurb}</p>
                            <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#4e7e8c]">
                                {c.count} {c.noun}{c.count === 1 ? '' : 's'}
                                <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                            </span>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
