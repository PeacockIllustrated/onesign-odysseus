'use client';

import { buildSurveySketch, type SketchOptions } from '@/lib/site-surveys/sketch';
import type { Measurements } from '@/lib/site-surveys/types';

export function SketchPreview({
    measurements,
    options,
}: {
    measurements: Measurements;
    options?: SketchOptions;
}) {
    const svg = buildSurveySketch(measurements, options);
    return (
        <div
            className="rounded-md border border-neutral-200 bg-white p-2"
            // buildSurveySketch returns trusted, self-generated SVG (no user HTML).
            dangerouslySetInnerHTML={{ __html: svg }}
        />
    );
}
