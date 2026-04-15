'use client';

/**
 * Client & Delivery card — shows client context inherited from upstream
 * (quote → production_job → artwork_job). Admin can override contact or
 * site on this artwork job independently of the parent chain.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MapPin, User, Phone, Mail, Edit2, Check, X } from 'lucide-react';
import { Card } from '@/app/(portal)/components/ui';
import { setArtworkClientContext } from '@/lib/artwork/actions';

interface Contact {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    contact_type: string | null;
    is_primary: boolean;
}

interface Site {
    id: string;
    name: string;
    address_line_1: string | null;
    address_line_2: string | null;
    city: string | null;
    county: string | null;
    postcode: string | null;
    country: string;
    is_primary: boolean;
    is_delivery_address: boolean;
}

interface Props {
    artworkJobId: string;
    clientName: string | null;
    clientId: string | null;
    currentContact: Contact | null;
    currentSite: Site | null;
    availableContacts: Contact[];
    availableSites: Site[];
    readOnly?: boolean;
}

function fullName(c: Contact) {
    return [c.first_name, c.last_name].filter(Boolean).join(' ');
}

function formatAddress(s: Site): string[] {
    return [s.address_line_1, s.address_line_2, s.city, s.county, s.postcode, s.country]
        .filter(Boolean) as string[];
}

export function ClientDeliveryCard({
    artworkJobId,
    clientName,
    clientId,
    currentContact,
    currentSite,
    availableContacts,
    availableSites,
    readOnly = false,
}: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [editing, setEditing] = useState<'contact' | 'site' | null>(null);
    const [pickedContact, setPickedContact] = useState(currentContact?.id ?? '');
    const [pickedSite, setPickedSite] = useState(currentSite?.id ?? '');
    const [error, setError] = useState<string | null>(null);

    const save = (field: 'contact' | 'site') => {
        setError(null);
        startTransition(async () => {
            const patch =
                field === 'contact'
                    ? { contact_id: pickedContact || null }
                    : { site_id: pickedSite || null };
            const res = await setArtworkClientContext(artworkJobId, patch);
            if ('error' in res) {
                setError(res.error);
                return;
            }
            setEditing(null);
            router.refresh();
        });
    };

    const cancel = () => {
        setEditing(null);
        setPickedContact(currentContact?.id ?? '');
        setPickedSite(currentSite?.id ?? '');
        setError(null);
    };

    return (
        <Card>
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-neutral-900 uppercase tracking-wider">
                    client &amp; delivery
                </h2>
            </div>

            {/* Client block */}
            <div className="mb-4 pb-4 border-b border-neutral-100">
                <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-500 mb-1">
                    client
                </p>
                {clientId ? (
                    <Link
                        href={`/admin/clients/${clientId}`}
                        className="text-sm font-semibold text-neutral-900 hover:underline"
                    >
                        {clientName ?? '—'}
                    </Link>
                ) : (
                    <p className="text-sm font-semibold text-neutral-900">
                        {clientName ?? <span className="text-neutral-400 italic">no client</span>}
                    </p>
                )}
            </div>

            {/* Contact block */}
            <div className="mb-4 pb-4 border-b border-neutral-100">
                <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">
                        contact
                    </p>
                    {!readOnly && editing !== 'contact' && (
                        <button
                            onClick={() => setEditing('contact')}
                            className="text-[11px] text-neutral-500 hover:text-neutral-900 inline-flex items-center gap-1"
                        >
                            <Edit2 size={10} />
                            change
                        </button>
                    )}
                </div>

                {editing === 'contact' ? (
                    <div className="space-y-2">
                        <select
                            value={pickedContact}
                            onChange={(e) => setPickedContact(e.target.value)}
                            className="w-full text-sm border border-neutral-200 rounded px-2 py-1.5"
                            disabled={pending}
                        >
                            <option value="">— no contact —</option>
                            {availableContacts.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {fullName(c)}
                                    {c.is_primary ? ' · primary' : ''}
                                    {c.contact_type ? ` · ${c.contact_type}` : ''}
                                </option>
                            ))}
                        </select>
                        <div className="flex gap-2">
                            <button
                                onClick={() => save('contact')}
                                disabled={pending}
                                className="text-[11px] btn-primary inline-flex items-center gap-1"
                            >
                                <Check size={10} /> save
                            </button>
                            <button
                                onClick={cancel}
                                disabled={pending}
                                className="text-[11px] btn-secondary inline-flex items-center gap-1"
                            >
                                <X size={10} /> cancel
                            </button>
                        </div>
                    </div>
                ) : currentContact ? (
                    <div className="space-y-1">
                        <p className="text-sm font-medium text-neutral-900 inline-flex items-center gap-1.5">
                            <User size={12} className="text-neutral-400" />
                            {fullName(currentContact)}
                        </p>
                        {currentContact.email && (
                            <p className="text-xs text-neutral-600 inline-flex items-center gap-1.5">
                                <Mail size={11} className="text-neutral-400" />
                                <a href={`mailto:${currentContact.email}`} className="hover:underline">
                                    {currentContact.email}
                                </a>
                            </p>
                        )}
                        {currentContact.phone && (
                            <p className="text-xs text-neutral-600 inline-flex items-center gap-1.5">
                                <Phone size={11} className="text-neutral-400" />
                                <a href={`tel:${currentContact.phone}`} className="hover:underline">
                                    {currentContact.phone}
                                </a>
                            </p>
                        )}
                    </div>
                ) : (
                    <p className="text-xs text-neutral-400 italic">no contact set</p>
                )}
            </div>

            {/* Site / delivery address block */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">
                        delivery / install address
                    </p>
                    {!readOnly && editing !== 'site' && (
                        <button
                            onClick={() => setEditing('site')}
                            className="text-[11px] text-neutral-500 hover:text-neutral-900 inline-flex items-center gap-1"
                        >
                            <Edit2 size={10} />
                            change
                        </button>
                    )}
                </div>

                {editing === 'site' ? (
                    <div className="space-y-2">
                        <select
                            value={pickedSite}
                            onChange={(e) => setPickedSite(e.target.value)}
                            className="w-full text-sm border border-neutral-200 rounded px-2 py-1.5"
                            disabled={pending}
                        >
                            <option value="">— no site —</option>
                            {availableSites.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.name}
                                    {s.is_delivery_address ? ' · delivery' : ''}
                                    {s.is_primary ? ' · primary' : ''}
                                </option>
                            ))}
                        </select>
                        <div className="flex gap-2">
                            <button
                                onClick={() => save('site')}
                                disabled={pending}
                                className="text-[11px] btn-primary inline-flex items-center gap-1"
                            >
                                <Check size={10} /> save
                            </button>
                            <button
                                onClick={cancel}
                                disabled={pending}
                                className="text-[11px] btn-secondary inline-flex items-center gap-1"
                            >
                                <X size={10} /> cancel
                            </button>
                        </div>
                    </div>
                ) : currentSite ? (
                    <div>
                        <p className="text-sm font-medium text-neutral-900 inline-flex items-center gap-1.5">
                            <MapPin size={12} className="text-neutral-400" />
                            {currentSite.name}
                        </p>
                        <div className="mt-1 text-xs text-neutral-600 leading-relaxed pl-[18px]">
                            {formatAddress(currentSite).map((line, i) => (
                                <div key={i}>{line}</div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <p className="text-xs text-neutral-400 italic">no site set</p>
                )}
            </div>

            {error && (
                <p className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
                    {error}
                </p>
            )}
        </Card>
    );
}
