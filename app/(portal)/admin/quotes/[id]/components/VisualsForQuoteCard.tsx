'use client';

import Link from 'next/link';
import { FileImage } from 'lucide-react';
import { NewVisualJobButton } from '@/app/(portal)/admin/artwork/components/NewVisualJobButton';

interface VisualJobRow {
    id: string;
    job_name: string;
    status: string;
}

interface OrgOption { id: string; name: string; }

interface Props {
    quoteId: string;
    orgId: string | null;
    orgs: OrgOption[];
    visualJobs: VisualJobRow[];
}

export function VisualsForQuoteCard({ quoteId, orgId, orgs, visualJobs }: Props) {
    return (
        <div className="rounded-lg border border-neutral-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-bold flex items-center gap-2">
                    <FileImage size={16} className="text-[#4e7e8c]" />
                    Visuals for this quote
                </h4>
                <NewVisualJobButton
                    orgs={orgs}
                    defaultOrgId={orgId ?? undefined}
                    defaultQuoteId={quoteId}
                    buttonLabel="+ new visual"
                />
            </div>

            {visualJobs.length === 0 ? (
                <p className="text-xs text-neutral-500 italic">
                    no visuals linked — create one above if the client needs mockups before production
                </p>
            ) : (
                <ul className="space-y-1">
                    {visualJobs.map((v) => (
                        <li key={v.id}>
                            <Link
                                href={`/admin/artwork/${v.id}`}
                                className="text-sm text-[#4e7e8c] hover:underline inline-flex items-center gap-2"
                            >
                                <span className="font-semibold">{v.job_name}</span>
                                <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                                    {v.status}
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
