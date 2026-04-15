'use client';

import { useState, useEffect } from 'react';
import { getClientListAction } from '@/lib/clients/actions';

interface OrgPickerProps {
    value: string | null;
    onChange: (orgId: string | null, orgName: string) => void;
    className?: string;
}

export function OrgPicker({ value, onChange, className }: OrgPickerProps) {
    const [orgs, setOrgs] = useState<Array<{ id: string; name: string }>>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getClientListAction()
            .then(clients => setOrgs(clients.map(c => ({ id: c.id, name: c.name }))))
            .finally(() => setLoading(false));
    }, []);

    return (
        <select
            value={value || ''}
            onChange={e => {
                const id = e.target.value || null;
                const name = orgs.find(o => o.id === id)?.name || '';
                onChange(id, name);
            }}
            disabled={loading}
            className={`w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-[#4e7e8c] ${className || ''}`}
        >
            <option value="">{loading ? 'Loading clients...' : '\u2014 Select client \u2014'}</option>
            {orgs.map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
            ))}
        </select>
    );
}
