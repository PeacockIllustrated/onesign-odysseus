'use client';

import { useState } from 'react';
import { createBrowserClient, type MarketingLead } from '@/lib/supabase';
import { Modal, Chip } from '@/app/(portal)/components/ui';
import { DIGITAL_PACKAGES, getAcceleratorByKey } from '@/lib/offers/onesignDigital';
import { User, Building2, Globe, Phone, Mail, Calendar, Package, Zap, MapPin, Briefcase } from 'lucide-react';

interface LeadDetailModalProps {
    lead: MarketingLead | null;
    open: boolean;
    onClose: () => void;
    onStatusChange: (leadId: string, newStatus: string) => void;
    onConvert: (lead: MarketingLead) => void;
}

const statusOptions = ['new', 'contacted', 'qualified', 'converted', 'lost'];

export function LeadDetailModal({ lead, open, onClose, onStatusChange, onConvert }: LeadDetailModalProps) {
    const [updating, setUpdating] = useState(false);

    if (!lead) return null;

    const selectedPackage = DIGITAL_PACKAGES.find(p => p.id === lead.package_key);
    const selectedAccelerators = (lead.accelerator_keys || []).map(key => getAcceleratorByKey(key)).filter(Boolean);

    async function handleStatusChange(newStatus: string) {
        if (!lead?.id) return;
        setUpdating(true);

        const supabase = createBrowserClient();
        await supabase
            .from('marketing_leads')
            .update({ status: newStatus })
            .eq('id', lead.id);

        onStatusChange(lead.id, newStatus);
        setUpdating(false);
    }

    return (
        <Modal open={open} onClose={onClose} title="Lead Details">
            <div className="space-y-6">
                {/* Contact Info */}
                <section>
                    <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                        <User size={14} /> Contact
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div>
                            <span className="text-neutral-500">Name:</span>
                            <p className="font-medium text-neutral-900">{lead.contact_name}</p>
                        </div>
                        <div>
                            <span className="text-neutral-500">Role:</span>
                            <p className="font-medium text-neutral-900">{lead.contact_role || '—'}</p>
                        </div>
                        <div className="flex items-center gap-1">
                            <Mail size={12} className="text-neutral-400" />
                            <a href={`mailto:${lead.contact_email}`} className="text-blue-600 hover:underline">
                                {lead.contact_email}
                            </a>
                        </div>
                        <div className="flex items-center gap-1">
                            <Phone size={12} className="text-neutral-400" />
                            <span>{lead.contact_phone || '—'}</span>
                        </div>
                    </div>
                </section>

                {/* Business Info */}
                <section>
                    <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                        <Building2 size={14} /> Business
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div>
                            <span className="text-neutral-500">Company:</span>
                            <p className="font-medium text-neutral-900">{lead.company_name}</p>
                        </div>
                        <div className="flex items-center gap-1">
                            <Globe size={12} className="text-neutral-400" />
                            {lead.company_website ? (
                                <a href={lead.company_website} target="_blank" rel="noopener" className="text-blue-600 hover:underline truncate">
                                    {lead.company_website.replace(/^https?:\/\//, '')}
                                </a>
                            ) : '—'}
                        </div>
                        <div>
                            <span className="text-neutral-500">Industry:</span>
                            <p>{lead.industry_type || '—'}</p>
                        </div>
                        <div className="flex items-center gap-1">
                            <MapPin size={12} className="text-neutral-400" />
                            <span>{(lead.service_areas || []).join(', ') || '—'}</span>
                        </div>
                    </div>
                </section>

                {/* Commercial Details */}
                <section>
                    <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                        <Briefcase size={14} /> Commercial
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div>
                            <span className="text-neutral-500">Avg Job Value:</span>
                            <p>{lead.avg_job_value || '—'}</p>
                        </div>
                        <div>
                            <span className="text-neutral-500">Capacity/Week:</span>
                            <p>{lead.capacity_per_week || '—'}</p>
                        </div>
                        <div>
                            <span className="text-neutral-500">Coverage:</span>
                            <p>{lead.coverage_radius || '—'}</p>
                        </div>
                        <div>
                            <span className="text-neutral-500">Ideal Customer:</span>
                            <p>{lead.ideal_customer || '—'}</p>
                        </div>
                    </div>
                </section>

                {/* Package Interest */}
                {selectedPackage && (
                    <section className="bg-neutral-50 rounded-lg p-4">
                        <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                            <Package size={14} /> Package Interest
                        </h3>
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="font-bold text-neutral-900">{selectedPackage.name}</p>
                                <p className="text-sm text-neutral-600">{selectedPackage.positioningLine}</p>
                            </div>
                            <div className="text-right">
                                <p className="font-bold text-neutral-900">
                                    £{typeof selectedPackage.price === 'number' ? selectedPackage.price.toLocaleString() : selectedPackage.price}
                                    <span className="text-sm font-normal text-neutral-500"> {selectedPackage.priceSuffix}</span>
                                </p>
                                <p className="text-xs text-neutral-500">{selectedPackage.term} • {selectedPackage.adSpendIncluded} ad spend</p>
                            </div>
                        </div>
                    </section>
                )}

                {/* Accelerators */}
                {selectedAccelerators.length > 0 && (
                    <section>
                        <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                            <Zap size={14} /> Accelerators
                        </h3>
                        <div className="space-y-2">
                            {selectedAccelerators.map(acc => acc && (
                                <div key={acc.key} className="flex justify-between text-sm">
                                    <span>{acc.title}</span>
                                    <span className="text-neutral-500">{acc.price}</span>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* Status & Actions */}
                <section className="border-t border-neutral-200 pt-4">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-neutral-500">Status:</span>
                            <select
                                value={lead.status || 'new'}
                                onChange={(e) => handleStatusChange(e.target.value)}
                                disabled={updating}
                                className="text-sm border border-neutral-200 rounded px-2 py-1 bg-white"
                            >
                                {statusOptions.map(s => (
                                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-neutral-400">
                            <Calendar size={12} />
                            {lead.created_at ? new Date(lead.created_at).toLocaleDateString('en-GB') : '—'}
                        </div>
                    </div>

                    {lead.notes && (
                        <div className="mb-4 p-3 bg-amber-50 rounded text-sm text-amber-800">
                            <strong>Notes:</strong> {lead.notes}
                        </div>
                    )}

                    {lead.status !== 'converted' && (
                        <button
                            onClick={() => onConvert(lead)}
                            className="w-full btn-primary"
                        >
                            Convert to Client
                        </button>
                    )}
                </section>
            </div>
        </Modal>
    );
}

