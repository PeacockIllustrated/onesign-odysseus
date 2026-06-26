/**
 * Higgsfield Cloud API client — the single seam between the app and the image
 * model. Gated on HIGGSFIELD_API_KEY: when absent it returns a clear
 * "not configured" Result (the same deferred-integration pattern as the
 * email/push wiring), so the app builds and runs without it.
 *
 * Flow: upload the captured sign render to the Higgsfield CDN (v1 client) to
 * get a reference URL, then run the reference-guided text-to-image endpoint
 * (v2 `subscribe`) with the composed prompt — the screenshot anchors the
 * geometry/letterforms, the prompt drives the in-situ context. Returns the
 * generated image URL.
 *
 * SERVER-ONLY: pulls the Node SDK (axios/form-data) and the API key. Import
 * this from server actions only, never from a client component. It is
 * deliberately NOT re-exported from `index.ts` to keep the barrel client-safe.
 */

import { Buffer } from 'node:buffer';
import { HiggsfieldClient } from '@higgsfield/client';
import { createHiggsfieldClient } from '@higgsfield/client/v2';
import { env } from '../env';
import { ok, err, type Result } from '../result';
import { buildModelInput, resolveMockupModel, type MockupQuality } from './model-select';

export interface GenerateMockupInput {
    /** The composed in-situ prompt (see `lib/visuals/compose`). */
    prompt: string;
    /** The captured sign render as base64 PNG (no `data:` prefix). */
    referenceBase64: string;
    /** Output size token, e.g. "1536x864" (16:9). Defaults to landscape. */
    size?: string;
    /** Quality tier — 'preview' (cheap Soul) or 'final' (premium). Default preview. */
    quality?: MockupQuality;
}

/** The credentials string ("KEY_ID:KEY_SECRET"), or null when not configured. */
function credentials(): string | null {
    const c = env.HIGGSFIELD_API_KEY?.trim();
    return c && c.includes(':') ? c : null;
}

/** True when the integration is configured — lets the UI disable cleanly. */
export function isHiggsfieldConfigured(): boolean {
    return credentials() !== null;
}

export async function generateMockup(input: GenerateMockupInput): Promise<Result<{ url: string }>> {
    const creds = credentials();
    if (!creds) {
        return err(
            'Higgsfield is not configured — set HIGGSFIELD_API_KEY ("KEY_ID:KEY_SECRET") to enable mockups.',
        );
    }
    if (!input.referenceBase64) return err('No reference image was captured.');

    const [apiKey, apiSecret] = creds.split(':');

    try {
        // 1. Upload the sign render to the Higgsfield CDN → reference URL.
        const uploader = new HiggsfieldClient({ apiKey, apiSecret });
        let referenceUrl: string;
        try {
            referenceUrl = await uploader.uploadImage(Buffer.from(input.referenceBase64, 'base64'), 'png');
        } finally {
            uploader.close();
        }

        // 2. Reference-guided generation. The quality tier picks the endpoint
        //    (cheap Soul preview vs a premium edit model) + its input shape.
        const { endpoint, style } = resolveMockupModel(input.quality ?? 'preview', {
            preview: env.HIGGSFIELD_MODEL_PREVIEW,
            final: env.HIGGSFIELD_MODEL_FINAL,
        });
        const payload = buildModelInput(style, {
            prompt: input.prompt,
            referenceUrl,
            size: input.size ?? '1536x864',
        });

        const client = createHiggsfieldClient({ credentials: creds });
        const res = await client.subscribe(endpoint, { input: payload, withPolling: true });

        if (res.status !== 'completed') {
            const why = res.status === 'nsfw' ? 'was blocked (nsfw)' : `did not complete (${res.status})`;
            return err(`Higgsfield generation ${why}.`);
        }
        const url = res.images?.[0]?.url;
        if (!url) return err('Higgsfield reported success but returned no image.');
        return ok({ url });
    } catch (e) {
        return err(e instanceof Error ? e.message : 'Higgsfield request failed.');
    }
}
