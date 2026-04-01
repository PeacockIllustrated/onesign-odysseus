'use client';

import { useState, useEffect } from 'react';
import { getSitesForOrgAction } from '@/lib/clients/actions';
import type { OrgSite } from '@/lib/clients/types';

interface SitePickerProps {
    orgId: string | null;
    value: string | null;
    onChange: (siteId: string | null) => void;
    className?: string;
}

export function SitePicker({ orgId, value, onChange, className }: SitePickerProps) {
    const [sites, setSites] = useState<OrgSite[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!orgId) {
            setSites([]);
            onChange(null);
            return;
        }

        setLoading(true);
        getSitesForOrgAction(orgId)
            .then(setSites)
            .finally(() => setLoading(false));
        // Reset selection when org changes
        onChange(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orgId]);

    const formatSite = (s: OrgSite) => {
        const parts = [s.name];
        if (s.city || s.postcode) {
            const location = [s.city, s.postcode].filter(Boolean).join(', ');
            parts.push(`\u2014 ${location}`);
        }
        return parts.join(' ');
    };

    return (
        <select
            value={value || ''}
            onChange={e => onChange(e.target.value || null)}
            disabled={!orgId || loading}
            className={`w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-[#4e7e8c] disabled:bg-neutral-50 disabled:text-neutral-400 ${className || ''}`}
        >
            <option value="">
                {!orgId
                    ? '\u2014 Select a client first \u2014'
                    : loading
                    ? 'Loading sites...'
                    : '\u2014 Select site \u2014'}
            </option>
            {sites.map(s => (
                <option key={s.id} value={s.id}>{formatSite(s)}</option>
            ))}
        </select>
    );
}
