'use client';

import { useState, useTransition } from 'react';
import { updateComponentSpline } from '@/lib/artwork/actions';
import { isValidSplineUrl } from '@/lib/artwork/utils';
import { Card } from '@/app/(portal)/components/ui';

interface Props {
    jobId: string;
    componentId: string;
    splineUrl: string | null;
}

export function ComponentSplineForm({ jobId, componentId, splineUrl }: Props) {
    const [spline, setSpline] = useState(splineUrl || '');
    const [isPending, startTransition] = useTransition();
    const [saved, setSaved] = useState(false);

    const trimmed = spline.trim();
    const invalid = trimmed !== '' && !isValidSplineUrl(trimmed);
    const hasChanges = trimmed !== (splineUrl || '');

    const save = () => {
        if (invalid) return;
        startTransition(async () => {
            await updateComponentSpline(componentId, jobId, trimmed || null);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        });
    };

    return (
        <Card className="mb-6">
            <h2 className="text-sm font-semibold text-neutral-900 uppercase tracking-wider mb-1">3D scene</h2>
            <p className="text-xs text-neutral-500 mb-3">
                optional Spline link — clients can load it in 3D inside this component on the approval pack
            </p>
            <input
                type="url"
                value={spline}
                onChange={(e) => setSpline(e.target.value)}
                placeholder="https://my.spline.design/…  or  …/scene.splinecode"
                className={`w-full px-2.5 py-1.5 text-sm border rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 ${
                    invalid ? 'border-red-300 focus:ring-red-400' : 'border-neutral-200 focus:ring-[#4e7e8c]'
                }`}
            />
            {invalid ? (
                <p className="mt-1 text-[11px] text-red-600">must be an https link on spline.design</p>
            ) : (
                <p className="mt-1 text-[11px] text-neutral-400">paste your Spline “share” or export URL</p>
            )}
            {hasChanges && (
                <button
                    type="button"
                    onClick={save}
                    disabled={isPending || invalid}
                    className="mt-2 text-xs font-medium px-3 py-1.5 bg-[#4e7e8c] text-white rounded-[var(--radius-sm)] hover:bg-[#3a5f6a] disabled:opacity-50"
                >
                    {isPending ? 'saving...' : 'save'}
                </button>
            )}
            {saved && !hasChanges && <p className="mt-2 text-xs text-green-600">saved</p>}
        </Card>
    );
}
