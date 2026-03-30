'use client';

import { useState, useTransition } from 'react';
import { generateApprovalLink, revokeApproval } from '@/lib/artwork/approval-actions';
import type { ArtworkApproval } from '@/lib/artwork/approval-types';
import { Card, Chip } from '@/app/(portal)/components/ui';
import { formatDateTime } from '@/lib/artwork/utils';
import { Link2, Copy, Check, X, Send } from 'lucide-react';

interface Props {
    jobId: string;
    approval: ArtworkApproval | null;
    hasSignedOffComponents: boolean;
}

export function ApprovalLinkSection({ jobId, approval, hasSignedOffComponents }: Props) {
    const [copied, setCopied] = useState(false);
    const [generatedToken, setGeneratedToken] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const currentApproval = approval;
    const isPending_ = currentApproval?.status === 'pending';
    const isApproved = currentApproval?.status === 'approved';
    const isExpired = currentApproval?.status === 'expired' ||
        (currentApproval && currentApproval.status === 'pending' && new Date(currentApproval.expires_at) < new Date());

    const activeToken = generatedToken || (isPending_ && !isExpired ? currentApproval?.token : null);
    const approvalUrl = activeToken ? `${typeof window !== 'undefined' ? window.location.origin : ''}/approve/artwork/${activeToken}` : null;

    const handleGenerate = () => {
        setError(null);
        startTransition(async () => {
            const result = await generateApprovalLink(jobId);
            if ('error' in result) {
                setError(result.error);
            } else {
                setGeneratedToken(result.token);
            }
        });
    };

    const handleCopy = async () => {
        if (!approvalUrl) return;
        try {
            await navigator.clipboard.writeText(approvalUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback
            const textarea = document.createElement('textarea');
            textarea.value = approvalUrl;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleRevoke = () => {
        if (!currentApproval) return;
        setError(null);
        startTransition(async () => {
            const result = await revokeApproval(currentApproval.id, jobId);
            if ('error' in result) {
                setError(result.error);
            } else {
                setGeneratedToken(null);
            }
        });
    };

    return (
        <Card>
            <div className="flex items-center gap-2 mb-3">
                <Link2 size={14} className="text-neutral-400" />
                <h3 className="text-sm font-semibold text-neutral-900">client approval</h3>
            </div>

            {error && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5 mb-3">
                    {error}
                </div>
            )}

            {/* Approved state */}
            {isApproved && currentApproval && (
                <div className="space-y-2">
                    <Chip variant="approved">approved</Chip>
                    <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                            <span className="text-neutral-500">name</span>
                            <span className="font-medium">{currentApproval.client_name}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-neutral-500">email</span>
                            <span className="font-medium text-xs">{currentApproval.client_email}</span>
                        </div>
                        {currentApproval.client_company && (
                            <div className="flex justify-between">
                                <span className="text-neutral-500">company</span>
                                <span className="font-medium">{currentApproval.client_company}</span>
                            </div>
                        )}
                        <div className="flex justify-between">
                            <span className="text-neutral-500">approved</span>
                            <span className="text-xs">{formatDateTime(currentApproval.approved_at!)}</span>
                        </div>
                    </div>
                    {currentApproval.signature_data && (
                        <div className="mt-2 p-2 border border-neutral-200 rounded bg-neutral-50">
                            <img
                                src={currentApproval.signature_data}
                                alt="Client signature"
                                className="max-w-full max-h-16 mx-auto"
                            />
                        </div>
                    )}
                    <button
                        onClick={handleGenerate}
                        disabled={isPending || !hasSignedOffComponents}
                        className="btn-secondary w-full text-xs mt-2 inline-flex items-center justify-center gap-1"
                    >
                        <Send size={12} />
                        generate new link
                    </button>
                </div>
            )}

            {/* Pending state (active link) */}
            {isPending_ && !isExpired && !isApproved && (
                <div className="space-y-2">
                    <Chip variant="scheduled">pending</Chip>
                    {approvalUrl && (
                        <div className="flex items-center gap-1">
                            <input
                                type="text"
                                readOnly
                                value={approvalUrl}
                                className="flex-1 text-xs bg-neutral-50 border border-neutral-200 rounded px-2 py-1.5 font-mono truncate"
                            />
                            <button
                                onClick={handleCopy}
                                className="p-1.5 border border-neutral-200 rounded hover:bg-neutral-50 transition-colors"
                                title="Copy link"
                            >
                                {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} className="text-neutral-400" />}
                            </button>
                        </div>
                    )}
                    <div className="text-xs text-neutral-400">
                        expires {formatDateTime(currentApproval!.expires_at)}
                    </div>
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

            {/* No active approval or expired/revoked */}
            {(!currentApproval || isExpired || currentApproval.status === 'revoked') && !isApproved && (
                <div className="space-y-2">
                    {isExpired && <p className="text-xs text-amber-600">previous link has expired</p>}
                    {currentApproval?.status === 'revoked' && <p className="text-xs text-neutral-400">previous link was revoked</p>}
                    {!hasSignedOffComponents ? (
                        <p className="text-xs text-neutral-400">sign off component designs to enable client approval</p>
                    ) : (
                        <button
                            onClick={handleGenerate}
                            disabled={isPending}
                            className="btn-primary w-full text-xs inline-flex items-center justify-center gap-1"
                        >
                            <Send size={12} />
                            {isPending ? 'generating...' : 'send for approval'}
                        </button>
                    )}
                </div>
            )}
        </Card>
    );
}
