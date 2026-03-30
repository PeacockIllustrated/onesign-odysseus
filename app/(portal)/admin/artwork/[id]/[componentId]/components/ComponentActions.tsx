'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateComponent, deleteComponent } from '@/lib/artwork/actions';
import { Modal } from '@/app/(portal)/components/ui';
import { Pencil, Trash2, Check, X } from 'lucide-react';

interface ComponentActionsProps {
    componentId: string;
    jobId: string;
    initialName: string;
}

export function ComponentActions({ componentId, jobId, initialName }: ComponentActionsProps) {
    const router = useRouter();
    const [isEditing, setIsEditing] = useState(false);
    const [name, setName] = useState(initialName);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [isPending, startTransition] = useTransition();
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    async function handleSaveName() {
        const trimmed = name.trim();
        if (!trimmed || trimmed === initialName) {
            setName(initialName);
            setIsEditing(false);
            return;
        }

        startTransition(async () => {
            const result = await updateComponent(componentId, { name: trimmed });
            if ('error' in result) {
                alert(result.error);
                setName(initialName);
            }
            setIsEditing(false);
            router.refresh();
        });
    }

    function handleCancelEdit() {
        setName(initialName);
        setIsEditing(false);
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'Enter') {
            handleSaveName();
        } else if (e.key === 'Escape') {
            handleCancelEdit();
        }
    }

    async function handleDelete() {
        startTransition(async () => {
            const result = await deleteComponent(jobId, componentId);
            if ('error' in result) {
                alert(result.error);
                setShowDeleteModal(false);
                return;
            }
            router.push(`/app/admin/artwork/${jobId}`);
        });
    }

    return (
        <>
            {/* Inline name editing */}
            <div className="flex items-center gap-2">
                {isEditing ? (
                    <div className="flex items-center gap-1.5">
                        <input
                            ref={inputRef}
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="text-xl font-bold text-neutral-900 tracking-tight bg-transparent border-b-2 border-neutral-300 focus:border-black outline-none py-0.5 min-w-[200px]"
                            disabled={isPending}
                        />
                        <button
                            onClick={handleSaveName}
                            disabled={isPending}
                            className="p-1 text-green-600 hover:text-green-700 transition-colors"
                            title="save"
                        >
                            <Check size={16} />
                        </button>
                        <button
                            onClick={handleCancelEdit}
                            disabled={isPending}
                            className="p-1 text-neutral-400 hover:text-neutral-600 transition-colors"
                            title="cancel"
                        >
                            <X size={16} />
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center gap-2">
                        <h1 className="text-xl font-bold text-neutral-900 tracking-tight">
                            {initialName}
                        </h1>
                        <button
                            onClick={() => setIsEditing(true)}
                            className="p-1 text-neutral-400 hover:text-neutral-600 transition-colors"
                            title="edit name"
                        >
                            <Pencil size={14} />
                        </button>
                        <button
                            onClick={() => setShowDeleteModal(true)}
                            className="p-1 text-neutral-400 hover:text-red-500 transition-colors"
                            title="delete component"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                )}
            </div>

            {/* Delete confirmation modal */}
            <Modal
                open={showDeleteModal}
                onClose={() => setShowDeleteModal(false)}
                title="delete component"
            >
                <p className="text-sm text-neutral-600 mb-4">
                    are you sure you want to delete <strong>{initialName}</strong>? this action cannot be undone and will remove all associated design data, production checks, and version history.
                </p>
                <div className="flex justify-end gap-2">
                    <button
                        onClick={() => setShowDeleteModal(false)}
                        className="btn-secondary"
                        disabled={isPending}
                    >
                        cancel
                    </button>
                    <button
                        onClick={handleDelete}
                        className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-[var(--radius-sm)] transition-colors disabled:opacity-50"
                        disabled={isPending}
                    >
                        {isPending ? 'deleting...' : 'delete component'}
                    </button>
                </div>
            </Modal>
        </>
    );
}
