'use client';

import { useState, useTransition } from 'react';
import { updateArtworkJob } from '@/lib/artwork/actions';
import { Card } from '@/app/(portal)/components/ui';

interface Props {
    jobId: string;
    panelSize: string | null;
    paintColour: string | null;
}

export function JobFieldsForm({ jobId, panelSize, paintColour }: Props) {
    const [panel, setPanel] = useState(panelSize || '');
    const [colour, setColour] = useState(paintColour || '');
    const [isPending, startTransition] = useTransition();
    const [saved, setSaved] = useState(false);

    const hasChanges = panel !== (panelSize || '') || colour !== (paintColour || '');

    const handleSave = () => {
        startTransition(async () => {
            await updateArtworkJob(jobId, {
                panel_size: panel.trim() || null,
                paint_colour: colour.trim() || null,
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
                        className="w-full px-2.5 py-1.5 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                    />
                </div>
                <div>
                    <label className="block text-xs text-neutral-500 mb-1">paint colour</label>
                    <input
                        type="text"
                        value={colour}
                        onChange={(e) => setColour(e.target.value)}
                        placeholder="e.g. RAL 9005 Jet Black"
                        className="w-full px-2.5 py-1.5 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                    />
                </div>
                {hasChanges && (
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={isPending}
                        className="text-xs font-medium px-3 py-1.5 bg-black text-white rounded-[var(--radius-sm)] hover:bg-neutral-800 disabled:opacity-50"
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
