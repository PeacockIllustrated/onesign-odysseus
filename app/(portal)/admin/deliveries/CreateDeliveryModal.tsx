'use client';

import { useState, useEffect } from 'react';
import { Loader2, X } from 'lucide-react';
import { Modal } from '@/app/(portal)/components/ui';
import { SitePicker } from '@/components/admin/SitePicker';
import {
    getJobsAvailableForDelivery,
    createDeliveryFromJob,
} from '@/lib/deliveries/actions';

interface CreateDeliveryModalProps {
    onClose: () => void;
    onCreated: (id: string) => void;
    onError: (msg: string) => void;
}

function getTomorrowDate(): string {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
}

export function CreateDeliveryModal({ onClose, onCreated, onError }: CreateDeliveryModalProps) {
    const [jobs, setJobs] = useState<
        Array<{
            id: string;
            job_number: string;
            client_name: string;
            title: string;
            org_id: string;
            site_id: string | null;
            contact_id: string | null;
        }>
    >([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const [selectedJobId, setSelectedJobId] = useState('');
    const [siteId, setSiteId] = useState<string | null>(null);
    const [driverName, setDriverName] = useState('');
    const [scheduledDate, setScheduledDate] = useState(getTomorrowDate());
    const [notesDriver, setNotesDriver] = useState('');

    useEffect(() => {
        getJobsAvailableForDelivery().then((data) => {
            setJobs(data);
            setLoading(false);
        });
    }, []);

    const selectedJob = jobs.find((j) => j.id === selectedJobId) || null;

    // When job changes, auto-set site from the job if available
    useEffect(() => {
        if (selectedJob?.site_id) {
            setSiteId(selectedJob.site_id);
        } else {
            setSiteId(null);
        }
    }, [selectedJob?.id, selectedJob?.site_id]);

    async function handleSubmit() {
        if (!selectedJobId) return;

        setSubmitting(true);
        try {
            const result = await createDeliveryFromJob({
                production_job_id: selectedJobId,
                site_id: siteId ?? undefined,
                driver_name: driverName.trim() || undefined,
                scheduled_date: scheduledDate,
                notes_driver: notesDriver.trim() || undefined,
            });

            if ('error' in result) {
                onError(result.error);
                onClose();
            } else {
                onCreated(result.id);
            }
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Modal open={true} onClose={onClose} title="Schedule Delivery">
            <div className="space-y-4">
                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 size={20} className="animate-spin text-neutral-400" />
                    </div>
                ) : jobs.length === 0 ? (
                    <div className="text-center py-8 text-neutral-400">
                        <p className="text-sm">No jobs available for delivery</p>
                    </div>
                ) : (
                    <>
                        {/* Job selector */}
                        <div>
                            <label className="block text-xs font-medium text-neutral-600 mb-1">
                                Production Job
                            </label>
                            <select
                                value={selectedJobId}
                                onChange={(e) => setSelectedJobId(e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-[#4e7e8c]"
                            >
                                <option value="">-- Select a job --</option>
                                {jobs.map((job) => (
                                    <option key={job.id} value={job.id}>
                                        {job.job_number} — {job.client_name}{job.title ? ` — ${job.title}` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Site picker (only if job selected) */}
                        {selectedJob && (
                            <div>
                                <label className="block text-xs font-medium text-neutral-600 mb-1">
                                    Delivery Site
                                </label>
                                <SitePicker
                                    orgId={selectedJob.org_id}
                                    value={siteId}
                                    onChange={setSiteId}
                                />
                            </div>
                        )}

                        {/* Driver name */}
                        <div>
                            <label className="block text-xs font-medium text-neutral-600 mb-1">
                                Driver Name
                            </label>
                            <input
                                type="text"
                                value={driverName}
                                onChange={(e) => setDriverName(e.target.value)}
                                placeholder="Enter driver name"
                                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-[#4e7e8c]"
                            />
                        </div>

                        {/* Scheduled date */}
                        <div>
                            <label className="block text-xs font-medium text-neutral-600 mb-1">
                                Scheduled Date
                            </label>
                            <input
                                type="date"
                                value={scheduledDate}
                                onChange={(e) => setScheduledDate(e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-[#4e7e8c]"
                            />
                        </div>

                        {/* Notes for driver */}
                        <div>
                            <label className="block text-xs font-medium text-neutral-600 mb-1">
                                Notes for Driver
                            </label>
                            <textarea
                                value={notesDriver}
                                onChange={(e) => setNotesDriver(e.target.value)}
                                placeholder="Any special instructions..."
                                rows={3}
                                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-[#4e7e8c] resize-none"
                            />
                        </div>

                        {/* Actions */}
                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-3 py-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSubmit}
                                disabled={!selectedJobId || submitting}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-black text-white rounded-[var(--radius-sm)] hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {submitting && <Loader2 size={14} className="animate-spin" />}
                                Schedule Delivery
                            </button>
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
}
