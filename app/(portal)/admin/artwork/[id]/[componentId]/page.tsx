import { requireAdmin } from '@/lib/auth';
import { getComponentDetail, getArtworkJob } from '@/lib/artwork/actions';
import { getProductionStages } from '@/lib/production/queries';
import { notFound } from 'next/navigation';
import { Card, Chip } from '@/app/(portal)/components/ui';
import Link from 'next/link';
import { ChevronLeft, Printer } from 'lucide-react';
import {
    getComponentStatusLabel,
    getComponentStatusVariant,
    getComponentTypeLabel,
    formatDate,
} from '@/lib/artwork/utils';
import { ComponentStatus } from '@/lib/artwork/types';
import { VersionHistory } from './components/VersionHistory';
import { ComponentActions } from './components/ComponentActions';
import { SubItemList } from './components/SubItemList';
import { ComponentThumbnail } from './components/ComponentThumbnail';
import { StatusOverride } from './components/StatusOverride';
import { VariantsPanel } from './components/VariantsPanel';
import { createServerClient } from '@/lib/supabase-server';

export default async function ComponentDetailPage({
    params,
}: {
    params: Promise<{ id: string; componentId: string }>;
}) {
    await requireAdmin();

    const { id, componentId } = await params;
    const [component, job, stages] = await Promise.all([
        getComponentDetail(componentId),
        getArtworkJob(id),
        getProductionStages(),
    ]);

    if (!component || !job) {
        notFound();
    }

    // The artwork-assets bucket is private — public URLs 403 at the browser.
    // Sign every thumbnail_url we're about to render (component-level + every
    // sub-item's). One server client for both, bounded to one hour.
    const supabase = await createServerClient();

    const signAssetUrl = async (url: string | null): Promise<string | null> => {
        if (!url) return null;
        const parts = url.split('/artwork-assets/');
        if (parts.length <= 1) return null;
        const { data } = await supabase.storage
            .from('artwork-assets')
            .createSignedUrl(parts[1], 3600);
        return data?.signedUrl ?? null;
    };

    const thumbnailSignedUrl = await signAssetUrl(component.artwork_thumbnail_url);

    // Rewrite each sub-item's thumbnail_url to a signed URL so SubItemCard
    // (a client component) can drop it into <img> without extra round-trips.
    const subItemsForRender = await Promise.all(
        (component.sub_items ?? []).map(async (si) => ({
            ...si,
            thumbnail_url: await signAssetUrl(si.thumbnail_url ?? null),
        }))
    );

    const jobCompleted = job.status === 'completed';

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <Link
                href={`/admin/artwork/${id}`}
                className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-black mb-4 transition-colors"
            >
                <ChevronLeft size={16} />
                back to {job.job_name}
            </Link>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-6">
                <div className="min-w-0">
                    <ComponentActions
                        componentId={componentId}
                        jobId={id}
                        initialName={component.name}
                    />
                    <p className="text-sm text-neutral-500 mt-1">
                        {job.job_reference} — {getComponentTypeLabel(component.component_type)}
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {component.sub_items?.some((si) => si.design_signed_off_at) && (
                        <Link
                            href={`/admin/artwork/${id}/${componentId}/print`}
                            target="_blank"
                            className="btn-secondary inline-flex items-center gap-2"
                        >
                            <Printer size={16} />
                            print compliance sheet
                        </Link>
                    )}
                    <StatusOverride
                        componentId={component.id}
                        currentStatus={component.status as ComponentStatus}
                        disabled={jobCompleted}
                    />
                </div>
            </div>

            {/* Artwork preview — component-level thumbnail with upload controls */}
            <Card className="mb-6">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold text-neutral-900 uppercase tracking-wider">
                        artwork preview
                    </h2>
                    <p className="text-xs text-neutral-500">
                        component-level · sub-items can have their own below
                    </p>
                </div>
                <ComponentThumbnail
                    componentId={component.id}
                    currentUrl={thumbnailSignedUrl ?? component.artwork_thumbnail_url ?? null}
                    readOnly={jobCompleted}
                />
            </Card>

            {/* Sub-items — the spec-bearing cards (production jobs) or variants (visual approval jobs) */}
            {job.job_type === 'visual_approval' ? (
                <VariantsPanel
                    componentId={component.id}
                    variants={(component as any).variants ?? []}
                    readOnly={jobCompleted}
                />
            ) : (
                <Card className="mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-semibold text-neutral-900 uppercase tracking-wider">
                            sub-items
                        </h2>
                        <p className="text-xs text-neutral-500">
                            each sub-item has its own material, method, dimensions, and target department
                        </p>
                    </div>
                    <SubItemList
                        componentId={componentId}
                        subItems={subItemsForRender}
                        stages={stages}
                        jobCompleted={jobCompleted}
                    />
                </Card>
            )}

            {/* Version history — component-level artwork file versions */}
            {component.versions.length > 0 && (
                <Card className="mb-6">
                    <h2 className="text-sm font-semibold text-neutral-900 mb-4 uppercase tracking-wider">
                        version history
                    </h2>
                    <VersionHistory versions={component.versions} />
                </Card>
            )}

            {/* Production checks log (legacy per-component) */}
            {component.production_checks.length > 0 && (
                <Card>
                    <h2 className="text-sm font-semibold text-neutral-900 mb-4 uppercase tracking-wider">
                        production check log
                    </h2>
                    <div className="space-y-2">
                        {component.production_checks.map((check) => (
                            <div
                                key={check.id}
                                className="flex items-center justify-between text-xs py-1.5 border-b border-neutral-100 last:border-0"
                            >
                                <div className="flex items-center gap-2">
                                    <span className={check.passed ? 'text-green-600' : 'text-red-600'}>
                                        {check.passed ? 'PASS' : 'FAIL'}
                                    </span>
                                    <span className="text-neutral-600">
                                        {check.check_type.replace(/_/g, ' ')}
                                    </span>
                                </div>
                                <span className="text-neutral-400">
                                    {formatDate(check.created_at)}
                                </span>
                            </div>
                        ))}
                    </div>
                </Card>
            )}
        </div>
    );
}
