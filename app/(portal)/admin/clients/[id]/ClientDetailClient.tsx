'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft, Edit2, Save, X, Loader2, Plus, Trash2,
    Star, MapPin, AlertCircle, Tag,
} from 'lucide-react';
import {
    updateOrgDetailsAction,
    createContactAction,
    updateContactAction,
    deleteContactAction,
    createSiteAction,
    updateSiteAction,
    deleteSiteAction,
    getClientDetailAction,
} from '@/lib/clients/actions';
import type {
    ClientWithDetails,
    Contact,
    ContactType,
    OrgSite,
} from '@/lib/clients/types';
import { ContactModal } from './ContactModal';
import { SiteModal } from './SiteModal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabKey = 'details' | 'contacts' | 'sites';

interface ClientDetailClientProps {
    client: ClientWithDetails;
    activityCounts: { quotes: number; jobs: number; invoices: number };
}

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const CONTACT_TYPE_COLORS: Record<ContactType, string> = {
    primary: 'bg-[#e8f0f3] text-[#4e7e8c]',
    billing: 'bg-blue-50 text-blue-700',
    site: 'bg-amber-50 text-amber-700',
    general: 'bg-neutral-100 text-neutral-600',
};

const inputCls =
    'w-full px-3 py-2 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-[#4e7e8c]';

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ClientDetailClient({ client: initialClient, activityCounts }: ClientDetailClientProps) {
    const router = useRouter();
    const [client, setClient] = useState(initialClient);
    const [activeTab, setActiveTab] = useState<TabKey>('details');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    async function refresh() {
        const updated = await getClientDetailAction(client.id);
        if (updated) setClient(updated);
    }

    const tabs: { key: TabKey; label: string; count?: number }[] = [
        { key: 'details', label: 'Details' },
        { key: 'contacts', label: 'Contacts', count: client.contacts.length },
        { key: 'sites', label: 'Sites', count: client.sites.length },
    ];

    return (
        <div className="p-6 max-w-4xl mx-auto">
            {/* Back link */}
            <div className="flex items-center gap-2 mb-6">
                <Link
                    href="/admin/clients"
                    className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900"
                >
                    <ArrowLeft size={14} />
                    Clients
                </Link>
                <span className="text-neutral-300">/</span>
                <span className="text-sm font-medium text-neutral-900">{client.name}</span>
            </div>

            {errorMessage && (
                <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <AlertCircle size={14} className="flex-shrink-0" />
                        <span className="text-sm font-medium">{errorMessage}</span>
                    </div>
                    <button onClick={() => setErrorMessage(null)}>
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* Tab bar */}
            <div className="flex gap-6 border-b border-neutral-200 mb-6">
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`pb-2.5 text-sm font-medium border-b-2 transition-colors ${
                            activeTab === tab.key
                                ? 'border-[#4e7e8c] text-[#4e7e8c]'
                                : 'border-transparent text-neutral-500 hover:text-neutral-900'
                        }`}
                    >
                        {tab.label}
                        {tab.count !== undefined && (
                            <span className="ml-1.5 text-xs text-neutral-400">({tab.count})</span>
                        )}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            {activeTab === 'details' && (
                <DetailsTab
                    client={client}
                    activityCounts={activityCounts}
                    onRefresh={refresh}
                    onError={setErrorMessage}
                />
            )}
            {activeTab === 'contacts' && (
                <ContactsTab
                    client={client}
                    onRefresh={refresh}
                    onError={setErrorMessage}
                />
            )}
            {activeTab === 'sites' && (
                <SitesTab
                    client={client}
                    onRefresh={refresh}
                    onError={setErrorMessage}
                />
            )}
        </div>
    );
}

// ===========================================================================
// Tab 1: Details
// ===========================================================================

