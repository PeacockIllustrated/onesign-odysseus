'use client';

import { useState } from 'react';
import { createBrowserClient } from '@/lib/supabase';
import { Modal, Chip } from '@/app/(portal)/components/ui';
import { Loader2 } from 'lucide-react';

interface CreateOrgModalProps {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

export function CreateOrgModal({ open, onClose, onSuccess }: CreateOrgModalProps) {
    const [name, setName] = useState('');
    const [slug, setSlug] = useState('');
    const [ownerEmail, setOwnerEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    function handleNameChange(value: string) {
        setName(value);
        setSlug(slugify(value));
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim() || !slug.trim()) return;

        setLoading(true);
        setError(null);

        const supabase = createBrowserClient();

        try {
            // Call the secure RPC function to create org and link owner
            const { data, error } = await supabase.rpc('create_new_org', {
                org_name: name.trim(),
                org_slug: slug.trim(),
                owner_email_opt: ownerEmail.trim() || null
            });

            if (error) throw error;

            setName('');
            setSlug('');
            setOwnerEmail('');
            onSuccess();
            onClose();
        } catch (err) {
            console.error('Error creating org:', err);
            setError(err instanceof Error ? err.message : 'Failed to create org');
        } finally {
            setLoading(false);
        }
    }

    return (
        <Modal open={open} onClose={onClose} title="Create Organisation">
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>
                )}

                <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Organisation Name *
                    </label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => handleNameChange(e.target.value)}
                        className="w-full px-3 py-2 border border-neutral-200 rounded-md"
                        required
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Slug *
                    </label>
                    <input
                        type="text"
                        value={slug}
                        onChange={(e) => setSlug(e.target.value)}
                        className="w-full px-3 py-2 border border-neutral-200 rounded-md font-mono text-sm"
                        required
                    />
                    <p className="text-xs text-neutral-400 mt-1">URL-friendly identifier</p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Owner Email (optional)
                    </label>
                    <input
                        type="email"
                        value={ownerEmail}
                        onChange={(e) => setOwnerEmail(e.target.value)}
                        className="w-full px-3 py-2 border border-neutral-200 rounded-md"
                        placeholder="user@example.com"
                    />
                    <p className="text-xs text-neutral-400 mt-1">Links existing user as org owner</p>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                    <button type="button" onClick={onClose} className="btn-secondary">
                        Cancel
                    </button>
                    <button type="submit" disabled={loading} className="btn-primary flex items-center gap-2">
                        {loading && <Loader2 size={16} className="animate-spin" />}
                        Create
                    </button>
                </div>
            </form>
        </Modal>
    );
}

