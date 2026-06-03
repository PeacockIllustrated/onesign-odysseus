import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireAdmin } from '@/lib/auth';
import { Card } from '@/app/(portal)/components/ui';
import { getDesignRequest } from '@/lib/design-requests/actions';
import { RequestActions } from './RequestActions';

export const dynamic = 'force-dynamic';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-baseline justify-between gap-4 border-b border-neutral-100 py-1.5 last:border-0">
            <span className="text-xs text-neutral-500">{label}</span>
            <span className="text-sm font-medium text-neutral-800 text-right">
                {value}
            </span>
        </div>
    );
}

export default async function DesignRequestDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    await requireAdmin();
    const { id } = await params;
    const res = await getDesignRequest(id);
    if (!res.ok) notFound();
    const r = res.data;
    const p = r.params_json;
    const groups = p?.materialGroups ?? [];

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <Link
                href="/admin/design-requests"
                className="mb-4 inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-800"
            >
                <ArrowLeft size={15} /> Back to requests
            </Link>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {/* Left: preview + spec */}
                <div className="lg:col-span-2 space-y-4">
                    <Card className="overflow-hidden">
                        <div className="flex items-center justify-center border-b border-neutral-100 bg-neutral-50 p-4">
                            {r.thumbnail ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={r.thumbnail}
                                    alt={p?.name ?? 'Design preview'}
                                    className="max-h-72 w-auto object-contain"
                                />
                            ) : (
                                <span className="py-16 text-sm text-neutral-300">
                                    No preview captured
                                </span>
                            )}
                        </div>
                        <div className="p-4">
                            <h2 className="text-base font-bold text-neutral-900">
                                {p?.name || 'Untitled sign'}
                            </h2>
                            <p className="text-sm text-neutral-500">
                                {r.sign_type ?? 'Sign'}
                            </p>
                        </div>
                    </Card>

                    <Card className="p-4">
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-neutral-500">
                            Specification
                        </h3>
                        <Row
                            label="Dimensions"
                            value={`${Math.round(p?.panelWidthMm ?? 0)} × ${Math.round(p?.panelHeightMm ?? 0)} mm`}
                        />
                        <Row
                            label="Return depth"
                            value={`${Math.round(p?.returnDepthMm ?? 0)} mm`}
                        />
                        <Row
                            label="Material"
                            value={`${p?.materialLabel ?? 'Aluminium'} · ${p?.materialThicknessMm ?? '—'} mm`}
                        />
                        <Row
                            label="Colour"
                            value={
                                <span className="inline-flex items-center gap-2">
                                    <span
                                        className="inline-block h-4 w-4 rounded border border-neutral-300"
                                        style={{
                                            background:
                                                p?.panelColor ?? '#d6d6d6',
                                        }}
                                    />
                                    {p?.panelRal ?? p?.panelColor ?? '—'}
                                </span>
                            }
                        />
                        <Row
                            label="Construction"
                            value={
                                p?.apertureMode === 'standoff'
                                    ? 'Stand-off lettering'
                                    : 'Aperture / cut'
                            }
                        />
                        <Row
                            label="Illuminated"
                            value={
                                p?.illumination?.keyline?.enabled ? 'Yes' : 'No'
                            }
                        />
                        <Row
                            label="Projecting sign"
                            value={p?.projectingSign ? 'Yes' : 'No'}
                        />
                        {groups.length > 0 && (
                            <Row
                                label="Material groups"
                                value={groups
                                    .map((g) => g.material)
                                    .join(', ')}
                            />
                        )}
                    </Card>

                    {r.project_notes && (
                        <Card className="p-4">
                            <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-neutral-500">
                                Customer notes
                            </h3>
                            <p className="whitespace-pre-wrap text-sm text-neutral-700">
                                {r.project_notes}
                            </p>
                        </Card>
                    )}
                </div>

                {/* Right: contact + actions */}
                <div className="space-y-4">
                    <Card className="p-4">
                        <div className="mb-3 flex items-center justify-between">
                            <span className="font-mono text-xs text-neutral-400">
                                {r.reference}
                            </span>
                        </div>
                        <h3 className="text-base font-bold text-neutral-900">
                            {r.customer_name}
                        </h3>
                        {r.company && (
                            <p className="text-sm text-neutral-500">
                                {r.company}
                            </p>
                        )}
                        <div className="mt-3 space-y-1.5 text-sm">
                            <a
                                href={`mailto:${r.customer_email}`}
                                className="block truncate text-[#3a5f6a] hover:underline"
                            >
                                {r.customer_email}
                            </a>
                            {r.customer_phone && (
                                <a
                                    href={`tel:${r.customer_phone}`}
                                    className="block text-neutral-700"
                                >
                                    {r.customer_phone}
                                </a>
                            )}
                            {r.postcode && (
                                <p className="text-neutral-700">
                                    Install: {r.postcode}
                                </p>
                            )}
                        </div>
                    </Card>

                    <RequestActions
                        id={r.id}
                        status={r.status}
                        designId={r.design_id}
                        email={r.customer_email}
                        reference={r.reference}
                    />
                </div>
            </div>
        </div>
    );
}
