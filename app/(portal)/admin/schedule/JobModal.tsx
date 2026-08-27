'use client';

import { useState, useTransition } from 'react';
import type {
    FittingJobView,
    Lane,
    ProjectManager,
    SaveFittingJobInput,
    Slot,
    Van,
} from '@/lib/schedule/types';
import {
    DAY_NAMES,
    dayIndex,
    formatWC,
    mapUrl,
    mondayOfISO,
    addDaysISO,
    toISO,
} from '@/lib/schedule/utils';
import { archiveFittingJob, saveFittingJob } from '@/lib/schedule/actions';

/** Slot names as the office says them, not the enum. */
const SLOT_LABEL: Record<Slot, string> = {
    AM: 'Morning',
    PM: 'Afternoon',
    DAY: 'All day',
    OOH: 'Out of hours',
};

/** The modal's working copy — everything is a string until it is saved. */
interface Draft {
    id?: string;
    customer_fallback: string;
    org_id: string | null;
    quote_ref: string;
    location: string;
    postcode: string;
    pm_id: string | null;
    van_id: string | null;
    scheduled_date: string | null;
    lane: Lane;
    slot: Slot;
    done: boolean;
    delivery_required: boolean;
    crew_override: string;
    access_equipment: string;
    summary: string;
    notes: string;
}

export function draftFromJob(job: FittingJobView): Draft {
    return {
        id: job.id,
        customer_fallback: job.customer_fallback ?? '',
        org_id: job.org_id,
        quote_ref: job.quote_ref ?? '',
        location: job.location ?? '',
        postcode: job.postcode ?? '',
        pm_id: job.pm_id,
        van_id: job.van_id,
        scheduled_date: job.scheduled_date,
        lane: job.lane,
        slot: job.slot,
        done: job.done,
        delivery_required: job.delivery_required,
        crew_override: job.crew_override ?? '',
        access_equipment: job.access_equipment ?? '',
        summary: job.summary ?? '',
        notes: job.notes ?? '',
    };
}

export function blankDraft(
    scheduled_date: string | null,
    van_id: string | null,
    slot: Slot,
    lane: Lane = 'scheduled'
): Draft {
    return {
        customer_fallback: '',
        org_id: null,
        quote_ref: '',
        location: '',
        postcode: '',
        pm_id: null,
        van_id,
        scheduled_date,
        lane,
        slot,
        done: false,
        delivery_required: false,
        crew_override: '',
        access_equipment: '',
        summary: '',
        notes: '',
    };
}

interface Props {
    draft: Draft;
    job: FittingJobView | null;
    vans: Van[];
    pms: ProjectManager[];
    clients: Array<{ id: string; name: string }>;
    onClose: () => void;
    onSaved: () => void;
}

