'use client';

/**
 * CompletenessPanel Component
 * 
 * Displays the completeness check result for a pricing set.
 */

import { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { checkPricingSetCompletenessAction, CompletenessResult } from '@/lib/quoter/pricing-actions';

interface CompletenessPanelProps {
    pricingSetId: string;
    refreshKey?: number;
}

export function CompletenessPanel({ pricingSetId, refreshKey }: CompletenessPanelProps) {
    const [result, setResult] = useState<CompletenessResult | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function check() {
            setIsLoading(true);
            try {
                const res = await checkPricingSetCompletenessAction(pricingSetId);
                setResult(res);
            } catch {
                setResult({ ok: false, missing: ['Failed to check completeness'], warnings: [] });
            } finally {
                setIsLoading(false);
            }
        }
        check();
    }, [pricingSetId, refreshKey]);

    if (isLoading) {
        return (
            <div className="p-4 bg-neutral-50 rounded-[var(--radius-sm)] border border-neutral-200">
                <div className="flex items-center gap-2 text-neutral-500">
                    <Loader2 size={16} className="animate-spin" />
                    <span className="text-sm">Checking completeness...</span>
                </div>
            </div>
        );
    }

    if (!result) return null;

    return (
        <div className={`p-4 rounded-[var(--radius-sm)] border ${result.ok
                ? 'bg-green-50 border-green-200'
                : 'bg-red-50 border-red-200'
            }`}>
            <div className="flex items-center gap-2 mb-2">
                {result.ok ? (
                    <>
                        <CheckCircle2 size={18} className="text-green-600" />
                        <span className="text-sm font-semibold text-green-800">Ready for activation</span>
                    </>
                ) : (
                    <>
                        <AlertCircle size={18} className="text-red-600" />
                        <span className="text-sm font-semibold text-red-800">Not ready for activation</span>
                    </>
                )}
            </div>

            {result.missing.length > 0 && (
                <div className="mt-2">
                    <p className="text-xs font-medium text-red-700 mb-1">Missing:</p>
                    <ul className="text-xs text-red-600 space-y-0.5">
                        {result.missing.map((item, i) => (
                            <li key={i}>• {item}</li>
                        ))}
                    </ul>
                </div>
            )}

            {result.warnings.length > 0 && (
                <div className="mt-2">
                    <p className="text-xs font-medium text-amber-700 mb-1 flex items-center gap-1">
                        <AlertTriangle size={12} />
                        Warnings:
                    </p>
                    <ul className="text-xs text-amber-600 space-y-0.5">
                        {result.warnings.map((item, i) => (
                            <li key={i}>• {item}</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
