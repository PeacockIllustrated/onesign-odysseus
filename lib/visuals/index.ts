/**
 * In-situ mockup prompt engine.
 *
 * Spec → tag → prompt: a normalised `SignSpec` (built by an adapter from a real
 * record) plus a chosen scene compose into a deterministic image-generation
 * prompt. The tag catalogue in `tags.ts` is the honing surface; the composer is
 * pure and unit-tested. Nothing here talks to an image API — wiring a
 * "Generate mockup" action onto this is a separate, thin layer.
 */

export * from './types';
export * from './tags';
export { composePrompt, type ComposedPrompt } from './compose';
export { sectionToSignSpec } from './from-pack';
export { visualiserToSignSpec } from './from-visualiser';

// NOTE: `./higgsfield` is intentionally NOT re-exported here — it is server-only
// (pulls the Node SDK + API key). Import it directly from the server action.
