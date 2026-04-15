import { requireAdmin } from '@/lib/auth';
import { getArtworkJob, getArtworkJobLineage } from '@/lib/artwork/actions';
import { getProductionStages } from '@/lib/production/queries';
import { createServerClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import { PageHeader, Card, Chip } from '@/app/(portal)/components/ui';
import Link from 'next/link';
import { ChevronLeft, Printer } from 'lucide-react';
import {
    getJobStatusLabel,
    getJobStatusVariant,
    getComponentStatusLabel,
    getComponentStatusVariant,
    getComponentTypeLabel,
    getJobProgress,
    formatDimensionWithReturns,
    formatDate,
} from '@/lib/artwork/utils';
import { ArtworkJobStatus, ComponentStatus } from '@/lib/artwork/types';
import { getApprovalForJob } from '@/lib/artwork/approval-actions';
import { AddComponentForm } from './components/AddComponentForm';
import { ApprovalLinkSection } from './components/ApprovalLinkSection';
import { CoverImageUpload } from './components/CoverImageUpload';
import { JobFieldsForm } from './components/JobFieldsForm';
import { ReleaseToProductionButton } from './components/ReleaseToProductionButton';
import { DeleteArtworkJobButton } from './components/DeleteArtworkJobButton';

export default async function ArtworkJobDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    await requireAdmin();

    const { id } = await params;
    const [job, approval, stages, lineage] = await Promise.all([
        getArtworkJob(id),
        getApprovalForJob(id),
        getProductionStages(),
        getArtworkJobLineage(id),
    ]);

    if (!job) {
        notFound();
    }

    // Generate signed URL for cover image if present
    let coverImageUrl: string | null = null;
    if (job.cover_image_path) {
        const supabase = await createServerClient();
        const { data } = await supabase.storage
            .from('artwork-assets')
            .createSignedUrl(job.cover_image_path, 3600);
        coverImageUrl = data?.signedUrl || null;
    }

    const progress = getJobProgress(job.components);
    // A component is "printable" if at least one sub-item has had its design
    // signed off. Legacy jobs (pre sub-items refactor) may still have the
    // design_signed_off_at on the component itself — check that too.
    const hasSignedOffComponents = job.components.some(
        (c: any) =>
            c.design_signed_off_at ||
            (c.sub_items || []).some((si: any) => si.design_signed_off_at)
    );

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <Link
                href="/admin/artwork"
                className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-black mb-4 transition-colors"
            >
                <ChevronLeft size={16} />
                back to artwork jobs
            </Link>

            {lineage && (lineage.quoteNumber || lineage.productionJobNumber) && (
                <nav className="text-xs text-neutral-500 mb-3 flex items-center gap-2 flex-wrap">
                    {lineage.quoteNumber && (
                        <>
                            <span>quote</span>
                            <Link
                                href={`/admin/quotes/${lineage.quoteId}`}
                                className="font-mono text-neutral-700 hover:underline"
                            >
                                {lineage.quoteNumber}
                            </Link>
                            <span className="text-neutral-400">→</span>
                        </>
                    )}
                    {lineage.productionJobNumber && (
                        <>
                            <span>production</span>
                            <Link
                                href={`/admin/jobs/${lineage.productionJobId}`}
                                className="font-mono text-neutral-700 hover:underline"
                            >
                                {lineage.productionJobNumber}
                            </Link>
                            <span className="text-neutral-400">→</span>
                        </>
                    )}
                    <span className="font-mono text-neutral-700">artwork</span>
                </nav>
            )}

            <PageHeader
                title={job.job_name}
                description={`${job.job_reference}${job.client_name ? ` — ${job.client_name}` : ''}`}
                action={
                    <div className="flex items-center gap-2">
                        {job.production_item && job.status !== 'completed' && (
                            <ReleaseToProductionButton
                                artworkJobId={id}
                                components={job.components}
                                stages={stages}
                            />
                        )}
                        {hasSignedOffComponents && (
                            <Link
                                href={`/admin/artwork/${id}/print`}
                                target="_blank"
                                className="btn-secondary inline-flex items-center gap-2"
                            >
                                <Printer size={16} />
                                print all sheets
                            </Link>
                        )}
                        <Chip variant={getJobStatusVariant(job.status as ArtworkJobStatus)}>
                            {getJobStatusLabel(job.status as ArtworkJobStatus)}
                        </Chip>
                        <DeleteArtworkJobButton
                            artworkJobId={id}
                            jobReference={job.job_reference}
                        />
                    </div>
                }
            />

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left: Components List */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Job Info */}
                    {job.description && (
                        <Card>
                            <p className="text-sm text-neutral-600">{job.description}</p>
                        </Card>
                    )}

                    {/* Components */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-lg font-bold text-neutral-900">components</h2>
                            <AddComponentForm jobId={id} />
                        </div>

                        {job.components.length === 0 ? (
                            <Card>
                                <div className="text-center py-8">
                                    <p className="text-neutral-500 text-sm mb-2">no components yet</p>
                                    <p className="text-neutral-400 text-xs">add a fabrication component to get started</p>
                                </div>
                            </Card>
                        ) : (
                            <div className="space-y-3">
                                {job.components.map((component, index) => (
                                    <Link
                                        key={component.id}
                                        href={`/admin/artwork/${id}/${component.id}`}
                                        className="block"
                                    >
                                        <Card className="hover:border-neutral-300 transition-colors cursor-pointer">
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-xs font-mono text-neutral-400">
                                                            {String(index + 1).padStart(2, '0')}
                                                        </span>
                                                        <h3 className="text-sm font-semibold text-neutral-900">
                                                            {component.name}
                                                        </h3>
                                                        <Chip variant="default">
                                                            {getComponentTypeLabel(component.component_type)}
                                                        </Chip>
                                                    </div>
                                                    {component.width_mm && component.height_mm ? (
                                                        <p className="text-xs text-neutral-500 mt-1">
                                                            {formatDimensionWithReturns(
                                                                Number(component.width_mm),
                                                                Number(component.height_mm),
                                                                component.returns_mm ? Number(component.returns_mm) : null
                                                            )}
                                                            {component.material && ` — ${component.material}`}
                                                        </p>
                                                    ) : (
                                                        <p className="text-xs text-neutral-400 mt-1">
                                                            dimensions not yet specified
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {component.target_stage_id && (() => {
                                                        const stage = stages.find(s => s.id === component.target_stage_id);
                                                        return stage ? (
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: `${stage.color}20`, color: stage.color }}>
                                                                {stage.name}
                                                            </span>
                                                        ) : null;
                                                    })()}
                                                    {component.design_signed_off_at && (
                                                        <span className="text-xs text-green-600" title="design signed off">
                                                            design ok
                                                        </span>
                                                    )}
                                                    {component.production_signed_off_at && (
                                                        <span className="text-xs text-emerald-600" title="production signed off">
                                                            prod ok
                                                        </span>
                                                    )}
                                                    {component.dimension_flag === 'out_of_tolerance' && (
                                                        <span className="text-xs text-red-600 font-medium" title="out of tolerance">
                                                            OOT
                                                        </span>
                                                    )}
                                                    <Chip variant={getComponentStatusVariant(component.status as ComponentStatus)}>
                                                        {getComponentStatusLabel(component.status as ComponentStatus)}
                                                    </Chip>
                                                </div>
                                            </div>
                                        </Card>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Progress Sidebar */}
                <div className="space-y-6">
                    {job.production_item && (
                        <Card>
                            <h3 className="text-sm font-semibold text-neutral-900 mb-3">production context</h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-neutral-500">job</span>
                                    <Link href="/admin/jobs" className="font-mono text-xs text-[#4e7e8c] hover:underline">
                                        {job.production_item.job_number}{job.production_item.item_number ? ` \u00b7 ${job.production_item.item_number}` : ''}
                                    </Link>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-neutral-500">client</span>
                                    <span>{job.production_item.client_name}</span>
                                </div>
                                {job.production_item.due_date && (
                                    <div className="flex justify-between">
                                        <span className="text-neutral-500">due</span>
                                        <span>{job.production_item.due_date}</span>
                                    </div>
                                )}
                                <div className="flex justify-between">
                                    <span className="text-neutral-500">priority</span>
                                    <span className={`capitalize font-medium ${
                                        job.production_item.priority === 'urgent' ? 'text-red-600' :
                                        job.production_item.priority === 'high' ? 'text-amber-600' : 'text-neutral-700'
                                    }`}>{job.production_item.priority}</span>
                                </div>
                            </div>
                        </Card>
                    )}

                    <Card>
                        <h3 className="text-sm font-semibold text-neutral-900 mb-3">progress</h3>

                        {job.components.length === 0 ? (
                            <p className="text-xs text-neutral-400">add components to track progress</p>
                        ) : (
                            <div className="space-y-4">
                                {/* Progress Bar */}
                                <div>
                                    <div className="flex justify-between text-xs text-neutral-500 mb-1">
                                        <span>completion</span>
                                        <span>{progress.percentage}%</span>
                                    </div>
                                    <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-black transition-all duration-300"
                                            style={{ width: `${progress.percentage}%` }}
                                        />
                                    </div>
                                </div>

                                {/* Stats */}
                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-neutral-500">total components</span>
                                        <span className="font-medium">{progress.total}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-neutral-500">design submitted</span>
                                        <span className="font-medium">{progress.designed}/{progress.total}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-neutral-500">design signed off</span>
                                        <span className="font-medium">{progress.signedOff}/{progress.total}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-neutral-500">production complete</span>
                                        <span className="font-medium">{progress.produced}/{progress.total}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </Card>

                    {/* Job Details */}
                    <Card>
                        <h3 className="text-sm font-semibold text-neutral-900 mb-3">job details</h3>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-neutral-500">reference</span>
                                <span className="font-mono text-xs">{job.job_reference}</span>
                            </div>
                            {job.client_name && (
                                <div className="flex justify-between">
                                    <span className="text-neutral-500">client</span>
                                    <span>{job.client_name}</span>
                                </div>
                            )}
                            <div className="flex justify-between">
                                <span className="text-neutral-500">created</span>
                                <span>{formatDate(job.created_at)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-neutral-500">updated</span>
                                <span>{formatDate(job.updated_at)}</span>
                            </div>
                        </div>
                    </Card>

                    {/* Panel Size & Paint Colour */}
                    <JobFieldsForm
                        jobId={id}
                        panelSize={job.panel_size}
                        paintColour={job.paint_colour}
                    />

                    {/* Cover Image */}
                    <CoverImageUpload
                        jobId={id}
                        coverImageUrl={coverImageUrl}
                    />

                    {/* Client Approval */}
                    <ApprovalLinkSection
                        jobId={id}
                        approval={approval}
                        hasSignedOffComponents={hasSignedOffComponents}
                    />
                </div>
            </div>
        </div>
    );
}
