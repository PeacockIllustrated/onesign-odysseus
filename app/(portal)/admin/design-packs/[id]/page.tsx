import { requireAdmin } from '@/lib/auth';
import { getDesignPack } from '@/lib/design-packs/actions';
import { notFound } from 'next/navigation';
import { PageHeader, Card } from '@/app/(portal)/components/ui';
import Link from 'next/link';
import { ChevronLeft, Presentation, FileDown } from 'lucide-react';
import { TypographySelector } from './components/TypographySelector';
import { ColourPaletteBuilder } from './components/ColourPaletteBuilder';
import { GraphicStylePicker } from './components/GraphicStylePicker';
import { MaterialSelector } from './components/MaterialSelector';
import { ProgressTracker } from './components/ProgressTracker';
import { SignPreviews } from './components/SignPreviews';
import { formatDateTime } from '@/lib/design-packs/utils';

export default async function DesignPackEditorPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    await requireAdmin();

    const { id } = await params;
    const pack = await getDesignPack(id);

    if (!pack) {
        notFound();
    }

    return (
        <div className="p-6 max-w-7xl mx-auto">
            {/* Header */}
            <Link
                href="/admin/design-packs"
                className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-black mb-4 transition-colors"
            >
                <ChevronLeft size={16} />
                back to design packs
            </Link>

            <PageHeader
                title={pack.project_name}
                description={`design pack for ${pack.client_name}`}
                action={
                    <div className="flex items-center gap-2">
                        <Link
                            href={`/admin/design-packs/${id}/present`}
                            className="btn-secondary inline-flex items-center gap-2"
                        >
                            <Presentation size={16} />
                            presentation mode
                        </Link>
                        <Link
                            href={`/app/(print)/admin/design-packs/${id}/export`}
                            target="_blank"
                            className="btn-primary inline-flex items-center gap-2"
                        >
                            <FileDown size={16} />
                            export pdf
                        </Link>
                    </div>
                }
            />

            {/* Progress Tracker */}
            <ProgressTracker pack={pack} />

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
                {/* Left Column - Main Selections */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Typography */}
                    <section id="typography">
                        <h2 className="text-lg font-bold text-neutral-900 mb-3">typography</h2>
                        <Card>
                            <TypographySelector packId={id} data={pack.data_json} />
                        </Card>
                    </section>

                    {/* Colours */}
                    <section id="colours">
                        <h2 className="text-lg font-bold text-neutral-900 mb-3">colour palette</h2>
                        <Card>
                            <ColourPaletteBuilder packId={id} data={pack.data_json} />
                        </Card>
                    </section>

                    {/* Graphic Style */}
                    <section id="graphic-style">
                        <h2 className="text-lg font-bold text-neutral-900 mb-3">graphic style</h2>
                        <Card>
                            <GraphicStylePicker packId={id} data={pack.data_json} />
                        </Card>
                    </section>

                    {/* Materials */}
                    <section id="materials">
                        <h2 className="text-lg font-bold text-neutral-900 mb-3">materials & finishes</h2>
                        <Card>
                            <MaterialSelector packId={id} data={pack.data_json} />
                        </Card>
                    </section>

                    {/* Sign Previews */}
                    <section id="sign-types">
                        <h2 className="text-lg font-bold text-neutral-900 mb-3">sign previews</h2>
                        <Card>
                            <SignPreviews pack={pack} />
                        </Card>
                    </section>
                </div>

                {/* Right Column - Info & Preview */}
                <div className="space-y-6">
                    {/* Project Info */}
                    <Card>
                        <h3 className="text-sm font-medium text-neutral-900 mb-3">project details</h3>
                        <dl className="space-y-2 text-sm">
                            <div>
                                <dt className="text-neutral-500">project</dt>
                                <dd className="text-neutral-900 font-medium">{pack.project_name}</dd>
                            </div>
                            <div>
                                <dt className="text-neutral-500">client</dt>
                                <dd className="text-neutral-900 font-medium">{pack.client_name}</dd>
                            </div>
                            {pack.client_email && (
                                <div>
                                    <dt className="text-neutral-500">email</dt>
                                    <dd className="text-neutral-900">{pack.client_email}</dd>
                                </div>
                            )}
                            <div>
                                <dt className="text-neutral-500">status</dt>
                                <dd className="text-neutral-900 capitalize">{pack.status.replace('_', ' ')}</dd>
                            </div>
                            <div>
                                <dt className="text-neutral-500">last updated</dt>
                                <dd className="text-neutral-900">{formatDateTime(pack.updated_at)}</dd>
                            </div>
                        </dl>
                    </Card>

                    {/* Quick Actions */}
                    <Card>
                        <h3 className="text-sm font-medium text-neutral-900 mb-3">quick actions</h3>
                        <div className="space-y-2">
                            <Link
                                href={`/admin/design-packs/${id}/present`}
                                className="block w-full text-left px-3 py-2 text-sm rounded-[var(--radius-sm)] hover:bg-neutral-100 transition-colors"
                            >
                                <span className="font-medium">presentation mode</span>
                                <span className="block text-xs text-neutral-500">
                                    full-screen client view
                                </span>
                            </Link>
                            <Link
                                href={`/app/(print)/admin/design-packs/${id}/export`}
                                target="_blank"
                                className="block w-full text-left px-3 py-2 text-sm rounded-[var(--radius-sm)] hover:bg-neutral-100 transition-colors"
                            >
                                <span className="font-medium">export pdf</span>
                                <span className="block text-xs text-neutral-500">
                                    generate design pack document
                                </span>
                            </Link>
                        </div>
                    </Card>

                    {/* Parked Decisions */}
                    {pack.data_json.parked_decisions && pack.data_json.parked_decisions.length > 0 && (
                        <Card className="border-amber-200 bg-amber-50">
                            <h3 className="text-sm font-medium text-amber-900 mb-2">parked decisions</h3>
                            <p className="text-xs text-amber-700 mb-3">
                                {pack.data_json.parked_decisions.length} decision
                                {pack.data_json.parked_decisions.length === 1 ? '' : 's'} pending
                            </p>
                            <ul className="space-y-2 text-sm">
                                {pack.data_json.parked_decisions.map((decision, idx) => (
                                    <li key={idx} className="text-amber-800">
                                        <span className="font-medium">{decision.section}</span>
                                        <span className="block text-xs text-amber-600">
                                            {decision.reason}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}
