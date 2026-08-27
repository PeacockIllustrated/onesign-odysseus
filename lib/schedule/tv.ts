/**
 * Pure helpers for the workshop TV board (`/schedule/tv`).
 *
 * The TV has no keyboard and no mouse — it is driven by a remote's D-pad, and
 * nobody is standing at it to scroll. So the rules that keep it usable live
 * here, DOM-free and testable, rather than tangled into the component:
 *
 *   - which view a left/right press lands on,
 *   - which job the spotlight expands next when the board is too packed to
 *     show every card in full.
 *
 * The board component owns measurement (only the DOM knows whether the grid
 * actually overflows); everything it decides *from* that measurement is here.
 */

import type { FittingJobView, Slot } from './types';

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

const SLOT_RANK: Record<Slot, number> = { DAY: 0, AM: 1, PM: 2, OOH: 3 };

/**
 * The order the spotlight walks when the board is packed.
 *
 * Reading order — day, then van across, then slot down the cell — so someone
 * watching the rotation sees it sweep the board the way they would read it,
 * rather than hopping about. Ties break on `sort_order` then id, so the
 * sequence is stable across refreshes and a realtime update doesn't reshuffle
 * what is about to be shown.
 */
export function spotlightSequence(
    jobs: FittingJobView[],
    vanOrder: string[]
): string[] {
    const vanRank = new Map(vanOrder.map((id, i) => [id, i]));

    return jobs
        .filter((j) => j.archived_at == null && j.scheduled_date != null && j.van_id != null)
        .slice()
        .sort((a, b) => {
            if (a.scheduled_date !== b.scheduled_date)
                return (a.scheduled_date ?? '') < (b.scheduled_date ?? '') ? -1 : 1;
            const va = vanRank.get(a.van_id ?? '') ?? Number.MAX_SAFE_INTEGER;
            const vb = vanRank.get(b.van_id ?? '') ?? Number.MAX_SAFE_INTEGER;
            if (va !== vb) return va - vb;
            if (a.slot !== b.slot) return SLOT_RANK[a.slot] - SLOT_RANK[b.slot];
            if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
            return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
        })
        .map((j) => j.id);
}

/**
 * Advance the spotlight, keeping our place when the sequence changes underneath
 * us — a realtime update mid-rotation should carry on from roughly where it
 * was, not snap back to the first card.
 *
 * Returns null for an empty sequence so the caller can drop the spotlight
 * entirely rather than pointing at a job that is no longer on the board.
 */
export function nextSpotlight(sequence: string[], current: string | null): string | null {
    if (sequence.length === 0) return null;
    if (current == null) return sequence[0];
    const i = sequence.indexOf(current);
    // Current job has gone (unscheduled, archived, moved out of the window):
    // restart rather than guessing at a position that no longer exists.
    if (i === -1) return sequence[0];
    return sequence[(i + 1) % sequence.length];
}

/**
 * How far the board may be shrunk before shrinking stops being the answer.
 *
 * Below this a wall TV read from across a workshop is illegible, so the board
 * condenses cards to one line and rotates the detail through them instead.
 */
export const MIN_FIT_SCALE = 0.62;

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
 * Deliberately NOT clamped at the legibility floor. The floor decides the
 * *strategy* — whether to condense the cards — and once that decision is made,
 * fitting is absolute: a board scaled small is still readable at a glance and
 * still shows every job, where a board clipped at the bottom silently hides
 * Friday. On a screen nobody can scroll, hiding is the worse failure.
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
 * Does this board hold more than it can show in full?
 *
 * Answered from the height of the board with every card OPEN, which is why the
 * caller has to remember that measurement: once the cards are collapsed the
 * board is shorter, and asking the same question of the shorter board would say
 * "no" and un-condense it, straight back into "yes" — a flapping board on the
 * wall. The measured height only ever grows the answer's confidence; the
 * decision itself is made once per change of content.
 */
export function needsCondensing(fullHeight: number, availableHeight: number): boolean {
    if (fullHeight <= 0 || availableHeight <= 0) return false;
    return availableHeight / fullHeight < MIN_FIT_SCALE;
}
