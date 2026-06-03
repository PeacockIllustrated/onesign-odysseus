'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Copy, Trash2 } from 'lucide-react';
import { duplicateProductionPack, deleteProductionPack } from '@/lib/production-packs/actions';

export function RowActions({ id, title }: { id: string; title: string }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);

    async function duplicate() {
        setBusy(true);
        const res = await duplicateProductionPack(id);
        if (res.ok) {
            router.push(`/admin/production-packs/${res.data.id}`);
        } else {
            setBusy(false);
            alert(res.error);
        }
    }

    async function remove() {
        if (!confirm(`Delete “${title}”? This cannot be undone.`)) return;
        setBusy(true);
        const res = await deleteProductionPack(id);
        if (res.ok) {
            router.refresh();
        } else {
            setBusy(false);
            alert(res.error);
        }
    }

    return (
        <div className="flex items-center gap-1 justify-end">
            <button
                onClick={duplicate}
                disabled={busy}
                title="Duplicate"
                className="p-1.5 text-neutral-400 hover:text-black hover:bg-neutral-100 rounded-[var(--radius-sm)] transition-colors disabled:opacity-50"
            >
                <Copy size={15} />
            </button>
            <button
                onClick={remove}
                disabled={busy}
                title="Delete"
                className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-[var(--radius-sm)] transition-colors disabled:opacity-50"
            >
                <Trash2 size={15} />
            </button>
        </div>
    );
}
