'use client';

import { useEffect, useState } from 'react';
import { VisualiserClient } from '../(portal)/admin/visualiser/VisualiserClient';
import { PublicActionBar } from './PublicActionBar';
import { Tour, type TourStep } from './Tour';

const TOUR_SEEN_KEY = 'onesign_design_tour_v1';

const TOUR_STEPS: TourStep[] = [
    {
        selector: '[data-tour="controls"]',
        title: 'Start with size & finish',
        body: 'Set your panel width, height and depth, pick a colour or RAL match, and choose which edges fold back. The preview updates as you go.',
        placement: 'auto',
    },
    {
        selector: '[data-tour="upload"]',
        title: 'Add your logo or lettering',
        body: 'Upload an SVG of your artwork. We can cut it into the face as an aperture, or mount it as raised stand-off lettering — and mix materials like vinyl and acrylic.',
        placement: 'auto',
    },
    {
        selector: '[data-tour="views"]',
        title: 'See it in 3D',
        body: 'Switch between the folded 3D model, an unfold animation, and the flat cutting layout. Drag the model to spin it around.',
        placement: 'bottom',
    },
    {
        selector: '[data-tour="illumination"]',
        title: 'Preview it lit up',
        body: 'Turn on illumination in the panel settings, then use this switch to see how your sign looks glowing at night.',
        placement: 'bottom',
    },
    {
        selector: '[data-tour="display"]',
        title: 'Focus on what matters',
        body: 'Show or hide outlines, dimensions and other guide layers to get a clean view of your design.',
        placement: 'top',
    },
    {
        selector: '[data-tour="send"]',
        title: 'Send it to Onesign',
        body: "When you're happy, send your design straight to our team. We'll review it and come back with a quote — and then make the real thing.",
        placement: 'top',
    },
];

/**
 * Public "Design Your Sign" studio. Wraps the full visualiser engine in
 * customer-facing chrome: same building capabilities as the staff tool, but the
 * staff rails are hidden, the footer is a "Send to Onesign" call to action, and
 * a step-by-step tour points out each control. The tour auto-runs once on a
 * visitor's first arrival (stored in localStorage) and can be replayed any time
 * from the "Show me how" button.
 */
export function PublicStudioClient() {
    const [tourOpen, setTourOpen] = useState(false);

    // Auto-start the tour on a first-ever visit.
    useEffect(() => {
        try {
            if (!localStorage.getItem(TOUR_SEEN_KEY)) {
                // Defer a touch so the studio has painted before we spotlight.
                const t = setTimeout(() => setTourOpen(true), 600);
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
            <VisualiserClient
                variant="public"
                publicFooter={
                    <PublicActionBar onStartTour={() => setTourOpen(true)} />
                }
            />
            <Tour steps={TOUR_STEPS} open={tourOpen} onClose={closeTour} />
        </div>
    );
}
