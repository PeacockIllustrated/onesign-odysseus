/**
 * 3D-snapshot handle for the built-up returns preview.
 *
 * `ReturnsScene` sets `fn` while it is mounted (inside the R3F canvas), so the
 * returns client can grab a PNG of the live 3D view to drop onto the cut-sheet
 * PDF — the same pattern as the panel visualiser's `sceneCapture`. It lives in
 * its own tiny module (no three.js import) so the measure view can read the
 * handle without pulling the whole 3D bundle in.
 */
export const returnsCapture: { fn: (() => string | null) | null } = {
    fn: null,
};