function DetailsTab({
    client,
    activityCounts,
    onRefresh,
    onError,
}: {
    client: ClientWithDetails;
    activityCounts: { quotes: number; jobs: number; invoices: number };
    onRefresh: () => Promise<void>;
    onError: (msg: string) => void;
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const [form, setForm] = useState({
        name: client.name,
        phone: client.phone || '',
        email: client.email || '',
        website: client.website || '',
        business_type: client.business_type || '',
        account_number: client.account_number || '',
        company_reg_number: client.company_reg_number || '',
        vat_number: client.vat_number || '',
        tax_code: client.tax_code,
        currency: client.currency,
        payment_terms_days: String(client.payment_terms_days),
        sales_discount_percent: String(client.sales_discount_percent),
        notes: client.notes || '',
        tags: client.tags,
    });

    const [tagInput, setTagInput] = useState('');

    function resetForm() {
        setForm({
            name: client.name,
            phone: client.phone || '',
            email: client.email || '',
            website: client.website || '',
            business_type: client.business_type || '',
            account_number: client.account_number || '',
            company_reg_number: client.company_reg_number || '',
            vat_number: client.vat_number || '',
            tax_code: client.tax_code,
            currency: client.currency,
            payment_terms_days: String(client.payment_terms_days),
            sales_discount_percent: String(client.sales_discount_percent),
            notes: client.notes || '',
            tags: client.tags,
        });
        setTagInput('');
    }

    function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
        setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    }

    function addTag() {
        const t = tagInput.trim();
        if (t && !form.tags.includes(t)) {
            setForm((f) => ({ ...f, tags: [...f.tags, t] }));
        }
        setTagInput('');
    }

    function removeTag(tag: string) {
        setForm((f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) }));
    }

    async function handleSave() {
        setIsSaving(true);
        try {
            const result = await updateOrgDetailsAction({
                id: client.id,
                name: form.name,
                phone: form.phone || undefined,
                email: form.email || undefined,
                website: form.website || undefined,
                business_type: form.business_type || undefined,
                account_number: form.account_number || undefined,
                company_reg_number: form.company_reg_number || undefined,
                vat_number: form.vat_number || undefined,
                tax_code: form.tax_code,
                currency: form.currency,
                payment_terms_days: parseInt(form.payment_terms_days) || 30,
                sales_discount_percent: parseFloat(form.sales_discount_percent) || 0,
                notes: form.notes || undefined,
                tags: form.tags,
            });
            if ('error' in result) {
                onError(result.error);
            } else {
                setIsEditing(false);
                await onRefresh();
            }
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <div className="space-y-4">
            {/* Edit toggle */}
            <div className="flex justify-end">
                {!isEditing ? (
                    <button
                        onClick={() => setIsEditing(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-600 bg-neutral-100 hover:bg-neutral-200 rounded"
                    >
                        <Edit2 size={12} />
                        Edit
                    </button>
                ) : (
                    <div className="flex gap-2">
                        <button
                            onClick={() => {
                                setIsEditing(false);
                                resetForm();
                            }}
                            className="px-3 py-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-[#4e7e8c] text-white rounded hover:bg-[#3a5f6a] disabled:opacity-50"
                        >
                            {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                            Save
                        </button>
                    </div>
                )}
            </div>

            {/* Company Info */}
            <div className="border border-neutral-200 rounded-lg p-5">
                <h2 className="text-xs font-semibold text-neutral-400 uppercase mb-4">Company Info</h2>
                {isEditing ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Name</label>
                            <input name="name" value={form.name} onChange={handleChange} required className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Phone</label>
                            <input name="phone" value={form.phone} onChange={handleChange} className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Email</label>
                            <input name="email" type="email" value={form.email} onChange={handleChange} className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Website</label>
                            <input name="website" value={form.website} onChange={handleChange} className={inputCls} />
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                        <FieldDisplay label="Name" value={client.name} />
                        <FieldDisplay label="Phone" value={client.phone} />
                        <FieldDisplay label="Email" value={client.email} />
                        <FieldDisplay label="Website" value={client.website} />
                    </div>
                )}
            </div>

            {/* Business Details */}
            <div className="border border-neutral-200 rounded-lg p-5">
                <h2 className="text-xs font-semibold text-neutral-400 uppercase mb-4">Business Details</h2>
                {isEditing ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Business Type</label>
                            <input name="business_type" value={form.business_type} onChange={handleChange} className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Account Number</label>
                            <input name="account_number" value={form.account_number} onChange={handleChange} className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Company Reg</label>
                            <input name="company_reg_number" value={form.company_reg_number} onChange={handleChange} className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">VAT Number</label>
                            <input name="vat_number" value={form.vat_number} onChange={handleChange} className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Tax Code</label>
                            <input name="tax_code" value={form.tax_code} onChange={handleChange} className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Currency</label>
                            <select name="currency" value={form.currency} onChange={handleChange} className={inputCls}>
                                <option value="GBP">GBP</option>
                                <option value="EUR">EUR</option>
                                <option value="USD">USD</option>
                            </select>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                        <FieldDisplay label="Business Type" value={client.business_type} />
                        <FieldDisplay label="Account Number" value={client.account_number} />
                        <FieldDisplay label="Company Reg" value={client.company_reg_number} />
                        <FieldDisplay label="VAT Number" value={client.vat_number} />
                        <FieldDisplay label="Tax Code" value={client.tax_code} />
                        <FieldDisplay label="Currency" value={client.currency} />
                    </div>
                )}
            </div>

            {/* Financial */}
            <div className="border border-neutral-200 rounded-lg p-5">
                <h2 className="text-xs font-semibold text-neutral-400 uppercase mb-4">Financial</h2>
                {isEditing ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Payment Terms (days)</label>
                            <input
                                name="payment_terms_days"
                                type="number"
                                min="0"
                                value={form.payment_terms_days}
                                onChange={handleChange}
                                className={inputCls}
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Sales Discount (%)</label>
                            <input
                                name="sales_discount_percent"
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={form.sales_discount_percent}
                                onChange={handleChange}
                                className={inputCls}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-2 gap-4 text-sm">
                        <FieldDisplay label="Payment Terms" value={`${client.payment_terms_days} days`} />
                        <FieldDisplay label="Sales Discount" value={`${client.sales_discount_percent}%`} />
                    </div>
                )}
            </div>

            {/* Tags */}
            <div className="border border-neutral-200 rounded-lg p-5">
                <h2 className="text-xs font-semibold text-neutral-400 uppercase mb-4">Tags</h2>
                <div className="flex flex-wrap gap-2">
                    {(isEditing ? form.tags : client.tags).map((tag) => (
                        <span
                            key={tag}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-[#e8f0f3] text-[#4e7e8c] rounded-full"
                        >
                            <Tag size={10} />
                            {tag}
                            {isEditing && (
                                <button
                                    onClick={() => removeTag(tag)}
                                    className="ml-0.5 hover:text-red-600"
                                >
                                    <X size={10} />
                                </button>
                            )}
                        </span>
                    ))}
                    {(isEditing ? form.tags : client.tags).length === 0 && !isEditing && (
                        <span className="text-sm text-neutral-400">No tags</span>
                    )}
                </div>
                {isEditing && (
                    <div className="flex gap-2 mt-3">
                        <input
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    addTag();
                                }
                            }}
                            placeholder="Add a tag..."
                            className={inputCls + ' max-w-xs'}
                        />
                        <button
                            type="button"
                            onClick={addTag}
                            className="px-3 py-2 text-xs font-medium bg-neutral-100 hover:bg-neutral-200 rounded"
                        >
                            Add
                        </button>
                    </div>
                )}
            </div>

            {/* Notes */}
            <div className="border border-neutral-200 rounded-lg p-5">
                <h2 className="text-xs font-semibold text-neutral-400 uppercase mb-4">Notes</h2>
                {isEditing ? (
                    <textarea
                        name="notes"
                        value={form.notes}
                        onChange={handleChange}
                        rows={4}
                        className={inputCls}
                    />
                ) : (
                    <p className="text-sm text-neutral-700 whitespace-pre-wrap">
                        {client.notes || <span className="text-neutral-400">No notes</span>}
                    </p>
                )}
            </div>

            {/* Activity Summary */}
            <div className="border border-neutral-200 rounded-lg p-5">
                <h2 className="text-xs font-semibold text-neutral-400 uppercase mb-4">Activity Summary</h2>
                <div className="flex flex-wrap gap-4 text-sm">
                    <Link
                        href={`/admin/quotes?org=${client.id}`}
                        className="text-[#4e7e8c] hover:underline font-medium"
                    >
                        {activityCounts.quotes} Quotes
                    </Link>
                    <span className="text-neutral-300">·</span>
                    <Link
                        href={`/admin/jobs?org=${client.id}`}
                        className="text-[#4e7e8c] hover:underline font-medium"
                    >
                        {activityCounts.jobs} Jobs
                    </Link>
                    <span className="text-neutral-300">·</span>
                    <Link
                        href={`/admin/invoices?org=${client.id}`}
                        className="text-[#4e7e8c] hover:underline font-medium"
                    >
                        {activityCounts.invoices} Invoices
                    </Link>
                </div>
            </div>
        </div>
    );
}

