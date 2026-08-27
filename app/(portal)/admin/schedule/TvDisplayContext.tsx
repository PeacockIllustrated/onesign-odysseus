'use client';

import { createContext, useContext } from 'react';

/**
 * How a job card should present itself on the workshop TV.
 *
 * This is a context rather than a prop chain on purpose. The alternative is
 * threading two values from the TV shell through WeekView → DayRow → cell →
 * JobCard (and the same again through MonthView), which would put TV-only
 * concerns into the shared grid components — exactly the drift between the
 * office board and the workshop board that CLAUDE.md §2d exists to prevent.
 *
 * With a context, the grid views are untouched: `JobCard` reads the display
 * mode and the office board, which never provides one, gets the default.
 */
export interface TvDisplay {
    /**
     * Collapse cards to a single title line. Set when the board holds more
     * work than can be shown in full without shrinking past legibility.
     */
    condensed: boolean;
    /**
     * The one job currently expanded out of a condensed board, so its detail
     * gets its turn on screen. null = everything stays collapsed.
     */
    spotlightId: string | null;
}

const OFF: TvDisplay = { condensed: false, spotlightId: null };

const TvDisplayContext = createContext<TvDisplay>(OFF);

export const TvDisplayProvider = TvDisplayContext.Provider;

/** Defaults to "off", so every non-TV surface behaves exactly as before. */
export function useTvDisplay(): TvDisplay {
    return useContext(TvDisplayContext);
}
