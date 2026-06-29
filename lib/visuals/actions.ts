'use server';

/**
 * Server action: generate an in-situ mockup from the live visualiser sign.
 *
 * Pipeline: visualiser PanelParams → SignSpec (exact, enum-backed) → composed
 * prompt; the captured 3D render rides along as a reference image. The actual
 * model call lives behind the Higgsfield seam (`./higgsfield`), which no-ops
 * with a clear message when the API key isn't configured.
 *
 * Super-admin gated, like the rest of the visualiser actions. Returns the
 * generated image URL (Higgsfield-hosted) plus the prompt used, so the UI can
 * show "why it looks like this" and let the team hone the tags.
 */

import { z } from 'zod';
import { requireSuperAdminOrError } from '../auth';
import { ok, err, type Result } from '../result';
import { PanelParamsSchema } from '../visualiser/types';
import { composePrompt } from './compose';
import { visualiserToSignSpec } from './from-visualiser';
import { generateMockup } from './higgsfield';
import { SCENES, TIMES_OF_DAY } from './types';

const GenerateInSituMockupInputSchema = z.object({
    params: PanelParamsSchema,
    /** Captured clean 3D render as base64 PNG (no `data:` prefix). */
    screenshotBase64: z.string().min(1).max(12_000_000),
    scene: z.enum(SCENES),
    timeOfDay: z.enum(TIMES_OF_DAY),
    /** Optional explicit lettering; falls back to a guess from the design name. */
    text: z.string().max(120).optional(),
    /** 'preview' (cheap Soul) or 'final' (premium edit model). */
    quality: z.enum(['preview', 'final']).default('preview'),
});
export type GenerateInSituMockupInput = z.infer<typeof GenerateInSituMockupInputSchema>;

export async function generateInSituMockup(
    input: GenerateInSituMockupInput,
): Promise<Result<{ url: string; prompt: string }>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const parsed = GenerateInSituMockupInputSchema.safeParse(input);
    if (!parsed.success) return err(parsed.error.issues[0]?.message ?? 'invalid input');
    const { params, screenshotBase64, scene, timeOfDay, text, quality } = parsed.data;

    const spec = visualiserToSignSpec(params, text);
    const { prompt } = composePrompt({ spec, scene, timeOfDay });

    const res = await generateMockup({ prompt, referenceBase64: screenshotBase64, quality });
    if (!res.ok) return err(res.error);

    return ok({ url: res.data.url, prompt });
}
