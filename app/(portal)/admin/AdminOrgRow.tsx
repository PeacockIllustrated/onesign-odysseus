'use client';

import { useState } from 'react';
import { Chip } from '@/app/(portal)/components/ui';
import { CalendarPlus, Loader2, Package } from 'lucide-react';

interface OrgRowProps {
    org: {
        id: string;
        name: string;
        slug: string;
        created_at: string;
    };
    memberCount: number;
    subscription?: {
        package_key: string;
        status: string;
    };
    deliverableCount: number;
}

export function AdminOrgRow({ org, memberCount, subscription, deliverableCount }: OrgRowProps) {
    const [generating, setGenerating] = useState(false);
    const [result, setResult] = useState<{ success?: boolean; error?: string; count?: number } | null>(null);

    async function handleGenerate() {
        setGenerating(true);
        setResult(null);

        // Get first day of current month
        const now = new Date();
        const month = new Date(now.getFullYear(), now.getMonth(), 1)
            .toISOString()
            .split('T')[0];

        try {
            const res = await fetch('/api/admin/generate-deliverables', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ org_id: org.id, month }),
            });

            const data = await res.json();

            if (res.ok) {
                setResult({ success: true, count: data.count });
            } else {
                setResult({ error: data.error || 'Failed to generate deliverables' });
            }
        } catch {
            setResult({ error: 'Network error' });
        } finally {
            setGenerating(false);
        }
    }

    const packageLabel = subscription?.package_key?.toUpperCase() || '—';
    const canGenerate = subscription?.status === 'active';

    return (
        <tr>
            <td className="px-4 py-3 text-sm font-medium text-neutral-900">{org.name}</td>
            <td className="px-4 py-3 text-xs font-mono text-neutral-500">{org.slug}</td>
            <td className="px-4 py-3">
                <Chip variant="default">{memberCount}</Chip>
            </td>
            <td className="px-4 py-3">
                {subscription ? (
                    <Chip variant={subscription.status === 'active' ? 'active' : 'paused'}>
                        <Package size={12} className="mr-1" />
                        {packageLabel}
                    </Chip>
                ) : (
                    <span className="text-xs text-neutral-400">No subscription</span>
                )}
            </td>
            <td className="px-4 py-3">
                <span className="text-sm text-neutral-600">{deliverableCount}</span>
            </td>
            <td className="px-4 py-3">
                {canGenerate ? (
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleGenerate}
                            disabled={generating}
                            className="btn-secondary text-xs flex items-center gap-1.5"
                        >
                            {generating ? (
                                <>
                                    <Loader2 size={12} className="animate-spin" />
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <CalendarPlus size={12} />
                                    Generate This Month
                                </>
                            )}
                        </button>
                        {result?.success && (
                            <span className="text-xs text-green-600">
                                ✓ Created {result.count} deliverables
                            </span>
                        )}
                        {result?.error && (
                            <span className="text-xs text-red-600">
                                {result.error}
                            </span>
                        )}
                    </div>
                ) : (
                    <span className="text-xs text-neutral-400">No active subscription</span>
                )}
            </td>
        </tr>
    );
}

