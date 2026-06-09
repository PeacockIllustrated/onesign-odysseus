import type {
    Measurements,
    SurveyConditions,
    SurveyItemInput,
    SurveyItemRow,
} from '@/lib/site-surveys/types';

// Editable item shape used by the detail editor. Dimensions are kept as strings
// (raw input) and converted to numbers only when building Measurements, so a
// half-typed "12" doesn't churn through validation on every keystroke.
export interface EditItem {
    key: string; // stable local key for React (survives before a DB id exists)
    id?: string; // DB id once saved
    label: string;
    sign_type: string;
    width: string;
    height: string;
    depth: string;
    returnDepth: string;
    shadowGap: string;
    extra: { label: string; value: string }[];
    has_returns: boolean;
    shadow_gap_required: boolean;
    new_fascia_required: boolean;
    illuminated: boolean;
    fixing_substrate: string;
    item_notes: string;
}

let keySeq = 0;
export function newKey(): string {
    keySeq += 1;
    return `it_${keySeq}_${keySeq * 7 + 3}`;
}

const num = (s: string): number | undefined => {
    const t = s.trim();
    if (t === '') return undefined;
    const v = Number(t);
    return Number.isFinite(v) && v >= 0 ? v : undefined;
};

export function toMeasurements(it: EditItem): Measurements {
    const m: Measurements = {};
    const w = num(it.width);
    const h = num(it.height);
    const d = num(it.depth);
    const r = num(it.returnDepth);
    const sg = num(it.shadowGap);
    if (w !== undefined) m.width_mm = w;
    if (h !== undefined) m.height_mm = h;
    if (d !== undefined) m.depth_mm = d;
    if (r !== undefined) m.return_depth_mm = r;
    if (sg !== undefined) m.shadow_gap_mm = sg;
    const extra = it.extra
        .map((e) => ({ label: e.label.trim(), value_mm: num(e.value) }))
        .filter((e) => e.label !== '' && e.value_mm !== undefined)
        .map((e) => ({ label: e.label, value_mm: e.value_mm as number }));
    if (extra.length > 0) m.extra = extra;
    return m;
}

export function itemToInput(it: EditItem, index: number): SurveyItemInput {
    return {
        id: it.id,
        label: it.label.trim() || `Item ${index + 1}`,
        sign_type: it.sign_type,
        measurements: toMeasurements(it),
        has_returns: it.has_returns,
        shadow_gap_required: it.shadow_gap_required,
        new_fascia_required: it.new_fascia_required,
        illuminated: it.illuminated,
        fixing_substrate: it.fixing_substrate,
        item_notes: it.item_notes,
        sort_order: index,
    };
}

export function rowToEditItem(row: SurveyItemRow): EditItem {
    const m = row.measurements_json ?? {};
    const s = (v: number | undefined) => (v === undefined ? '' : String(v));
    return {
        key: newKey(),
        id: row.id,
        label: row.label,
        sign_type: row.sign_type ?? '',
        width: s(m.width_mm),
        height: s(m.height_mm),
        depth: s(m.depth_mm),
        returnDepth: s(m.return_depth_mm),
        shadowGap: s(m.shadow_gap_mm),
        extra: (m.extra ?? []).map((e) => ({
            label: e.label,
            value: String(e.value_mm),
        })),
        has_returns: row.has_returns,
        shadow_gap_required: row.shadow_gap_required,
        new_fascia_required: row.new_fascia_required,
        illuminated: row.illuminated,
        fixing_substrate: row.fixing_substrate ?? '',
        item_notes: row.item_notes ?? '',
    };
}

export function blankItem(): EditItem {
    return {
        key: newKey(),
        label: '',
        sign_type: '',
        width: '',
        height: '',
        depth: '',
        returnDepth: '',
        shadowGap: '',
        extra: [],
        has_returns: false,
        shadow_gap_required: false,
        new_fascia_required: false,
        illuminated: false,
        fixing_substrate: '',
        item_notes: '',
    };
}

// ---------------------------------------------------------------------------
// Local-draft persistence (the "online, drafts saved locally" requirement).
// We persist the typed/measured state — NOT photo binaries (those upload
// immediately and live server-side). Keyed per survey id.
// ---------------------------------------------------------------------------
export interface SurveyDraft {
    header: {
        title: string;
        orgId: string;
        clientName: string;
        siteId: string;
        siteAddress: string;
        contactId: string;
        surveyDate: string;
    };
    conditions: SurveyConditions;
    notes: string;
    items: EditItem[];
    _ts: number;
}

const draftKey = (id: string) => `osd:survey-draft:${id}`;

export function readSurveyDraft(id: string): SurveyDraft | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(draftKey(id));
        if (!raw) return null;
        return JSON.parse(raw) as SurveyDraft;
    } catch {
        return null;
    }
}

export function writeSurveyDraft(id: string, draft: Omit<SurveyDraft, '_ts'>) {
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
