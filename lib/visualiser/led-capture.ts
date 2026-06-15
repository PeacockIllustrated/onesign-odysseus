/**
 * 3D-snapshot handle for the LED layout preview. `LedLayoutScene` sets `fn`
 * while mounted so the client can drop the live view onto the wiring PDF —
 * same pattern as the panel visualiser's `sceneCapture` / returns capture.
 * Kept in its own tiny module (no three.js) so the handle can be read without
 * pulling the 3D bundle in.
 */
export const ledCapture: { fn: (() => string | null) | null } = { fn: null };
