'use client';

import { useState } from 'react';
import { createBrowserClient, type MarketingLead, type Org } from '@/lib/supabase';
import { Modal, Chip } from '@/app/(portal)/components/ui';
import { DIGITAL_PACKAGES, ACCELERATORS, getAcceleratorByKey, type GrowthPackage } from '@/lib/offers/onesignDigital';
import { Check, ChevronRight, Building2, User, Package, Loader2 } from 'lucide-react';

interface ConvertLeadWizardProps {
    lead: MarketingLead | null;
    open: boolean;
    onClose: () => void;
    onSuccess: (orgId: string) => void;
}

type WizardStep = 'org' | 'member' | 'package' | 'confirm' | 'success';

function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

export function ConvertLeadWizard({ lead, open, onClose, onSuccess }: ConvertLeadWizardProps) {
    const [step, setStep] = useState<WizardStep>('org');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form state
    const [orgName, setOrgName] = useState('');
    const [orgSlug, setOrgSlug] = useState('');
    const [memberEmail, setMemberEmail] = useState('');
    const [memberName, setMemberName] = useState('');
    const [selectedPackageId, setSelectedPackageId] = useState('');
    const [selectedAccelerators, setSelectedAccelerators] = useState<string[]>([]);
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);

    // Created data
    const [createdOrg, setCreatedOrg] = useState<Org | null>(null);

    // Initialize from lead data
    useState(() => {
        if (lead) {
            setOrgName(lead.company_name);
            setOrgSlug(slugify(lead.company_name));
            setMemberEmail(lead.contact_email);
            setMemberName(lead.contact_name);
            setSelectedPackageId(lead.package_key || '');
            setSelectedAccelerators(lead.accelerator_keys || []);
        }
    });

    const selectedPackage = DIGITAL_PACKAGES.find(p => p.id === selectedPackageId);

    function handleOrgNameChange(name: string) {
        setOrgName(name);
        setOrgSlug(slugify(name));
    }

    async function handleConvert() {
        if (!lead?.id) return;
        setLoading(true);
        setError(null);

        const supabase = createBrowserClient();

        try {
            // Step 1: Create org
            const { data: org, error: orgError } = await supabase
                .from('orgs')
                .insert({
                    name: orgName,
                    slug: orgSlug,
                })
                .select()
                .single();

            if (orgError) throw new Error(`Failed to create org: ${orgError.message}`);

            // Step 2: Find or note profile (member will need to accept invite)
            // For now, we'll look up the profile by email
            const { data: profile } = await supabase
                .from('profiles')
                .select('id')
                .eq('email', memberEmail)
                .single();

            // If profile exists, create membership
            if (profile) {
                const { error: memberError } = await supabase
                    .from('org_members')
                    .insert({
                        org_id: org.id,
                        user_id: profile.id,
                        role: 'owner',
                    });

                if (memberError) {
                    console.warn('Could not add member:', memberError.message);
                    // TODO: Email seam - Send invite email to memberEmail
                }
            } else {
                // TODO: Email seam - Send invite email to memberEmail
                console.log('Profile not found, would send invite to:', memberEmail);
            }

            // Step 3: Create subscription
            if (selectedPackageId && selectedPackage) {
                const termMonths = parseInt(selectedPackage.term) || 3;
                const adSpendMatch = selectedPackage.adSpendIncluded.match(/£([\d,]+)/);
                const adSpendPence = adSpendMatch ? parseInt(adSpendMatch[1].replace(',', '')) * 100 : null;

                const { error: subError } = await supabase
                    .from('subscriptions')
                    .insert({
                        org_id: org.id,
                        package_key: selectedPackageId,
                        term_months: termMonths,
                        ad_spend_included: adSpendPence,
                        status: 'active',
                        start_date: startDate,
                    });

                if (subError) console.warn('Could not create subscription:', subError.message);

                // Create accelerators
                for (const accKey of selectedAccelerators) {
                    await supabase
                        .from('subscription_accelerators')
                        .insert({
                            org_id: org.id,
                            accelerator_key: accKey,
                            status: 'active',
                            start_date: startDate,
                        });
                }
            }

            // Step 4: Update lead as converted
            await supabase
                .from('marketing_leads')
                .update({
                    status: 'converted',
                    org_id: org.id,
                    converted_at: new Date().toISOString(),
                })
                .eq('id', lead.id);

            setCreatedOrg(org);
            setStep('success');

            // TODO: Email seam - Send welcome email on org creation

        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setLoading(false);
        }
    }

    function handleClose() {
        if (createdOrg) {
            onSuccess(createdOrg.id);
        }
        setStep('org');
        setError(null);
        onClose();
    }

    if (!lead) return null;

    const steps: { key: WizardStep; label: string; icon: typeof Building2 }[] = [
        { key: 'org', label: 'Create Org', icon: Building2 },
        { key: 'member', label: 'Add Member', icon: User },
        { key: 'package', label: 'Assign Package', icon: Package },
        { key: 'confirm', label: 'Confirm', icon: Check },
    ];

    return (
        <Modal open={open} onClose={handleClose} title="Convert Lead to Client">
            <div className="w-full sm:min-w-[500px]">
                {/* Progress Steps */}
                {step !== 'success' && (
                    <div className="flex items-center justify-between mb-6 px-4">
                        {steps.map((s, i) => {
                            const Icon = s.icon;
                            const isActive = s.key === step;
                            const isPast = steps.findIndex(st => st.key === step) > i;

                            return (
                                <div key={s.key} className="flex items-center">
                                    <div className={`
                                        w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                                        ${isActive ? 'bg-black text-white' : isPast ? 'bg-green-500 text-white' : 'bg-neutral-100 text-neutral-400'}
                                    `}>
                                        {isPast ? <Check size={14} /> : <Icon size={14} />}
                                    </div>
                                    {i < steps.length - 1 && (
                                        <div className={`w-12 h-0.5 mx-2 ${isPast ? 'bg-green-500' : 'bg-neutral-200'}`} />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {error && (
                    <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">
                        {error}
                    </div>
                )}

                {/* Step: Create Org */}
                {step === 'org' && (
                    <div className="space-y-4">
                        <h3 className="font-semibold text-neutral-900">Create Organisation</h3>
                        <p className="text-sm text-neutral-500">
                            Create a new org for <strong>{lead.company_name}</strong>
                        </p>

                        <div>
                            <label className="block text-sm font-medium text-neutral-700 mb-1">
                                Organisation Name
                            </label>
                            <input
                                type="text"
                                value={orgName}
                                onChange={(e) => handleOrgNameChange(e.target.value)}
                                className="w-full px-3 py-2 border border-neutral-200 rounded-md"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-neutral-700 mb-1">
                                Slug (URL-friendly)
                            </label>
                            <input
                                type="text"
                                value={orgSlug}
                                onChange={(e) => setOrgSlug(e.target.value)}
                                className="w-full px-3 py-2 border border-neutral-200 rounded-md font-mono text-sm"
                            />
                        </div>

                        <div className="flex justify-end pt-4">
                            <button onClick={() => setStep('member')} className="btn-primary">
                                Next <ChevronRight size={16} className="ml-1" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Step: Add Member */}
                {step === 'member' && (
                    <div className="space-y-4">
                        <h3 className="font-semibold text-neutral-900">Add Owner</h3>
                        <p className="text-sm text-neutral-500">
                            Set up the primary contact as org owner
                        </p>

                        <div>
                            <label className="block text-sm font-medium text-neutral-700 mb-1">
                                Name
                            </label>
                            <input
                                type="text"
                                value={memberName}
                                onChange={(e) => setMemberName(e.target.value)}
                                className="w-full px-3 py-2 border border-neutral-200 rounded-md"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-neutral-700 mb-1">
                                Email
                            </label>
                            <input
                                type="email"
                                value={memberEmail}
                                onChange={(e) => setMemberEmail(e.target.value)}
                                className="w-full px-3 py-2 border border-neutral-200 rounded-md"
                            />
                        </div>

                        <div className="flex justify-between pt-4">
                            <button onClick={() => setStep('org')} className="btn-secondary">
                                Back
                            </button>
                            <button onClick={() => setStep('package')} className="btn-primary">
                                Next <ChevronRight size={16} className="ml-1" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Step: Assign Package */}
                {step === 'package' && (
                    <div className="space-y-4">
                        <h3 className="font-semibold text-neutral-900">Assign Package</h3>

                        <div className="space-y-3">
                            {DIGITAL_PACKAGES.map(pkg => (
                                <label
                                    key={pkg.id}
                                    className={`
                                        block p-4 border rounded-lg cursor-pointer transition-all
                                        ${selectedPackageId === pkg.id
                                            ? 'border-black bg-neutral-50'
                                            : 'border-neutral-200 hover:border-neutral-300'}
                                    `}
                                >
                                    <div className="flex items-start gap-3">
                                        <input
                                            type="radio"
                                            name="package"
                                            value={pkg.id}
                                            checked={selectedPackageId === pkg.id}
                                            onChange={(e) => setSelectedPackageId(e.target.value)}
                                            className="mt-1"
                                        />
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between">
                                                <span className="font-bold">{pkg.name}</span>
                                                <span className="font-bold">
                                                    £{typeof pkg.price === 'number' ? pkg.price.toLocaleString() : pkg.price}
                                                    <span className="text-sm font-normal text-neutral-500"> {pkg.priceSuffix}</span>
                                                </span>
                                            </div>
                                            <p className="text-sm text-neutral-600 mt-1">{pkg.positioningLine}</p>
                                            <div className="flex gap-4 mt-2 text-xs text-neutral-500">
                                                <span>{pkg.term}</span>
                                                <span>{pkg.adSpendIncluded} ad spend</span>
                                            </div>
                                        </div>
                                    </div>
                                </label>
                            ))}
                        </div>

                        {/* Accelerators */}
                        <div className="pt-4">
                            <h4 className="text-sm font-medium text-neutral-700 mb-2">Accelerators</h4>
                            <div className="space-y-2 max-h-40 overflow-y-auto">
                                {ACCELERATORS.flatMap(cat => cat.items).map(acc => (
                                    <label key={acc.key} className="flex items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            checked={selectedAccelerators.includes(acc.key)}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSelectedAccelerators([...selectedAccelerators, acc.key]);
                                                } else {
                                                    setSelectedAccelerators(selectedAccelerators.filter(k => k !== acc.key));
                                                }
                                            }}
                                        />
                                        <span>{acc.title}</span>
                                        <span className="text-neutral-400 ml-auto">{acc.price}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-neutral-700 mb-1">
                                Start Date
                            </label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full px-3 py-2 border border-neutral-200 rounded-md"
                            />
                        </div>

                        <div className="flex justify-between pt-4">
                            <button onClick={() => setStep('member')} className="btn-secondary">
                                Back
                            </button>
                            <button onClick={() => setStep('confirm')} className="btn-primary">
                                Next <ChevronRight size={16} className="ml-1" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Step: Confirm */}
                {step === 'confirm' && (
                    <div className="space-y-4">
                        <h3 className="font-semibold text-neutral-900">Confirm Conversion</h3>

                        <div className="bg-neutral-50 rounded-lg p-4 space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-neutral-500">Organisation:</span>
                                <span className="font-medium">{orgName}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-neutral-500">Owner:</span>
                                <span className="font-medium">{memberName} ({memberEmail})</span>
                            </div>
                            {selectedPackage && (
                                <>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-neutral-500">Package:</span>
                                        <span className="font-medium">{selectedPackage.name}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-neutral-500">Price:</span>
                                        <span className="font-medium">
                                            £{typeof selectedPackage.price === 'number' ? selectedPackage.price.toLocaleString() : selectedPackage.price}
                                            {selectedPackage.priceSuffix}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-neutral-500">Term:</span>
                                        <span>{selectedPackage.term}</span>
                                    </div>
                                </>
                            )}
                            {selectedAccelerators.length > 0 && (
                                <div className="text-sm">
                                    <span className="text-neutral-500">Accelerators:</span>
                                    <div className="mt-1 flex flex-wrap gap-1">
                                        {selectedAccelerators.map(key => {
                                            const acc = getAcceleratorByKey(key);
                                            return acc ? (
                                                <Chip key={key} variant="default">{acc.title}</Chip>
                                            ) : null;
                                        })}
                                    </div>
                                </div>
                            )}
                            <div className="flex justify-between text-sm">
                                <span className="text-neutral-500">Start Date:</span>
                                <span>{new Date(startDate).toLocaleDateString('en-GB')}</span>
                            </div>
                        </div>

                        <div className="flex justify-between pt-4">
                            <button onClick={() => setStep('package')} className="btn-secondary">
                                Back
                            </button>
                            <button
                                onClick={handleConvert}
                                disabled={loading}
                                className="btn-primary flex items-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin" />
                                        Converting...
                                    </>
                                ) : (
                                    <>
                                        <Check size={16} />
                                        Convert Lead
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {/* Step: Success */}
                {step === 'success' && createdOrg && (
                    <div className="text-center py-8">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Check size={32} className="text-green-600" />
                        </div>
                        <h3 className="font-bold text-lg text-neutral-900 mb-2">Lead Converted!</h3>
                        <p className="text-sm text-neutral-500 mb-6">
                            <strong>{createdOrg.name}</strong> has been created successfully.
                        </p>
                        <div className="space-y-2">
                            <button onClick={handleClose} className="btn-primary w-full">
                                Close
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}