export function JobModal({ draft, job, vans, pms, clients, onClose, onSaved }: Props) {
    const [d, setD] = useState<Draft>(draft);
    const [error, setError] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [pending, startTransition] = useTransition();

    // Reopening on a different card resets the form by remounting: the board
    // gives this component a fresh key per open, so there is no stale state to
    // clear here.

    const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
        setD((prev) => ({ ...prev, [k]: v }));

    const inHolding = d.scheduled_date == null;
    const pm = pms.find((p) => p.id === d.pm_id) ?? null;
    const link = job ? mapUrl(job) : null;

    /**
     * Toggling "no date yet" remembers the date it came from, so ticking and
     * unticking doesn't silently throw the placement away.
     */
    const [lastDate, setLastDate] = useState<string>(
        draft.scheduled_date ?? toISO(new Date())
    );
    function toggleHolding(checked: boolean) {
        if (checked) {
            if (d.scheduled_date) setLastDate(d.scheduled_date);
            set('scheduled_date', null);
        } else {
            setD((prev) => ({
                ...prev,
                scheduled_date: lastDate,
                van_id: prev.van_id ?? vans[0]?.id ?? null,
            }));
        }
    }

    /** The board thinks in w/c + weekday; the record stores a real date. */
    const monday = d.scheduled_date ? mondayOfISO(d.scheduled_date) : null;
    const weekday = d.scheduled_date ? dayIndex(d.scheduled_date) : 0;

    function setMonday(value: string) {
        if (!value) return;
        set('scheduled_date', addDaysISO(mondayOfISO(value), weekday));
    }
    function setWeekday(idx: number) {
        if (!monday) return;
        set('scheduled_date', addDaysISO(monday, idx));
    }

    function save() {
        setError(null);
        const input: SaveFittingJobInput = {
            id: d.id,
            org_id: d.org_id,
            customer_fallback: d.customer_fallback.trim() || null,
            quote_ref: d.quote_ref.trim() || null,
            location: d.location.trim() || null,
            postcode: d.postcode.trim() || null,
            pm_id: d.pm_id,
            van_id: d.scheduled_date ? d.van_id : null,
            scheduled_date: d.scheduled_date,
            lane: d.lane,
            slot: d.slot,
            done: d.done,
            delivery_required: d.delivery_required,
            crew_override: d.crew_override.trim() || null,
            access_equipment: d.access_equipment.trim() || null,
            summary: d.summary.trim() || null,
            notes: d.notes.trim() || null,
        };
        startTransition(async () => {
            const res = await saveFittingJob(input);
            if (!res.ok) {
                setError(res.error);
                return;
            }
            onSaved();
        });
    }

    function remove() {
        if (!d.id) return;
        startTransition(async () => {
            const res = await archiveFittingJob(d.id!);
            if (!res.ok) {
                setError(res.error);
                return;
            }
            onSaved();
        });
    }

    /**
     * Where a click on the board put this job. Only shown while creating: on
     * an existing job the fields below are the record, not a prefill, and a
     * banner would just repeat them.
     */
    const placement =
        !d.id && d.scheduled_date
            ? [
                  `${DAY_NAMES[dayIndex(d.scheduled_date)]} ${formatWC(d.scheduled_date)}`,
                  vans.find((v) => v.id === d.van_id)?.name,
                  SLOT_LABEL[d.slot],
              ]
                  .filter(Boolean)
                  .join(' · ')
            : null;

    const slotButton = (value: Slot, label: string) => (
        <button
            key={value}
            className={d.slot === value ? 'on' : ''}
            onClick={() => set('slot', value)}
        >
            {label}
        </button>
    );

    return (
        <div
            className="sb-overlay"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="sb-modal">
                <div className="sb-mhead">
                    <span>{d.id ? 'Job details' : 'Add job'}</span>
                    {pm && (
                        <span className="sb-pmchip" style={{ background: pm.colour }}>
                            {pm.name}
                        </span>
                    )}
                </div>

                {/* Clicking a slot on the board fills the day, van and time in
                    for you. Those fields sit well down a long form, so say so
                    up here — otherwise the prefill is invisible and people
                    re-enter what the click already captured. Everything named
                    is editable below. */}
                {placement && (
                    <p className="sb-placement">
                        Adding to <b>{placement}</b>
                        <span> — change it below if that&rsquo;s not right</span>
                    </p>
                )}

                <div className="sb-mbody">
                    <div className="sb-field full">
                        <label>Client</label>
                        <select
                            value={d.org_id ?? ''}
                            onChange={(e) => set('org_id', e.target.value || null)}
                        >
                            <option value="">— not a client record yet —</option>
                            {clients.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="sb-field full">
                        <label>
                            {d.org_id ? 'Job name (optional)' : 'Customer / job name *'}
                        </label>
                        <input
                            value={d.customer_fallback}
                            onChange={(e) => set('customer_fallback', e.target.value)}
                            placeholder="e.g. Vertu Motors Arena"
                        />
                    </div>

                    <div className="sb-field full">
                        <label>Summary (shown on the card)</label>
                        <input
                            value={d.summary}
                            onChange={(e) => set('summary', e.target.value)}
                            maxLength={160}
                            placeholder="e.g. Fascia + 2 projecting signs, scaffold up"
                        />
                        <p className="sb-note">
                            One line describing the work. Sits under the name on the board;
                            longer detail belongs in Notes.
                        </p>
                    </div>

                    <div className="sb-field full">
                        <label>Project manager (sets the card colour)</label>
                        <div className="sb-btnrow pms">
                            {pms.map((p) => (
                                <button
                                    key={p.id}
                                    style={{ ['--sb-pmbtn' as string]: p.colour }}
                                    className={d.pm_id === p.id ? 'on' : ''}
                                    onClick={() => set('pm_id', p.id)}
                                >
                                    {p.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="sb-field">
                        <label>Quote reference</label>
                        <input
                            value={d.quote_ref}
                            onChange={(e) => set('quote_ref', e.target.value)}
                            placeholder="OSD-2026-000000"
                        />
                    </div>

                    <div className="sb-field" style={{ display: 'flex', alignItems: 'flex-end' }}>
                        <label className="sb-checkrow">
                            <input
                                type="checkbox"
                                checked={d.done}
                                onChange={(e) => set('done', e.target.checked)}
                            />
                            Fitted / completed ✓
                        </label>
                    </div>

                    <div className="sb-field">
                        <label>Location</label>
                        <input
                            value={d.location}
                            onChange={(e) => set('location', e.target.value)}
                            placeholder="Town / site"
                        />
                    </div>

                    <div className="sb-field">
                        <label>Postcode</label>
                        <div className="sb-maprow">
                            <input
                                value={d.postcode}
                                onChange={(e) => set('postcode', e.target.value)}
                                placeholder="NE11 0TU"
                            />
                            {link && (
                                <a
                                    className="sb-mapbtn"
                                    href={link}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    Map ↗
                                </a>
                            )}
                        </div>
                    </div>

                    <div className="sb-field full">
                        <label className="sb-checkrow">
                            <input
                                type="checkbox"
                                checked={inHolding}
                                onChange={(e) => toggleHolding(e.target.checked)}
                            />
                            No date yet — keep in a holding list
                        </label>
                        {inHolding && (
                            <div className="sb-btnrow" style={{ marginTop: 8 }}>
                                <button
                                    className={d.lane !== 'delivery' ? 'on' : ''}
                                    onClick={() => set('lane', 'scheduled')}
                                >
                                    To be scheduled
                                </button>
                                <button
                                    className={d.lane === 'delivery' ? 'on' : ''}
                                    onClick={() => set('lane', 'delivery')}
                                >
                                    To be delivered
                                </button>
                            </div>
                        )}
                    </div>

                    <div className={`sb-field ${inHolding ? 'sb-dimmed' : ''}`}>
                        <label>Van</label>
                        <select
                            value={d.van_id ?? ''}
                            onChange={(e) => set('van_id', e.target.value || null)}
                        >
                            {vans.map((v) => (
                                <option key={v.id} value={v.id}>
                                    {v.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className={`sb-field ${inHolding ? 'sb-dimmed' : ''}`}>
                        <label>Crew override (optional)</label>
                        <input
                            value={d.crew_override}
                            onChange={(e) => set('crew_override', e.target.value)}
                            placeholder="e.g. Paul only, for the survey"
                        />
                    </div>

                    <div className={`sb-field ${inHolding ? 'sb-dimmed' : ''}`}>
                        <label>Week commencing</label>
                        <input
                            type="date"
                            value={monday ?? ''}
                            onChange={(e) => setMonday(e.target.value)}
                        />
                    </div>

                    <div className={`sb-field ${inHolding ? 'sb-dimmed' : ''}`}>
                        <label>Day</label>
                        <select
                            value={weekday}
                            onChange={(e) => setWeekday(Number(e.target.value))}
                        >
                            {DAY_NAMES.map((name, i) => (
                                <option key={name} value={i}>
                                    {name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className={`sb-field full ${inHolding ? 'sb-dimmed' : ''}`}>
                        <label>Time slot</label>
                        <div className="sb-btnrow">
                            {slotButton('AM', SLOT_LABEL.AM)}
                            {slotButton('PM', SLOT_LABEL.PM)}
                            {slotButton('DAY', SLOT_LABEL.DAY)}
                            {slotButton('OOH', SLOT_LABEL.OOH)}
                        </div>
                    </div>

                    <div className="sb-field full">
                        <label className="sb-checkrow">
                            <input
                                type="checkbox"
                                checked={d.delivery_required}
                                onChange={(e) => set('delivery_required', e.target.checked)}
                            />
                            Materials to be delivered ahead of the fit
                        </label>
                    </div>

                    <div className="sb-field full">
                        <label>Access / equipment</label>
                        <input
                            value={d.access_equipment}
                            onChange={(e) => set('access_equipment', e.target.value)}
                            placeholder="e.g. cherry picker booked, on site before 8am"
                        />
                    </div>

                    <div className="sb-field full">
                        <label>Notes</label>
                        <textarea
                            value={d.notes}
                            onChange={(e) => set('notes', e.target.value)}
                            placeholder="anything the fitters need to know"
                        />
                    </div>

                    {job?.job_ref && (
                        <div className="sb-field full">
                            <p className="sb-note" style={{ margin: 0 }}>
                                {job.job_ref}
                                {job.quote_number ? ` · quote ${job.quote_number}` : ''}
                            </p>
                        </div>
                    )}

                    {error && (
                        <div className="sb-field full">
                            <p className="sb-error">{error}</p>
                        </div>
                    )}
                </div>

                <div className="sb-mfoot">
                    {d.id &&
                        (confirmDelete ? (
                            <button className="sb-del" onClick={remove} disabled={pending}>
                                Confirm — archive this job
                            </button>
                        ) : (
                            <button className="sb-del" onClick={() => setConfirmDelete(true)}>
                                Delete
                            </button>
                        ))}
                    <span className="sb-grow" />
                    <button className="sb-btn" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="sb-btn primary" onClick={save} disabled={pending}>
                        {pending ? 'Saving…' : d.id ? 'Save changes' : 'Add job'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export type { Draft };
