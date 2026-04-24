'use client';

import { useState, useTransition } from 'react';
import {
    generateProductionApprovalLink,
    revokeProductionApproval,
} from '@/lib/artwork/production-approval-actions';
import { Card, Chip } from '@/app/(portal)/components/ui';
import { formatDateTime } from '@/lib/artwork/utils';
import { HardHat, Copy, Check, X, Send } from 'lucide-react';

interface Props {
    jobId: string;
    activeApproval: {
        id: string;
        token: string;
        created_at: string;
        completed_at: string | null;
        revoked_at: string | null;
    } | null;
}

export function ProductionApprovalLinkSection({ jobId, activeApproval }: Props) {
    const [copied, setCopied] = useState(false);
    const [generatedToken, setGeneratedToken] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const liveToken =
        generatedToken ??
        (activeApproval && !activeApproval.revoked_at && !activeApproval.completed_at
            ? activeApproval.token
            : null);

    const linkUrl =
        liveToken && typeof window !== 'undefined'
            ? `${window.location.origin}/production-sign-off/${liveToken}`
            : liveToken
            ? `/production-sign-off/${liveToken}`
            : null;

    const handleGenerate = () => {
        setError(null);
        startTransition(async () => {
            const result = await generateProductionApprovalLink(jobId);
            if ('error' in result) setError(result.error);
            else setGeneratedToken(result.token);
        });
    };

    const handleCopy = async () => {
        if (!linkUrl) return;
        try {
            await navigator.clipboard.writeText(linkUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            const ta = document.createElement('textarea');
            ta.value = linkUrl;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleRevoke = () => {
        if (!activeApproval) return;
        setError(null);
        startTransition(async () => {
            const result = await revokeProductionApproval(activeApproval.id, jobId);
            if ('error' in result) setError(result.error);
            else setGeneratedToken(null);
        });
    };

    const isCompleted = activeApproval?.completed_at && !activeApproval.revoked_at;
    const isLive = !!liveToken;

    return (
        <Card>
            <div className="flex items-center gap-2 mb-3">
                <HardHat size={14} className="text-neutral-400" />
                <h3 className="text-sm font-semibold text-neutral-900">
                    production sign-off
                </h3>
            </div>
            <p className="text-[11px] text-neutral-500 mb-3 leading-relaxed">
                internal link for chris / john to tick off each sub-item before release to production.
            </p>

            {error && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5 mb-3">
                    {error}
                </div>
            )}

            {isCompleted && (
                <div className="space-y-2 mb-3">
                    <Chip variant="approved">all components signed off</Chip>
                    <div className="text-xs text-neutral-500">
                        completed {formatDateTime(activeApproval!.completed_at!)}
                    </div>
                </div>
            )}

            {isLive && (
                <div className="space-y-2">
                    <Chip variant="scheduled">active link</Chip>
                    {linkUrl && (
                        <div className="flex items-center gap-1">
                            <input
                                type="text"
                                readOnly
                                value={linkUrl}
                                className="flex-1 text-xs bg-neutral-50 border border-neutral-200 rounded px-2 py-1.5 font-mono truncate"
                            />
                            <button
                                onClick={handleCopy}
                                className="p-1.5 border border-neutral-200 rounded hover:bg-neutral-50 transition-colors"
                                title="Copy link"
                            >
                                {copied ? (
                                    <Check size={14} className="text-green-600" />
                                ) : (
                                    <Copy size={14} className="text-neutral-400" />
                                )}
                            </button>
                        </div>
                    )}
                    <button
                        onClick={handleRevoke}
                        disabled={isPending}
                        className="text-xs text-red-600 hover:text-red-700 inline-flex items-center gap-1"
                    >
                        <X size={12} />
                        revoke link
                    </button>
                </div>
            )}

            {!isLive && (
                <button
                    onClick={handleGenerate}
                    disabled={isPending}
                    className="btn-primary w-full text-xs inline-flex items-center justify-center gap-1"
                >
                    <Send size={12} />
                    {isPending
                        ? 'generating...'
                        : isCompleted
                        ? 'mint new link'
                        : 'send for production approval'}
                </button>
            )}
        </Card>
    );
}
