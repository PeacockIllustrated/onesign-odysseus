import type { SurveyConditions } from '@/lib/site-surveys/types';

// On-device draft for the simplified survey flow. We persist the few typed
// fields (client, job, date, conditions, notes) so a dropped connection or an
// accidental refresh on-site never loses them. Photos are NOT in here — they
// upload to the server the moment they're taken.

export interface SurveyDraft {
    client: string;
    job: string;
    date: string;
    conditions: SurveyConditions;
    notes: string;
    _ts: number;
}

const draftKey = (id: string) => `osd:survey-draft:${id}`;

export function readSurveyDraft(id: string): SurveyDraft | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(draftKey(id));
        return raw ? (JSON.parse(raw) as SurveyDraft) : null;
    } catch {
        return null;
    }
}

export function writeSurveyDraft(
    id: string,
    draft: Omit<SurveyDraft, '_ts'>,
) {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(
            draftKey(id),
            JSON.stringify({ ...draft, _ts: Date.now() }),
        );
    } catch {
        /* quota / private mode — best effort */
    }
}

export function clearSurveyDraft(id: string) {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.removeItem(draftKey(id));
    } catch {
        /* ignore */
    }
}
