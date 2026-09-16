/**
 * Pure helpers for the workshop TV board (`/schedule/tv`).
 *
 * The TV has no keyboard and no mouse — it is driven by a remote's D-pad, and
 * nobody is standing at it to scroll. So the rules that keep it usable live
 * here, DOM-free and testable, rather than tangled into the component:
 *
 *   - what each button on the remote does,
 *   - which week a view change lands on, and vice versa,
 *   - how far the board is scaled to fit the panel it is shown on.
 *
 * The board component owns measurement (only the DOM knows how tall the grid
 * actually is); everything it decides *from* that measurement is here.
 */

import { addDaysISO, mondayOfISO } from './utils';

export type TvView = 'week' | 'month' | 'year';

/**
 * What a press on the remote does.
 *
 * Left/right step the period, because scanning forward a week at a time is
 * what the wall is actually used for — a fitter wants to know what is on next
 * Tuesday, and that should be one press in the obvious direction. Down swaps
 * between the two useful zoom levels, and up switches the spare van's column.
 */
export type TvAction =
    | 'period-prev'
    | 'period-next'
    | 'view-cycle'
    | 'toggle-van'
    | 'today';

/**
 * The views the remote cycles between.
 *
 * Week and month only: a week already shows each day in full, so there is
 * nothing a day view would add, and a year of heat squares answers a planning
 * question nobody is asking from the workshop floor. `year` is still a valid
 * `?view=` — the office "TV view" button carries whatever is on screen — it
 * is simply not somewhere the D-pad can strand you.
 */
export const TV_CYCLE_VIEWS: TvView[] = ['week', 'month'];

/**
 * The view a down-press lands on.
 *
 * Week and month alternate. Arriving from `year` (only reachable via the URL)
 * drops back to the week, which is both the useful end of the range and the
 * way out of a view the remote can't otherwise leave.
 */
export function nextTvView(current: TvView): TvView {
    return current === 'week' ? 'month' : 'week';
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
            return 'period-prev';
        case 'ArrowRight':
            return 'period-next';
        // Channel +/- keep stepping the period, so the two most obvious pairs
        // on the remote do the same, most-wanted thing.
        case 'PageUp':
            return 'period-prev';
        case 'PageDown':
            return 'period-next';
        case 'ArrowDown':
            return 'view-cycle';
        case 'ArrowUp':
            return 'toggle-van';
        case 'Home':
        case 'Enter':
            return 'today';
        default:
            return null;
    }
}

/**
 * The month a week belongs to — the one holding its Thursday.
 *
 * A week straddling the turn of a month belongs to whichever month has most of
 * it, which is the ISO rule and also the intuitive one: pressing down on the
 * week of 29 June should not open July.
 */
export function monthOfWeek(monday: string): { y: number; m: number } {
    const thursday = addDaysISO(monday, 3);
    return { y: Number(thursday.slice(0, 4)), m: Number(thursday.slice(5, 7)) - 1 };
}

/**
 * The month's first week — where a month view hands back to a week.
 *
 * Anchored on the 4th, not the 1st: the week containing the 4th always has its
 * Thursday inside the month, so it is the first week `monthOfWeek` agrees
 * belongs here. Anchoring on the 1st breaks when the month opens on a Friday
 * — the week of 1 August 2026 is mostly July, so pressing down then up would
 * bounce the board into the previous month.
 */
export function weekOfMonthStart(y: number, m: number): string {
    const mm = String(m + 1).padStart(2, '0');
    return mondayOfISO(`${y}-${mm}-04`);
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

/**
 * Scale that makes a header `naturalWidth` wide fit `availableWidth`.
 *
 * The chrome row — the mark, the remote's buttons, the PM key and where you
 * are — is laid out at one size and has to survive whatever viewport the wall
 * browser reports. A Google TV's is not 1920 CSS pixels: it renders the page
 * at around 960 and lets the panel do the enlarging, so a row designed to
 * leave a comfortable margin at 1920 overflows badly there. What that cost was
 * not a tidy clip but a collapse — the key wrapped into a column, spilled over
 * the period beside it, and ate a third of the panel the week should have had.
 *
 * So the row is measured and scaled exactly as the grid is, and for the same
 * reason: the board decides what fits, rather than assuming.
 *
 * Capped at 1 — unlike {@link fitScale}, which grows a quiet grid to fill the
 * panel. This is chrome: it is sized to be read and no bigger, and a wall
 * screen with a spare inch of header should give that inch to the week.
 * Unclamped downwards, because a roster that outgrows the row should shrink
 * the row rather than hide a name, and a colour whose key is missing is a
 * colour nobody can decode.
 */
export function fitChromeScale(naturalWidth: number, availableWidth: number): number {
    if (naturalWidth <= 0 || availableWidth <= 0) return 1;
    return Math.min(1, availableWidth / naturalWidth);
}
