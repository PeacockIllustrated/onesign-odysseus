'use client';

import { useState, useEffect } from 'react';
import { getContactsForOrgAction } from '@/lib/clients/actions';
import type { Contact } from '@/lib/clients/types';

interface ContactPickerProps {
    orgId: string | null;
    value: string | null;
    onChange: (contactId: string | null) => void;
    className?: string;
}

export function ContactPicker({ orgId, value, onChange, className }: ContactPickerProps) {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!orgId) {
            setContacts([]);
            onChange(null);
            return;
        }

        setLoading(true);
        getContactsForOrgAction(orgId)
            .then(setContacts)
            .finally(() => setLoading(false));
        // Reset selection when org changes
        onChange(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orgId]);

    const formatContact = (c: Contact) => {
        const name = `${c.first_name} ${c.last_name}`;
        return c.email ? `${name} (${c.email})` : name;
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
                    ? 'Loading contacts...'
                    : '\u2014 Select contact \u2014'}
            </option>
            {contacts.map(c => (
                <option key={c.id} value={c.id}>{formatContact(c)}</option>
            ))}
        </select>
    );
}
