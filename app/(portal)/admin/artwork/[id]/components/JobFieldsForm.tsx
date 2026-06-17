'use client';

import { useState, useTransition } from 'react';
import { updateArtworkJob } from '@/lib/artwork/actions';
import { isValidSplineUrl } from '@/lib/artwork/utils';
import { Card } from '@/app/(portal)/components/ui';

interface Props {
    jobId: string;
    panelSize: string | null;
    paintColour: string | null;
    splineUrl: string | null;
    visualiserDesignId: string | null;
    designs: Array<{ id: string; name: string }>;
}

export function JobFieldsForm({
    jobId,
    panelSize,
    paintColour,
    splineUrl,
    visualiserDesignId,
    designs,
}: Props) {
    const [panel, setPanel] = useState(panelSize || '');
    const [colour, setColour] = useState(paintColour || '');
    const [spline, setSpline] = useState(splineUrl || '');
    const [designId, setDesignId] = useState(visualiserDesignId || '');
    const [isPending, startTransition] = useTransition();
    const [saved, setSaved] = useState(false);

    const splineTrimmed = spline.trim();
    const splineInvalid = splineTrimmed !== '' && !isValidSplineUrl(splineTrimmed);
    const hasChanges =
        panel !== (panelSize || '') ||
        colour !== (paintColour || '') ||
        splineTrimmed !== (splineUrl || '') ||
        designId !== (visualiserDesignId || '');

    const handleSave = () => {
        if (splineInvalid) return;
        startTransition(async () => {
            await updateArtworkJob(jobId, {
                panel_size: panel.trim() || null,
                paint_colour: colour.trim() || null,
                spline_url: splineTrimmed || null,
                visualiser_design_id: designId || null,
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        });
    };

    return (
        <Card>
            <h3 className="text-sm font-semibold text-neutral-900 mb-3">cover page details</h3>
            <div className="space-y-3">
                <div>
                    <label className="block text-xs text-neutral-500 mb-1">panel size</label>
                    <input
                        type="text"
                        value={panel}
                        onChange={(e) => setPanel(e.target.value)}
                        placeholder="e.g. 2400 x 1200mm"
                        className="w-full px-2.5 py-1.5 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-[#4e7e8c]"
                    />
                </div>
                <div>
                    <label className="block text-xs text-neutral-500 mb-1">paint colour</label>
                    <input
                        type="text"
                        value={colour}
                        onChange={(e) => setColour(e.target.value)}
                        placeholder="e.g. RAL 9005 Jet Black"
                        className="w-full px-2.5 py-1.5 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-[#4e7e8c]"
                    />
                </div>
                <div>
                    <label className="block text-xs text-neutral-500 mb-1">
                        3D scene <span className="text-neutral-400">— Spline link (optional)</span>
                    </label>
                    <input
                        type="url"
                        value={spline}
                        onChange={(e) => setSpline(e.target.value)}
                        placeholder="https://my.spline.design/…"
                        className={`w-full px-2.5 py-1.5 text-sm border rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 ${
                            splineInvalid
                                ? 'border-red-300 focus:ring-red-400'
                                : 'border-neutral-200 focus:ring-[#4e7e8c]'
                        }`}
                    />
                    {splineInvalid ? (
                        <p className="mt-1 text-[11px] text-red-600">
                            must be an https link on spline.design (use your Spline “share” URL)
                        </p>
                    ) : (
                        <p className="mt-1 text-[11px] text-neutral-400">
                            embeds an interactive 3D preview on the client approval page
                        </p>
                    )}
                </div>
                <div>
                    <label className="block text-xs text-neutral-500 mb-1">
                        3D sign{' '}
                        <span className="text-neutral-400">
                            — from a visualiser design (optional)
                        </span>
                    </label>
                    <select
                        value={designId}
                        onChange={(e) => setDesignId(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-sm border border-neutral-200 rounded-[var(--radius-sm)] bg-white focus:outline-none focus:ring-2 focus:ring-[#4e7e8c]"
                    >
                        <option value="">— none —</option>
                        {designs.map((d) => (
                            <option key={d.id} value={d.id}>
                                {d.name}
                            </option>
                        ))}
                    </select>
                    <p className="mt-1 text-[11px] text-neutral-400">
                        shows the real sign in interactive 3D on the client
                        approval page — the thing they approve is the thing
                        they’ll get
                    </p>
                </div>
                {hasChanges && (
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={isPending || splineInvalid}
                        className="text-xs font-medium px-3 py-1.5 bg-[#4e7e8c] text-white rounded-[var(--radius-sm)] hover:bg-[#3a5f6a] disabled:opacity-50"
                    >
                        {isPending ? 'saving...' : 'save'}
                    </button>
                )}
                {saved && !hasChanges && (
                    <p className="text-xs text-green-600">saved</p>
                )}
            </div>
        </Card>
    );
}
