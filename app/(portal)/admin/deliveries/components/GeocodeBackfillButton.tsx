'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Loader2 } from 'lucide-react';
import { geocodeAllSites } from '@/lib/geo/actions';

/**
 * One-shot button that geocodes every site with a postcode but no
 * lat/lng. Shows up on the map page when there are no pins yet.
 * After completion, refreshes the page so pins appear.
 */
export function GeocodeBackfillButton() {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [result, setResult] = useState<{ geocoded: number; skipped: number } | null>(null);

    const run = () => {
        startTransition(async () => {
            const res = await geocodeAllSites();
            setResult(res);
            router.refresh();
        });
    };

    return (
        <div className="space-y-2">
            <button
                type="button"
                onClick={run}
                disabled={pending}
                className="btn-primary inline-flex items-center gap-2 text-sm"
            >
                {pending ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
                {pending ? 'geocoding…' : 'geocode all sites now'}
            </button>
            {result && (
                <p className="text-xs text-neutral-600">
                    Done — {result.geocoded} geocoded, {result.skipped} skipped (invalid postcode or no postcode).
                </p>
            )}
        </div>
    );
}
