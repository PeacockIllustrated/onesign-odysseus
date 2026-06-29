/**
 * Mockup model selection — pure, dependency-free so it unit-tests without the
 * SDK or env. Maps a per-generation quality tier to a Higgsfield endpoint and
 * the input shape that endpoint expects.
 *
 * Two tiers:
 *   - 'preview' → cheap, fast (Soul) for quick iteration (~1–2¢ / image).
 *   - 'final'   → a premium edit/reference model for client-facing fidelity.
 *
 * Both endpoints are overridable via env (see `lib/env.ts`) so the team can
 * point 'final' at whatever premium model holds the sign best — and A/B them —
 * without a code change. The input shape is inferred from the endpoint: Soul
 * endpoints take an `image_reference`; anything else is treated as an
 * edit/reference model that takes `input_images` (FLUX Kontext, GPT-Image, …).
 */

export type MockupQuality = 'preview' | 'final';
export type ModelInputStyle = 'soul' | 'edit';

/** Default endpoint when a tier isn't configured — cheap + always available. */
export const SOUL_ENDPOINT = '/v1/text2image/soul';

export interface ResolvedModel {
    endpoint: string;
    style: ModelInputStyle;
}

/**
 * Resolve the endpoint + input style for a quality tier. Falls back to Soul
 * when the tier's endpoint isn't configured, so 'final' degrades gracefully to
 * a working (if not premium) result until the env var is set.
 */
export function resolveMockupModel(
    quality: MockupQuality,
    endpoints: { preview?: string | null; final?: string | null },
): ResolvedModel {
    const chosen = (quality === 'final' ? endpoints.final : endpoints.preview)?.trim();
    const endpoint = chosen && chosen.length > 0 ? chosen : SOUL_ENDPOINT;
    const style: ModelInputStyle = /soul/i.test(endpoint) ? 'soul' : 'edit';
    return { endpoint, style };
}

/** Build the model-specific `input` payload for `subscribe`. */
export function buildModelInput(
    style: ModelInputStyle,
    args: { prompt: string; referenceUrl: string; size: string },
): Record<string, unknown> {
    const ref = { type: 'image_url' as const, image_url: args.referenceUrl };
    if (style === 'soul') {
        return {
            prompt: args.prompt,
            width_and_height: args.size,
            quality: '1080p',
            batch_size: 1,
            image_reference: ref,
            enhance_prompt: false,
        };
    }
    // Edit / reference models keep the sign from the reference image and
    // restyle the scene from the prompt.
    return {
        prompt: args.prompt,
        input_images: [ref],
    };
}
