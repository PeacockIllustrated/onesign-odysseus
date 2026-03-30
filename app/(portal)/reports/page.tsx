import { createServerClient } from '@/lib/supabase-server';
import { type Report } from '@/lib/supabase';
import { getUserOrg } from '@/lib/auth';
import { PageHeader, Card, EmptyState, DataTable, Chip } from '@/app/(portal)/components/ui';
import { FileText, Download, ExternalLink } from 'lucide-react';
import Link from 'next/link';

export default async function ReportsPage() {
    const orgContext = await getUserOrg();
    if (!orgContext) return null;

    const supabase = await createServerClient();

    const { data: reports } = await supabase
        .from('reports')
        .select('*')
        .eq('org_id', orgContext.org.id)
        .order('month', { ascending: false });

    return (
        <div>
            <PageHeader
                title="Reports"
                description="View your monthly performance reports"
            />

            {!reports || reports.length === 0 ? (
                <Card>
                    <EmptyState
                        type="reports"
                        title="No reports yet"
                        description="Monthly reports will appear here once they're ready."
                    />
                </Card>
            ) : (
                <div className="space-y-4">
                    {reports.map((report) => (
                        <ReportCard key={report.id} report={report} />
                    ))}
                </div>
            )}
        </div>
    );
}

function ReportCard({ report }: { report: Report }) {
    const monthDate = new Date(report.month);
    const monthLabel = monthDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

    // Extract summary metrics if available
    const summary = report.summary as Record<string, string | number> | null;
    const metrics = summary ? Object.entries(summary).slice(0, 4) : [];

    return (
        <Card>
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-neutral-100 rounded-[var(--radius-sm)] flex items-center justify-center">
                        <FileText size={18} className="text-neutral-500" />
                    </div>
                    <div>
                        <h3 className="text-sm font-medium text-neutral-900">{report.title}</h3>
                        <p className="text-xs text-neutral-500">{monthLabel}</p>
                    </div>
                </div>

                {report.storage_path && (
                    <a
                        href={`/api/reports/download?path=${encodeURIComponent(report.storage_path)}`}
                        className="btn-secondary text-xs flex items-center gap-1"
                    >
                        <Download size={12} />
                        Download PDF
                    </a>
                )}
            </div>

            {/* Summary metrics */}
            {metrics.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-neutral-100">
                    {metrics.map(([key, value]) => (
                        <div key={key}>
                            <p className="text-xs text-neutral-500 capitalize">{key.replace(/_/g, ' ')}</p>
                            <p className="text-lg font-semibold text-neutral-900">{value}</p>
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
}

