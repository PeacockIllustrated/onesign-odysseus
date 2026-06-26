/**
 * Storefront Studio engine — reconstruct a prospect's shopfront as a to-scale
 * parametric block model (no AI mesh), into which a visualiser sign drops at
 * exact mm scale.
 *
 * spec (measured) → specToBlocks → StorefrontBlock[] (rendered in R3F).
 * Measurement-first: traceToSpec turns a calibrated photo trace into the spec.
 */

export * from './types';
export { specToBlocks, specBounds } from './geometry';
export { traceToSpec, type PixelBox, type TraceInput } from './trace';
// Server actions ('use server' — functions only; their types live in ./types).
export {
    listStorefrontProjects,
    getStorefrontProject,
    saveStorefrontProject,
    listLinkableSurveys,
    getSurveyAnchors,
} from './actions';
