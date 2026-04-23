import { requireAdmin } from '@/lib/auth';
import { getArtworkJob, getArtworkJobLineage } from '@/lib/artwork/actions';
import { getProductionStages } from '@/lib/production/queries';
import { createAdminClient } from '@/lib/supabase-admin';
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
import { getApprovalForJob, getComponentDecisionsForJob } from '@/lib/artwork/approval-actions';
import { AddComponentForm } from './components/AddComponentForm';
import { ApprovalLinkSection } from './components/ApprovalLinkSection';
import { ClientDeliveryCard } from './components/ClientDeliveryCard';
import { JobFieldsForm } from './components/JobFieldsForm';
import { ReleaseToProductionButton } from './components/ReleaseToProductionButton';
import { DeleteArtworkJobButton } from './components/DeleteArtworkJobButton';
import { ReorderControls } from './components/ReorderControls';
import { LinkedQuoteCard } from './components/LinkedQuoteCard';
import { CreateProductionFromVisualButton } from './components/CreateProductionFromVisualButton';

export default async function ArtworkJobDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    await requireAdmin();

    const { id } = await params;
    const [job, approval, stages, lineage, componentDecisions] = await Promise.all([
        getArtworkJob(id),
        getApprovalForJob(id),
        getProductionStages(),
        getArtworkJobLineage(id),
        getComponentDecisionsForJob(id),
    ]);

    if (!job) {
        notFound();
    }

    const supabaseClient = createAdminClient();

    // Visual-approval extra data
    let spawnedProduction: { id: string } | null = null;
    let linkableQuotes: { id: string; quote_number: string; customer_name: string | null }[] = [];
    let currentQuote: { id: string; quote_number: string; customer_name: string | null } | null = null;

    if (job.job_type === 'visual_approval') {
        const [{ data: spawned }, { data: quotes }] = await Promise.all([
            supabaseClient
                .from('artwork_jobs')
                .select('id')
                .eq('parent_visual_job_id', id)
                .eq('job_type', 'production')
                .maybeSingle(),
            supabaseClient
                .from('quotes')
                .select('id, quote_number, customer_name')
                .in('status', ['draft', 'sent', 'accepted'])
                .order('created_at', { ascending: false })
                .limit(50),
        ]);
        spawnedProduction = spawned ?? null;
        linkableQuotes = quotes ?? [];

        if (job.quote_id) {
            const { data: linked } = await supabaseClient
                .from('quotes')
                .select('id, quote_number, customer_name')
                .eq('id', job.quote_id)
                .maybeSingle();
            currentQuote = linked ?? null;
        }
    }

    // Load client context (contact list + site list for the override dropdowns,
    // plus the currently-selected contact + site rows for display).
    let clientOrg: { id: string; name: string } | null = null;
    let currentContact: any = null;
    let currentSite: any = null;
    let availableContacts: any[] = [];
    let availableSites: any[] = [];
    if (job.org_id) {
        const [{ data: org }, { data: contacts }, { data: sites }] = await Promise.all([
            supabaseClient.from('orgs').select('id, name').eq('id', job.org_id).single(),
            supabaseClient
                .from('contacts')
                .select('id, first_name, last_name, email, phone, contact_type, is_primary')
                .eq('org_id', job.org_id)
                .order('is_primary', { ascending: false })
                .order('last_name', { ascending: true }),
            supabaseClient
                .from('org_sites')
                .select(
                    'id, name, address_line_1, address_line_2, city, county, postcode, country, is_primary, is_delivery_address'
                )
                .eq('org_id', job.org_id)
                .order('is_delivery_address', { ascending: false })
                .order('is_primary', { ascending: false })
                .order('name', { ascending: true }),
        ]);
        clientOrg = org ?? null;
        availableContacts = contacts ?? [];
        availableSites = sites ?? [];
        if (job.contact_id) {
            currentContact = availableContacts.find((c) => c.id === job.contact_id) ?? null;
        }
        if (job.site_id) {
            currentSite = availableSites.find((s) => s.id === job.site_id) ?? null;
        }
    }

    const progress = getJobProgress(job.components);
    // A component is "printable" if at least one sub-item has had its design
    // signed off. Legacy jobs (pre sub-items refactor) may still have the
    // design_signed_off_at on the component itself — check that too.
    // For visual_approval jobs there is no per-sub-item sign-off step —
    // readiness means every component has at least one variant attached
    // (the client picks a variant at approval time).
    const hasSignedOffComponents =
        job.job_type === 'visual_approval'
            ? job.components.length > 0 &&
              job.components.every(
                  (c: any) => ((c as any).variants ?? []).length > 0
              )
            : job.components.some(
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
                        {job.job_type === 'visual_approval' && (
                            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                                Visual
                            </span>
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
                                {job.components.map((component, index) => {
                                    const subs = ((component as any).sub_items ?? []) as Array<{ id: string; label?: string; name?: string | null }>;
                                    // Aggregate per-sub-item decisions into a component-level verdict:
                                    //   * any changes_requested → amber
                                    //   * all approved          → green
                                    //   * mixed / incomplete    → neutral
                                    const subDecisions = subs
                                        .map((si) => componentDecisions.bySubItem[si.id])
                                        .filter(Boolean);
                                    const componentOnly = componentDecisions.byComponent[component.id];
                                    const anyChanges = subDecisions.some((d) => d.decision === 'changes_requested')
                                        || componentOnly?.decision === 'changes_requested';
                                    const allApproved = subs.length > 0
                                        ? subDecisions.length === subs.length && subDecisions.every((d) => d.decision === 'approved')
                                        : componentOnly?.decision === 'approved';
                                    const cardBorder = anyChanges
                                        ? 'border-amber-400 bg-amber-50 hover:border-amber-500'
                                        : allApproved
                                        ? 'border-green-400 bg-green-50 hover:border-green-500'
                                        : 'hover:border-neutral-300';
                                    const subComments = subs
                                        .map((si) => {
                                            const d = componentDecisions.bySubItem[si.id];
                                            if (!d?.comment) return null;
                                            return { label: si.label ?? '?', name: si.name ?? '', comment: d.comment };
                                        })
                                        .filter(Boolean) as Array<{ label: string; name: string; comment: string }>;
                                    return (
                                        <Link
                                            key={component.id}
                                            href={`/admin/artwork/${id}/${component.id}`}
                                            className="block"
                                        >
                                            <Card className={`${cardBorder} transition-colors cursor-pointer`}>
                                                <div className="flex items-start justify-between gap-3">
                                                    <ReorderControls
                                                        componentId={component.id}
                                                        isFirst={index === 0}
                                                        isLast={index === job.components.length - 1}
                                                    />
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
                                                            {allApproved && !anyChanges && (
                                                                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-green-600 text-white">
                                                                    client approved
                                                                </span>
                                                            )}
                                                            {anyChanges && (
                                                                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500 text-white">
                                                                    changes requested
                                                                </span>
                                                            )}
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
                                                        {subComments.length > 0 && (
                                                            <div className="mt-2 space-y-1">
                                                                {subComments.map((sc) => (
                                                                    <div key={sc.label} className="p-2 rounded border border-amber-300 bg-amber-100 text-xs text-amber-900">
                                                                        <span className="font-mono font-bold text-[10px] bg-neutral-900 text-white px-1 py-0.5 rounded mr-1.5">
                                                                            {sc.label}
                                                                        </span>
                                                                        {sc.name && <span className="font-semibold mr-1">{sc.name}:</span>}
                                                                        <span className="whitespace-pre-wrap">{sc.comment}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                        {componentOnly?.comment && subComments.length === 0 && (
                                                            <div className="mt-2 p-2 rounded border border-amber-300 bg-amber-100 text-xs text-amber-900">
                                                                <span className="font-semibold uppercase tracking-wider text-[10px] text-amber-800 mr-1">
                                                                    client:
                                                                </span>
                                                                <span className="whitespace-pre-wrap">{componentOnly.comment}</span>
                                                            </div>
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
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Progress Sidebar */}
                <div className="space-y-6">
                    <ClientDeliveryCard
                        artworkJobId={job.id}
                        clientName={clientOrg?.name ?? job.client_name_snapshot ?? job.client_name ?? null}
                        clientId={clientOrg?.id ?? null}
                        currentContact={currentContact}
                        currentSite={currentSite}
                        availableContacts={availableContacts}
                        availableSites={availableSites}
                        readOnly={job.status === 'completed'}
                    />

                    {job.job_type === 'visual_approval' && (
                        <>
                            <LinkedQuoteCard
                                artworkJobId={id}
                                currentQuote={currentQuote}
                                availableQuotes={linkableQuotes}
                            />
                            {job.status === 'completed' && (
                                <CreateProductionFromVisualButton
                                    visualJobId={id}
                                    existingProductionJobId={spawnedProduction?.id ?? null}
                                />
                            )}
                        </>
                    )}

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

                    {/* Cover image intentionally removed — sub-item thumbnails
                        carry the visual on the sign-off page, so the job-level
                        cover upload is one more step staff don't need. */}

                    {/* Client Approval */}
                    <ApprovalLinkSection
                        jobId={id}
                        approval={approval}
                        hasSignedOffComponents={hasSignedOffComponents}
                        notReadyHint={
                            job.job_type === 'visual_approval'
                                ? 'add at least one variant to every component to enable client approval'
                                : undefined
                        }
                    />
                </div>
            </div>
        </div>
    );
}
