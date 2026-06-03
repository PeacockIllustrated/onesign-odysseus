'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createProductionPack } from '@/lib/production-packs/actions';

export function NewPackButton({ label = 'new pack' }: { label?: string }) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    async function create() {
        setLoading(true);
        const res = await createProductionPack({});
        if (res.ok) {
            router.push(`/admin/production-packs/${res.data.id}`);
        } else {
            setLoading(false);
            alert(res.error);
        }
    }

    return (
        <button className="btn-primary" onClick={create} disabled={loading}>
            {loading ? 'creating…' : label}
        </button>
    );
}
