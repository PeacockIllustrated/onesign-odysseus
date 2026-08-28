/**
 * Pure helpers for the workshop TV board (`/schedule/tv`).
 *
 * The TV has no keyboard and no mouse — it is driven by a remote's D-pad, and
 * nobody is standing at it to scroll. So the rules that keep it usable live
 * here, DOM-free and testable, rather than tangled into the component:
 *
 *   - which view a left/right press lands on,
 *   - how far the board is scaled to fit the panel it is shown on.
 *
 * The board component owns measurement (only the DOM knows how tall the grid
 * actually is); everything it decides *from* that measurement is here.
 */

export type TvView = 'week' | 'month' | 'year';

/** Left/right cycles the zoom level; up/down steps the period within it. */
export type TvAction = 'view-prev' | 'view-next' | 'period-prev' | 'period-next' | 'today';

/** Ordered so left/right walks week → month → year and wraps. */
export const TV_VIEWS: TvView[] = ['week', 'month', 'year'];

/**
 * Step between views, wrapping at both ends.
 *
 * Wrapping matters on a remote: there is no "jump to year" button, so a user
 * holding one direction must be able to reach every view without knowing which
 * way is shorter.
 */
export function cycleView(current: TvView, dir: -1 | 1): TvView {
    const i = TV_VIEWS.indexOf(current);
    // An unrecognised view (a hand-typed ?view=) restarts at week rather than
    // returning something off the end of the list.
    if (i === -1) return 'week';
    return TV_VIEWS[(i + dir + TV_VIEWS.length) % TV_VIEWS.length];
}

/**
 * Map a `KeyboardEvent.key` to a board action.
 *
 * TV remotes report their D-pad as the ordinary arrow keys through the browser,
 * and most also send Page Up/Down from channel +/-, which is a natural "next
 * week". Anything else is ignored so a stray press can't do something
 * surprising on a wall screen.
 */
export function keyToTvAction(key: string): TvAction | null {
    switch (key) {
        case 'ArrowLeft':
            return 'view-prev';
        case 'ArrowRight':
            return 'view-next';
        case 'ArrowUp':
        case 'PageUp':
            return 'period-prev';
        case 'ArrowDown':
        case 'PageDown':
            return 'period-next';
        case 'Home':
        case 'Enter':
            return 'today';
        default:
            return null;
    }
}

/**
 * How far a quiet board may be blown up to fill the panel.
 *
 * A wall TV showing a three-job week with the bottom third black looks broken.
 * Capped, because past this the cards stop reading as a schedule and start
 * reading as a poster — and the point of the board is to see the whole week.
 */
export const MAX_FIT_SCALE = 1.5;

/**
 * Scale that makes `naturalHeight` fill `availableHeight`.
 *
 * Deliberately unclamped downwards. A packed board used to stop shrinking at a
 * legibility floor and collapse its cards to one line instead, rotating the
 * detail through them a card at a time — which meant that at any moment most
 * of the week's detail was not on the wall, and you had to stand and wait for
 * your job to come round. Shrinking everything keeps every job, every
 * reference and every access note on screen permanently, which is what the
 * board is for. A small board you can walk towards beats a big one that is
 * hiding things.
 *
 * Scales up as well as down, to `MAX_FIT_SCALE`, so a busy week goes fine and
 * dense while a quiet one grows to fill the panel instead of leaving it empty.
 * Returns 1 for a nonsense measurement (a hidden or not-yet-laid-out element
 * reports 0) so the board renders at its natural size rather than collapsing.
 */
export function fitScale(naturalHeight: number, availableHeight: number): number {
    if (naturalHeight <= 0 || availableHeight <= 0) return 1;
    return Math.min(MAX_FIT_SCALE, availableHeight / naturalHeight);
}
