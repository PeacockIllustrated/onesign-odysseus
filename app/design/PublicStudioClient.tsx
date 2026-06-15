'use client';

import { useEffect, useState } from 'react';
import { PublicWizard } from './PublicWizard';
import { Tour, type TourStep } from './Tour';

const TOUR_SEEN_KEY = 'onesign_design_tour_v2';

// A short, skippable tour anchored to elements that are always on screen — the
// wizard itself is the real guidance, so this just orients a first-time
// visitor. Auto-runs once (localStorage) and is replayable via "Show me how".
const TOUR_STEPS: TourStep[] = [
    {
        selector: '[data-tour="steps"]',
        title: 'Build it in four steps',
        body: 'Size, artwork, light, then send. Tap a number to jump between steps — the 3D preview updates live as you go, and you can drag the model to spin it.',
        placement: 'auto',
    },
    {
        selector: '[data-tour="daynight"]',
        title: 'See it lit up',
        body: "Flip to night to preview your sign glowing — then switch on illumination in the Light step. When you're happy, the last step sends it to us for a free quote.",
        placement: 'bottom',
    },
];

/**
 * Host for the public "Design your sign" studio: mounts the cinematic wizard
 * and the orientation tour. Unauthenticated by design — the only privileged
 * step is the service-side submission (see PublicWizard / CLAUDE.md §2c).
 */
export function PublicStudioClient() {
    const [tourOpen, setTourOpen] = useState(false);

    // Auto-start the tour on a first-ever visit.
    useEffect(() => {
        try {
            if (!localStorage.getItem(TOUR_SEEN_KEY)) {
                const t = setTimeout(() => setTourOpen(true), 700);
                return () => clearTimeout(t);
            }
        } catch {
            /* localStorage unavailable (private mode) — just skip auto-start */
        }
    }, []);

    const closeTour = () => {
        setTourOpen(false);
        try {
            localStorage.setItem(TOUR_SEEN_KEY, '1');
        } catch {
            /* ignore */
        }
    };

    return (
        <div className="flex h-full flex-col">
            <PublicWizard onShowHelp={() => setTourOpen(true)} />
            <Tour steps={TOUR_STEPS} open={tourOpen} onClose={closeTour} />
        </div>
    );
}
