'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Zap, AlertTriangle } from 'lucide-react';
import { activatePricingSetAction } from '@/lib/quoter/pricing-actions';

interface ActivateClientProps {
    pricingSetId: string;
    pricingSetName: string;
    isComplete: boolean;
    currentActiveName?: string;
}

export function ActivateClient({
    pricingSetId,
    pricingSetName,
    isComplete,
    currentActiveName,
}: ActivateClientProps) {
    const router = useRouter();
    const [isActivating, setIsActivating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirmed, setConfirmed] = useState(false);

    const handleActivate = async () => {
        if (!confirmed) {
            setError('Please confirm activation');
            return;
        }

        setIsActivating(true);
        setError(null);

        try {
            const result = await activatePricingSetAction(pricingSetId);

            if ('error' in result) {
                setError(result.error);
                return;
            }

            router.push('/app/admin/pricing');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Activation failed');
        } finally {
            setIsActivating(false);
        }
    };

    return (
        <div className="space-y-4">
            {!isComplete && (
                <div className="p-4 bg-red-50 rounded-[var(--radius-sm)] border border-red-200">
                    <div className="flex items-center gap-2 text-red-700">
                        <AlertTriangle size={16} />
                        <span className="text-sm font-medium">
                            Cannot activate incomplete rate card
                        </span>
                    </div>
                </div>
            )}

            {isComplete && (
                <>
                    {/* Confirmation checkbox */}
                    <label className="flex items-start gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={confirmed}
                            onChange={(e) => setConfirmed(e.target.checked)}
                            className="mt-0.5 w-4 h-4 rounded border-neutral-300 text-black focus:ring-black"
                        />
                        <span className="text-sm text-neutral-700">
                            I confirm that I want to activate <strong>&quot;{pricingSetName}&quot;</strong>
                            {currentActiveName && (
                                <> and archive the current active set <strong>&quot;{currentActiveName}&quot;</strong></>
                            )}
                            . This action will take effect immediately.
                        </span>
                    </label>

                    {error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-[var(--radius-sm)]">
                            <p className="text-sm text-red-700">{error}</p>
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200">
                        <button
                            type="button"
                            onClick={() => router.back()}
                            className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900"
                            disabled={isActivating}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleActivate}
                            disabled={isActivating || !confirmed}
                            className="px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-[var(--radius-sm)] hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {isActivating ? (
                                <Loader2 size={14} className="animate-spin" />
                            ) : (
                                <Zap size={14} />
                            )}
                            Activate Now
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
