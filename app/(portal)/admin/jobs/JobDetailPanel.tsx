// app/(portal)/admin/jobs/JobDetailPanel.tsx
// Stub — will be fully implemented in Task 7
'use client';
import type { ProductionStage } from '@/lib/production/types';

interface JobDetailPanelProps {
    jobId: string;
    onClose: () => void;
    stages: ProductionStage[];
}

export function JobDetailPanel({ onClose }: JobDetailPanelProps) {
    return (
        <div className="fixed inset-0 z-50" onClick={onClose}>
            <div className="absolute right-0 top-0 h-full w-96 bg-white shadow-2xl p-6">
                <p className="text-sm text-neutral-500">Loading detail panel…</p>
            </div>
        </div>
    );
}
