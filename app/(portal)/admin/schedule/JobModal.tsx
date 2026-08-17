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
import { DAY_NAMES, dayIndex, mapUrl, mondayOfISO, addDaysISO, toISO } from '@/lib/schedule/utils';
import { archiveFittingJob, saveFittingJob } from '@/lib/schedule/actions';

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
                    <span>{d.id ? 'job details' : 'add job'}</span>
                    {pm && (
                        <span className="sb-pmchip" style={{ background: pm.colour }}>
                            {pm.name}
                        </span>
                    )}
                </div>

                <div className="sb-mbody">
                    <div className="sb-field full">
                        <label>client</label>
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
                            {d.org_id ? 'job name (optional)' : 'customer / job name *'}
                        </label>
                        <input
                            value={d.customer_fallback}
                            onChange={(e) => set('customer_fallback', e.target.value)}
                            placeholder="e.g. Vertu Motors Arena"
                        />
                    </div>

                    <div className="sb-field full">
                        <label>project manager (sets the colour)</label>
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
                        <label>quote reference</label>
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
                            fitted / completed ✓
                        </label>
                    </div>

                    <div className="sb-field">
                        <label>location</label>
                        <input
                            value={d.location}
                            onChange={(e) => set('location', e.target.value)}
                            placeholder="town / site"
                        />
                    </div>

                    <div className="sb-field">
                        <label>postcode</label>
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
                                    map ↗
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
                            no date yet — keep in a holding list
                        </label>
                        {inHolding && (
                            <div className="sb-btnrow" style={{ marginTop: 8 }}>
                                <button
                                    className={d.lane !== 'delivery' ? 'on' : ''}
                                    onClick={() => set('lane', 'scheduled')}
                                >
                                    to be scheduled
                                </button>
                                <button
                                    className={d.lane === 'delivery' ? 'on' : ''}
                                    onClick={() => set('lane', 'delivery')}
                                >
                                    to be delivered
                                </button>
                            </div>
                        )}
                    </div>

                    <div className={`sb-field ${inHolding ? 'sb-dimmed' : ''}`}>
                        <label>van</label>
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
                        <label>crew override (optional)</label>
                        <input
                            value={d.crew_override}
                            onChange={(e) => set('crew_override', e.target.value)}
                            placeholder="e.g. Paul only, for the survey"
                        />
                    </div>

                    <div className={`sb-field ${inHolding ? 'sb-dimmed' : ''}`}>
                        <label>week commencing</label>
                        <input
                            type="date"
                            value={monday ?? ''}
                            onChange={(e) => setMonday(e.target.value)}
                        />
                    </div>

                    <div className={`sb-field ${inHolding ? 'sb-dimmed' : ''}`}>
                        <label>day</label>
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
                        <label>time slot</label>
                        <div className="sb-btnrow">
                            {slotButton('AM', 'morning')}
                            {slotButton('PM', 'afternoon')}
                            {slotButton('DAY', 'all day')}
                            {slotButton('OOH', 'out of hours')}
                        </div>
                    </div>

                    <div className="sb-field full">
                        <label className="sb-checkrow">
                            <input
                                type="checkbox"
                                checked={d.delivery_required}
                                onChange={(e) => set('delivery_required', e.target.checked)}
                            />
                            materials to be delivered ahead of the fit
                        </label>
                    </div>

                    <div className="sb-field full">
                        <label>access / equipment</label>
                        <input
                            value={d.access_equipment}
                            onChange={(e) => set('access_equipment', e.target.value)}
                            placeholder="e.g. cherry picker booked, on site before 8am"
                        />
                    </div>

                    <div className="sb-field full">
                        <label>notes</label>
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
                                confirm — archive this job
                            </button>
                        ) : (
                            <button className="sb-del" onClick={() => setConfirmDelete(true)}>
                                delete
                            </button>
                        ))}
                    <span className="sb-grow" />
                    <button className="sb-btn" onClick={onClose}>
                        cancel
                    </button>
                    <button className="sb-btn primary" onClick={save} disabled={pending}>
                        {pending ? 'saving…' : d.id ? 'save changes' : 'add job'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export type { Draft };
