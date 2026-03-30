import { requireAdmin } from '@/lib/auth';
import { getComponentDetail, getArtworkJob } from '@/lib/artwork/actions';
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
import { DesignSection } from './components/DesignSection';
import { ProductionSection } from './components/ProductionSection';
import { VersionHistory } from './components/VersionHistory';
import { DimensionAlert } from './components/DimensionAlert';
import { ComponentActions } from './components/ComponentActions';
import { createServerClient } from '@/lib/supabase-server';

export default async function ComponentDetailPage({
    params,
}: {
    params: Promise<{ id: string; componentId: string }>;
}) {
    await requireAdmin();

    const { id, componentId } = await params;
    const [component, job] = await Promise.all([
        getComponentDetail(componentId),
        getArtworkJob(id),
    ]);

    if (!component || !job) {
        notFound();
    }

    // Generate a signed URL for the thumbnail if it exists (bucket is private)
    let thumbnailSignedUrl: string | null = null;
    if (component.artwork_thumbnail_url) {
        const supabase = await createServerClient();
        const urlParts = component.artwork_thumbnail_url.split('/artwork-assets/');
        if (urlParts.length > 1) {
            const storagePath = urlParts[1];
            const { data } = await supabase.storage
                .from('artwork-assets')
                .createSignedUrl(storagePath, 3600); // 1 hour expiry
            thumbnailSignedUrl = data?.signedUrl || null;
        }
    }

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <Link
                href={`/app/admin/artwork/${id}`}
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
                    {component.design_signed_off_at && (
                        <Link
                            href={`/app/admin/artwork/${id}/${componentId}/print`}
                            target="_blank"
                            className="btn-secondary inline-flex items-center gap-2"
                        >
                            <Printer size={16} />
                            print compliance sheet
                        </Link>
                    )}
                    <Chip variant={getComponentStatusVariant(component.status as ComponentStatus)}>
                        {getComponentStatusLabel(component.status as ComponentStatus)}
                    </Chip>
                </div>
            </div>

            {/* Dimension Alert */}
            {(component.dimension_flag || component.extra_items?.some(i => i.dimension_flag)) && (
                <div className="mb-6">
                    <DimensionAlert component={component} />
                </div>
            )}

            {/* Two-Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Left: Design Authority (60%) */}
                <div className="lg:col-span-3 space-y-6">
                    <Card>
                        <h2 className="text-sm font-semibold text-neutral-900 mb-4 uppercase tracking-wider">
                            design authority
                        </h2>
                        <DesignSection
                            component={component}
                            jobId={id}
                            thumbnailUrl={thumbnailSignedUrl}
                        />
                    </Card>

                    {/* Version History */}
                    {component.versions.length > 0 && (
                        <Card>
                            <h2 className="text-sm font-semibold text-neutral-900 mb-4 uppercase tracking-wider">
                                version history
                            </h2>
                            <VersionHistory versions={component.versions} />
                        </Card>
                    )}
                </div>

                {/* Right: Production Checklist (40%) */}
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <h2 className="text-sm font-semibold text-neutral-900 mb-4 uppercase tracking-wider">
                            production verification
                        </h2>
                        <ProductionSection
                            component={component}
                            jobId={id}
                        />
                    </Card>

                    {/* Production Checks Log */}
                    {component.production_checks.length > 0 && (
                        <Card>
                            <h2 className="text-sm font-semibold text-neutral-900 mb-4 uppercase tracking-wider">
                                check log
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
            </div>
        </div>
    );
}
