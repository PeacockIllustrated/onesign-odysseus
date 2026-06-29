'use client';

import { useEffect, useState } from 'react';
import { PublicWizard } from './PublicWizard';
import { Tour, type TourStep } from './Tour';

const TOUR_SEEN_KEY = 'onesign_design_tour_v4';

// A detailed, interactive walkthrough: each stop switches the wizard to the
// relevant step (via `wizardStep`) and spotlights a REAL control, so a
// first-timer is walked through size → artwork → light → send rather than
// dropped into a wall of options. Auto-runs once (localStorage), replayable via
// "Show me how".
const TOUR_STEPS: TourStep[] = [
    {
        selector: '[data-tour="steps"]',
        wizardStep: 0,
        title: 'Build it in four steps',
        body: 'Size → artwork → light → send. Tap a number to jump between steps — the 3D preview updates live, and you can drag the model to spin it.',
        placement: 'auto',
    },
    {
        selector: '[data-tour="size"]',
        wizardStep: 0,
        title: 'Set the size & finish',
        body: "Type your sign's width and height in mm, pick a colour or RAL match, and choose which edges fold back. Everything updates instantly in 3D.",
        placement: 'auto',
    },
    {
        selector: '[data-tour="projecting"]',
        wizardStep: 0,
        title: 'Add a projecting sign',
        body: 'Want a blade/projecting sign that sticks out from the wall as well as the flat fascia? Tap “+ Add projecting sign” — design both together and see them mounted in 3D. Great for shopfront campaigns.',
        placement: 'auto',
    },
    {
        selector: '[data-tour="daynight"]',
        wizardStep: 0,
        title: 'See it day or night',
        body: 'Flip this switch any time to preview your sign lit up after dark — handy for illuminated signs.',
        placement: 'bottom',
    },
    {
        selector: '[data-tour="upload"]',
        wizardStep: 1,
        title: 'Add your artwork',
        body: 'Upload your logo or lettering as an SVG, then choose how it’s made — cut into the face, raised as stand-off letters, printed vinyl, or push-through/backlit so it glows.',
        placement: 'auto',
    },
    {
        selector: '[data-tour="builtup"]',
        wizardStep: 1,
        title: 'Or build premium letters',
        body: 'Fabricated metal built-up letters with real depth — design them here and preview the genuine 3D look.',
        placement: 'auto',
    },
    {
        selector: '[data-tour="light"]',
        wizardStep: 2,
        title: 'Light it up',
        body: 'Switch on an edge / keyline glow, choose its colour and brightness, and preview it glowing at night.',
        placement: 'auto',
    },
    {
        selector: '[data-tour="send"]',
        wizardStep: 3,
        title: 'Send for a free quote',
        body: "Happy with it? Add your name and email and send — we'll reply with a no-obligation quote, usually within a working day.",
        placement: 'auto',
    },
];

/**
 * Host for the public "Design your sign" studio: mounts the cinematic wizard
 * and the interactive walkthrough. The step index is lifted here so the tour
 * can drive the wizard. Unauthenticated by design — the only privileged step is
 * the service-side submission (see PublicWizard / CLAUDE.md §2c).
 */
export function PublicStudioClient() {
    const [tourOpen, setTourOpen] = useState(false);
    const [stepIdx, setStepIdx] = useState(0);

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
            <PublicWizard
                onShowHelp={() => setTourOpen(true)}
                stepIdx={stepIdx}
                onStep={setStepIdx}
            />
            <Tour
                steps={TOUR_STEPS}
                open={tourOpen}
                onClose={closeTour}
                onStepChange={(_i, s) => {
                    if (typeof s.wizardStep === 'number') setStepIdx(s.wizardStep);
                }}
            />
        </div>
    );
}
