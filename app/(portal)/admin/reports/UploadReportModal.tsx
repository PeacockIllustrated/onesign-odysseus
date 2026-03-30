'use client';

import { useState } from 'react';
import { createBrowserClient, type Org } from '@/lib/supabase';
import { Modal, FileUpload } from '@/app/(portal)/components/ui';
import { Loader2, FileText } from 'lucide-react';

interface UploadReportModalProps {
    orgs: Org[];
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export function UploadReportModal({ orgs, open, onClose, onSuccess }: UploadReportModalProps) {
    const [orgId, setOrgId] = useState('');
    const [month, setMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [title, setTitle] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    function handleFileSelect(files: File[]) {
        if (files[0]) {
            setFile(files[0]);
            if (!title) {
                // Auto-fill title from filename
                setTitle(files[0].name.replace('.pdf', ''));
            }
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!orgId || !month || !title) return;

        setLoading(true);
        setError(null);

        const supabase = createBrowserClient();

        try {
            let storagePath: string | undefined;

            // Upload file to storage if provided
            if (file) {
                const fileExt = file.name.split('.').pop();
                const fileName = `${orgId}/${month.replace('-', '_')}_${Date.now()}.${fileExt}`;

                const { error: uploadError } = await supabase.storage
                    .from('client-assets')
                    .upload(fileName, file);

                if (uploadError) {
                    console.warn('File upload failed:', uploadError.message);
                    // Continue without file
                } else {
                    storagePath = fileName;
                }
            }

            // Create report record
            const monthDate = `${month}-01`;
            const { error: reportError } = await supabase
                .from('reports')
                .insert({
                    org_id: orgId,
                    month: monthDate,
                    title: title,
                    storage_path: storagePath,
                });

            if (reportError) throw new Error(reportError.message);

            // TODO: Email seam - Notify client of new report

            setOrgId('');
            setTitle('');
            setFile(null);
            onSuccess();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to upload report');
        } finally {
            setLoading(false);
        }
    }

    return (
        <Modal open={open} onClose={onClose} title="Upload Report">
            <form onSubmit={handleSubmit} className="space-y-4 min-w-[400px]">
                {error && (
                    <div className="p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>
                )}

                <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Organisation *
                    </label>
                    <select
                        value={orgId}
                        onChange={(e) => setOrgId(e.target.value)}
                        className="w-full px-3 py-2 border border-neutral-200 rounded-md"
                        required
                    >
                        <option value="">Select an organisation...</option>
                        {orgs.map(org => (
                            <option key={org.id} value={org.id}>{org.name}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Month *
                    </label>
                    <input
                        type="month"
                        value={month}
                        onChange={(e) => setMonth(e.target.value)}
                        className="w-full px-3 py-2 border border-neutral-200 rounded-md"
                        required
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Title *
                    </label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g. January Performance Report"
                        className="w-full px-3 py-2 border border-neutral-200 rounded-md"
                        required
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                        PDF File
                    </label>
                    {file ? (
                        <div className="flex items-center gap-3 p-3 bg-neutral-50 rounded-lg">
                            <FileText size={20} className="text-neutral-400" />
                            <span className="text-sm flex-1 truncate">{file.name}</span>
                            <button
                                type="button"
                                onClick={() => setFile(null)}
                                className="text-xs text-red-500 hover:underline"
                            >
                                Remove
                            </button>
                        </div>
                    ) : (
                        <FileUpload
                            onUpload={handleFileSelect}
                            accept=".pdf"
                            loading={loading}
                        />
                    )}
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t border-neutral-200">
                    <button type="button" onClick={onClose} className="btn-secondary">
                        Cancel
                    </button>
                    <button type="submit" disabled={loading || !orgId || !title} className="btn-primary flex items-center gap-2">
                        {loading && <Loader2 size={16} className="animate-spin" />}
                        Upload Report
                    </button>
                </div>
            </form>
        </Modal>
    );
}