// ===========================================================================
// Tab 2: Contacts
// ===========================================================================

function ContactsTab({
    client,
    onRefresh,
    onError,
}: {
    client: ClientWithDetails;
    onRefresh: () => Promise<void>;
    onError: (msg: string) => void;
}) {
    const [showModal, setShowModal] = useState(false);
    const [editingContact, setEditingContact] = useState<Contact | null>(null);
    const [isPending, startTransition] = useTransition();

    function handleAdd() {
        setEditingContact(null);
        setShowModal(true);
    }

    function handleEdit(contact: Contact) {
        setEditingContact(contact);
        setShowModal(true);
    }

    function handleDelete(contactId: string) {
        if (!confirm('Are you sure you want to delete this contact?')) return;
        startTransition(async () => {
            const result = await deleteContactAction(contactId);
            if ('error' in result) onError(result.error);
            else await onRefresh();
        });
    }

    function handleSetPrimary(contact: Contact) {
        startTransition(async () => {
            const result = await updateContactAction({ id: contact.id, is_primary: true });
            if ('error' in result) onError(result.error);
            else await onRefresh();
        });
    }

    async function handleModalSave(data: Record<string, unknown>) {
        if (editingContact) {
            const result = await updateContactAction({
                id: editingContact.id,
                ...data,
            } as any);
            if ('error' in result) {
                onError(result.error);
                return;
            }
        } else {
            const result = await createContactAction({
                org_id: client.id,
                ...data,
            } as any);
            if ('error' in result) {
                onError(result.error);
                return;
            }
        }
        setShowModal(false);
        await onRefresh();
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-neutral-900">
                    Contacts ({client.contacts.length})
                </h2>
                <button
                    onClick={handleAdd}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#4e7e8c] text-white rounded hover:bg-[#3a5f6a]"
                >
                    <Plus size={14} />
                    Add Contact
                </button>
            </div>

            {client.contacts.length === 0 ? (
                <div className="border border-neutral-200 rounded-lg px-5 py-8 text-center text-sm text-neutral-400">
                    No contacts yet. Add a contact to get started.
                </div>
            ) : (
                <div className="border border-neutral-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-neutral-50 border-b border-neutral-200">
                            <tr>
                                <th className="text-left px-5 py-2.5 text-[10px] font-semibold text-neutral-400 uppercase">Name</th>
                                <th className="text-left px-5 py-2.5 text-[10px] font-semibold text-neutral-400 uppercase">Email</th>
                                <th className="text-left px-5 py-2.5 text-[10px] font-semibold text-neutral-400 uppercase">Phone</th>
                                <th className="text-left px-5 py-2.5 text-[10px] font-semibold text-neutral-400 uppercase">Mobile</th>
                                <th className="text-left px-5 py-2.5 text-[10px] font-semibold text-neutral-400 uppercase">Type</th>
                                <th className="text-center px-3 py-2.5 text-[10px] font-semibold text-neutral-400 uppercase">Primary</th>
                                <th className="px-3 py-2.5 w-28" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                            {client.contacts.map((contact) => (
                                <tr key={contact.id} className="hover:bg-neutral-50">
                                    <td className="px-5 py-3 font-medium text-neutral-900">
                                        {contact.first_name} {contact.last_name}
                                        {contact.job_title && (
                                            <div className="text-xs text-neutral-400 font-normal">{contact.job_title}</div>
                                        )}
                                    </td>
                                    <td className="px-5 py-3 text-neutral-600">{contact.email || '-'}</td>
                                    <td className="px-5 py-3 text-neutral-600">{contact.phone || '-'}</td>
                                    <td className="px-5 py-3 text-neutral-600">{contact.mobile || '-'}</td>
                                    <td className="px-5 py-3">
                                        <span className={`inline-flex px-2 py-0.5 text-[10px] font-medium rounded-full ${CONTACT_TYPE_COLORS[contact.contact_type]}`}>
                                            {contact.contact_type}
                                        </span>
                                    </td>
                                    <td className="px-3 py-3 text-center">
                                        {contact.is_primary && (
                                            <Star size={14} className="inline text-amber-400 fill-amber-400" />
                                        )}
                                    </td>
                                    <td className="px-3 py-3">
                                        <div className="flex items-center justify-end gap-1">
                                            {!contact.is_primary && (
                                                <button
                                                    onClick={() => handleSetPrimary(contact)}
                                                    disabled={isPending}
                                                    title="Set as primary"
                                                    className="p-1 text-neutral-400 hover:text-amber-500 disabled:opacity-50"
                                                >
                                                    <Star size={13} />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleEdit(contact)}
                                                className="p-1 text-neutral-400 hover:text-neutral-900"
                                                title="Edit"
                                            >
                                                <Edit2 size={13} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(contact.id)}
                                                disabled={isPending}
                                                className="p-1 text-neutral-400 hover:text-red-600 disabled:opacity-50"
                                                title="Delete"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {showModal && (
                <ContactModal
                    contact={editingContact}
                    onSave={handleModalSave}
                    onClose={() => setShowModal(false)}
                />
            )}
        </div>
    );
}

// ===========================================================================
// Tab 3: Sites
// ===========================================================================

function SitesTab({
    client,
    onRefresh,
    onError,
}: {
    client: ClientWithDetails;
    onRefresh: () => Promise<void>;
    onError: (msg: string) => void;
}) {
    const [showModal, setShowModal] = useState(false);
    const [editingSite, setEditingSite] = useState<OrgSite | null>(null);
    const [isPending, startTransition] = useTransition();

    function handleAdd() {
        setEditingSite(null);
        setShowModal(true);
    }

    function handleEdit(site: OrgSite) {
        setEditingSite(site);
        setShowModal(true);
    }

    function handleDelete(siteId: string) {
        if (!confirm('Are you sure you want to delete this site?')) return;
        startTransition(async () => {
            const result = await deleteSiteAction(siteId);
            if ('error' in result) onError(result.error);
            else await onRefresh();
        });
    }

    function handleSetPrimary(site: OrgSite) {
        startTransition(async () => {
            const result = await updateSiteAction({ id: site.id, is_primary: true });
            if ('error' in result) onError(result.error);
            else await onRefresh();
        });
    }

    async function handleModalSave(data: Record<string, unknown>) {
        if (editingSite) {
            const result = await updateSiteAction({
                id: editingSite.id,
                ...data,
            } as any);
            if ('error' in result) {
                onError(result.error);
                return;
            }
        } else {
            const result = await createSiteAction({
                org_id: client.id,
                ...data,
            } as any);
            if ('error' in result) {
                onError(result.error);
                return;
            }
        }
        setShowModal(false);
        await onRefresh();
    }

    function formatAddress(site: OrgSite): string {
        return [site.address_line_1, site.city, site.postcode]
            .filter(Boolean)
            .join(', ');
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-neutral-900">
                    Sites ({client.sites.length})
                </h2>
                <button
                    onClick={handleAdd}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#4e7e8c] text-white rounded hover:bg-[#3a5f6a]"
                >
                    <Plus size={14} />
                    Add Site
                </button>
            </div>

            {client.sites.length === 0 ? (
                <div className="border border-neutral-200 rounded-lg px-5 py-8 text-center text-sm text-neutral-400">
                    No sites yet. Add a site to get started.
                </div>
            ) : (
                <div className="border border-neutral-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-neutral-50 border-b border-neutral-200">
                            <tr>
                                <th className="text-left px-5 py-2.5 text-[10px] font-semibold text-neutral-400 uppercase">Name</th>
                                <th className="text-left px-5 py-2.5 text-[10px] font-semibold text-neutral-400 uppercase">Address</th>
                                <th className="text-left px-5 py-2.5 text-[10px] font-semibold text-neutral-400 uppercase">Phone</th>
                                <th className="text-left px-5 py-2.5 text-[10px] font-semibold text-neutral-400 uppercase">Flags</th>
                                <th className="px-3 py-2.5 w-28" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                            {client.sites.map((site) => (
                                <tr key={site.id} className="hover:bg-neutral-50">
                                    <td className="px-5 py-3 font-medium text-neutral-900">{site.name}</td>
                                    <td className="px-5 py-3 text-neutral-600">
                                        <div className="flex items-center gap-1.5">
                                            <span>{formatAddress(site) || '-'}</span>
                                            {site.postcode && (
                                                <a
                                                    href={`https://www.google.com/maps?q=${encodeURIComponent(site.postcode)}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    title="Open in Google Maps"
                                                    className="text-neutral-400 hover:text-[#4e7e8c] flex-shrink-0"
                                                >
                                                    <MapPin size={12} />
                                                </a>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-5 py-3 text-neutral-600">{site.phone || '-'}</td>
                                    <td className="px-5 py-3">
                                        <div className="flex flex-wrap gap-1">
                                            {site.is_primary && (
                                                <span className="inline-flex px-2 py-0.5 text-[10px] font-medium rounded-full bg-[#e8f0f3] text-[#4e7e8c]">
                                                    Primary
                                                </span>
                                            )}
                                            {site.is_billing_address && (
                                                <span className="inline-flex px-2 py-0.5 text-[10px] font-medium rounded-full bg-blue-50 text-blue-700">
                                                    Billing
                                                </span>
                                            )}
                                            {site.is_delivery_address && (
                                                <span className="inline-flex px-2 py-0.5 text-[10px] font-medium rounded-full bg-green-50 text-green-700">
                                                    Delivery
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-3 py-3">
                                        <div className="flex items-center justify-end gap-1">
                                            {!site.is_primary && (
                                                <button
                                                    onClick={() => handleSetPrimary(site)}
                                                    disabled={isPending}
                                                    title="Set as primary"
                                                    className="p-1 text-neutral-400 hover:text-amber-500 disabled:opacity-50"
                                                >
                                                    <Star size={13} />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleEdit(site)}
                                                className="p-1 text-neutral-400 hover:text-neutral-900"
                                                title="Edit"
                                            >
                                                <Edit2 size={13} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(site.id)}
                                                disabled={isPending}
                                                className="p-1 text-neutral-400 hover:text-red-600 disabled:opacity-50"
                                                title="Delete"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {showModal && (
                <SiteModal
                    site={editingSite}
                    onSave={handleModalSave}
                    onClose={() => setShowModal(false)}
                />
            )}
        </div>
    );
}

// ===========================================================================
// Helpers
// ===========================================================================

function FieldDisplay({ label, value }: { label: string; value: string | null | undefined }) {
    return (
        <div>
            <div className="text-[10px] font-medium text-neutral-400 uppercase mb-0.5">{label}</div>
            <div className="text-neutral-900">{value || <span className="text-neutral-300">-</span>}</div>
        </div>
    );
}
