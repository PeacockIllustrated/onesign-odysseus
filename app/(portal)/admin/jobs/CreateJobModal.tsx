// app/(portal)/admin/jobs/CreateJobModal.tsx
// Stub — will be fully implemented in Task 8
'use client';

interface CreateJobModalProps {
    open: boolean;
    onClose: () => void;
}

export function CreateJobModal({ open, onClose }: CreateJobModalProps) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />
            <div className="relative bg-white rounded-lg p-6 shadow-2xl">
                <p className="text-sm text-neutral-500">Create job modal — coming in Task 8</p>
            </div>
        </div>
    );
}
