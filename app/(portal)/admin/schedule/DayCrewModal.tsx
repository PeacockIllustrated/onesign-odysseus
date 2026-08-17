'use client';

import { useMemo, useState, useTransition } from 'react';
import type {
    DayAssignment,
    DayCrewOverrideRow,
    DefaultCrewRow,
    Fitter,
    Placement,
    Van,
} from '@/lib/schedule/types';
import {
    DAY_NAMES,
    assignmentForDate,
    crewWarning,
    dayIndex,
    formatLong,
} from '@/lib/schedule/utils';
import { resetDayCrew, saveDayCrew } from '@/lib/schedule/actions';

interface Props {
    date: string;
    vans: Van[];
    fitters: Fitter[];
    defaultCrew: DefaultCrewRow[];
    overrides: DayCrewOverrideRow[];
    onClose: () => void;
    onSaved: () => void;
}

/**
 * Per-day crews. Warnings are computed from the working copy, so understaffing
 * shows up while the office is still deciding rather than after the save.
 */
export function DayCrewModal({
    date,
    vans,
    fitters,
    defaultCrew,
    overrides,
    onClose,
    onSaved,
}: Props) {
    const initial = useMemo(
        () => assignmentForDate(date, fitters, defaultCrew, overrides),
        [date, fitters, defaultCrew, overrides]
    );
    const [assign, setAssign] = useState<DayAssignment>(initial.assignment);
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    const active = fitters.filter((f) => f.is_active);
    const crewGroup = active.filter((f) => f.roster_group === 'crew');
    const extras = active.filter((f) => f.roster_group === 'additional');

    // Live preview of the day being edited.
    const crews: Record<string, string[]> = {};
    for (const v of vans) crews[v.id] = [];
    const holiday: string[] = [];
    for (const f of active) {
        const p = assign[f.id];
        if (!p) continue;
        if (p.kind === 'holiday') holiday.push(f.name);
        else if (p.kind === 'van' && crews[p.vanId]) crews[p.vanId].push(f.name);
    }

    const set = (fitterId: string, placement: Placement) =>
        setAssign((prev) => ({ ...prev, [fitterId]: placement }));

    function save() {
        setError(null);
        startTransition(async () => {
            const res = await saveDayCrew({
                date,
                assignments: active.map((f) => {
                    const p = assign[f.id] ?? { kind: 'off' as const };
                    return {
                        fitter_id: f.id,
                        assignment: p.kind === 'van' ? ('van' as const) : p.kind,
                        van_id: p.kind === 'van' ? p.vanId : null,
                    };
                }),
            });
            if (!res.ok) {
                setError(res.error);
                return;
            }
            onSaved();
        });
    }

    function reset() {
        setError(null);
        startTransition(async () => {
            const res = await resetDayCrew(date);
            if (!res.ok) {
                setError(res.error);
                return;
            }
            onSaved();
        });
    }

    const row = (f: Fitter) => {
        const p = assign[f.id];
        return (
            <div key={f.id} className="sb-fitterrow">
                <span className="sb-fname">{f.name}</span>
                <div
                    className="sb-assignseg"
                    style={{ ['--sb-segcols' as string]: vans.length + 2 }}
                >
                    {vans.map((v) => (
                        <button
                            key={v.id}
                            className={p?.kind === 'van' && p.vanId === v.id ? 'on' : ''}
                            onClick={() => set(f.id, { kind: 'van', vanId: v.id })}
                        >
                            {v.name.replace(/^Van /i, 'V')}
                        </button>
                    ))}
                    <button
                        className={p?.kind === 'holiday' ? 'on hol' : ''}
                        onClick={() => set(f.id, { kind: 'holiday' })}
                    >
                        holiday
                    </button>
                    <button
                        className={p?.kind === 'off' ? 'on off' : ''}
                        onClick={() => set(f.id, { kind: 'off' })}
                    >
                        off / shop
                    </button>
                </div>
            </div>
        );
    };

    return (
        <div
            className="sb-overlay"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="sb-modal">
                <div className="sb-mhead">
                    crews for {DAY_NAMES[dayIndex(date)].toLowerCase()} {formatLong(date)}
                </div>

                <div style={{ padding: 20 }}>
                    <p className="sb-note">
                        This changes the crews for <b>this day only</b>. Every other day keeps
                        the standing pairings. Holidays show on the board so nothing gets
                        missed.
                    </p>

                    <div className="sb-rosterhead">fitting crew</div>
                    {crewGroup.map(row)}

                    <div className="sb-rosterhead">additional bodies</div>
                    {extras.length > 0 ? (
                        extras.map(row)
                    ) : (
                        <p className="sb-note" style={{ margin: '6px 0 0' }}>
                            Nobody listed — add people in &ldquo;vans &amp; fitters&rdquo;.
                        </p>
                    )}

                    <div
                        className="sb-vansum"
                        style={{ ['--sb-vans' as string]: vans.length }}
                    >
                        {vans.map((v) => {
                            const crew = crews[v.id] ?? [];
                            const warn = crewWarning(crew);
                            return (
                                <div
                                    key={v.id}
                                    className={`v ${
                                        warn === 'empty' ? 'badv' : warn === 'solo' ? 'warnv' : ''
                                    }`}
                                >
                                    <b>{v.name}</b>
                                    <span>
                                        {crew.length ? crew.join(' & ') : '⚠ nobody assigned'}
                                        {warn === 'solo' ? ' ⚠' : ''}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    {holiday.length > 0 && (
                        <p className="sb-note" style={{ marginTop: 10 }}>
                            On holiday: {holiday.join(', ')}
                        </p>
                    )}

                    {error && <p className="sb-error">{error}</p>}
                </div>

                <div className="sb-mfoot">
                    {initial.override && (
                        <button className="sb-btn ghost" onClick={reset} disabled={pending}>
                            reset to default crews
                        </button>
                    )}
                    <span className="sb-grow" />
                    <button className="sb-btn" onClick={onClose}>
                        cancel
                    </button>
                    <button className="sb-btn primary" onClick={save} disabled={pending}>
                        {pending ? 'saving…' : 'save this day'}
                    </button>
                </div>
            </div>
        </div>
    );
}
