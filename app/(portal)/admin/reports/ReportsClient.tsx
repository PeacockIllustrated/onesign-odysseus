'use client';

import { useState } from 'react';
import { type Org, type Report } from '@/lib/supabase';
import { Card, Chip } from '@/app/(portal)/components/ui';
import { UploadReportModal } from './UploadReportModal';
import { useRouter } from 'next/navigation';
import { Plus, FileText, Download } from 'lucide-react';

interface ReportsClientProps {
    orgs: Org[];
    reports: (Report & { org: Org })[];
}

export function ReportsClient({ orgs, reports }: ReportsClientProps) {
    const router = useRouter();
    const [uploadOpen, setUploadOpen] = useState(false);
    const [filterOrgId, setFilterOrgId] = useState('');

    const filtered = filterOrgId
        ? reports.filter(r => r.org_id === filterOrgId)
        : reports;

    function handleSuccess() {
        router.refresh();
    }

    function formatMonth(dateStr: string) {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    }

    return (
        <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                <div className="flex gap-2 items-center">
                    <select
                        value={filterOrgId}
                        onChange={(e) => setFilterOrgId(e.target.value)}
                        className="px-3 py-1.5 text-sm border border-neutral-200 rounded-md bg-white"
                    >
                        <option value="">All organisations</option>
                        {orgs.map(org => (
                            <option key={org.id} value={org.id}>{org.name}</option>
                        ))}
                    </select>
                </div>
                <button onClick={() => setUploadOpen(true)} className="btn-primary flex items-center gap-2">
                    <Plus size={16} />
                    Upload Report
                </button>
            </div>

            <Card>
                {filtered.length === 0 ? (
                    <p className="text-sm text-neutral-500 py-8 text-center">No reports found</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-neutral-200">
                                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Organisation</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Month</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Title</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Uploaded</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">File</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                                {filtered.map(report => (
                                    <tr key={report.id} className="hover:bg-neutral-50">
                                        <td className="px-4 py-3 font-medium text-neutral-900">{report.org?.name || '—'}</td>
                                        <td className="px-4 py-3">
                                            <Chip variant="default">{formatMonth(report.month)}</Chip>
                                        </td>
                                        <td className="px-4 py-3 text-sm">{report.title}</td>
                                        <td className="px-4 py-3 text-sm text-neutral-500">
                                            {new Date(report.created_at).toLocaleDateString('en-GB')}
                                        </td>
                                        <td className="px-4 py-3">
                                            {report.storage_path ? (
                                                <span className="flex items-center gap-1 text-sm text-blue-600">
                                                    <FileText size={14} />
                                                    PDF
                                                </span>
                                            ) : (
                                                <span className="text-neutral-400">—</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            <UploadReportModal
                orgs={orgs}
                open={uploadOpen}
                onClose={() => setUploadOpen(false)}
                onSuccess={handleSuccess}
            />
        </>
    );
}

