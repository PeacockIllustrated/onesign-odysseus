'use client';

import { useState, useTransition } from 'react';
import type { DefaultCrewRow, Fitter, Van } from '@/lib/schedule/types';
import { bookHolidayRange, saveFitter, saveVan } from '@/lib/schedule/actions';
import { toISO } from '@/lib/schedule/utils';

interface Props {
    vans: Van[];
    fitters: Fitter[];
    defaultCrew: DefaultCrewRow[];
    onClose: () => void;
    onSaved: () => void;
}

/**
 * Vans, fitters and holiday ranges. Vans and fitters are tables rather than
 * constants because a fourth van is plausible and people join and leave;
 * leavers are deactivated so historic day crews still resolve.
 */
export function RosterModal({ vans, fitters, defaultCrew, onClose, onSaved }: Props) {
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    const [newVan, setNewVan] = useState('');
    const [newFitter, setNewFitter] = useState('');
    const [newFitterGroup, setNewFitterGroup] =
        useState<'crew' | 'additional'>('additional');

    const today = toISO(new Date());
    const [holFitter, setHolFitter] = useState<string>(fitters[0]?.id ?? '');
    const [holFrom, setHolFrom] = useState(today);
    const [holTo, setHolTo] = useState(today);
    const [holNote, setHolNote] = useState<string | null>(null);

    const vanOf = (fitterId: string) =>
        defaultCrew.find((r) => r.fitter_id === fitterId)?.van_id ?? '';

    function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
        setError(null);
        startTransition(async () => {
            const res = await fn();
            if (!res.ok) {
                setError(res.error ?? 'something went wrong');
                return;
            }
            after?.();
            onSaved();
        });
    }

    return (
        <div
            className="sb-overlay"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="sb-modal">
                <div className="sb-mhead">vans &amp; fitters</div>

                <div style={{ padding: 20 }}>
                    <div className="sb-rosterhead">vans</div>
                    {vans.map((v) => (
                        <div key={v.id} className="sb-fitterrow">
                            <input
                                defaultValue={v.name}
                                onBlur={(e) => {
                                    if (e.target.value.trim() && e.target.value !== v.name) {
                                        run(() =>
                                            saveVan({ id: v.id, name: e.target.value.trim() })
                                        );
                                    }
                                }}
                            />
                            <button
                                className="sb-btn"
                                style={{ flexShrink: 0 }}
                                onClick={() =>
                                    run(() =>
                                        saveVan({
                                            id: v.id,
                                            name: v.name,
                                            is_active: !v.is_active,
                                        })
                                    )
                                }
                            >
                                {v.is_active ? 'retire' : 'restore'}
                            </button>
                        </div>
                    ))}
                    <div className="sb-fitterrow">
                        <input
                            value={newVan}
                            onChange={(e) => setNewVan(e.target.value)}
                            placeholder="add a van…"
                        />
                        <button
                            className="sb-btn"
                            style={{ flexShrink: 0 }}
                            disabled={!newVan.trim() || pending}
                            onClick={() =>
                                run(
                                    () =>
                                        saveVan({
                                            name: newVan.trim(),
                                            sort_order: vans.length + 1,
                                        }),
                                    () => setNewVan('')
                                )
                            }
                        >
                            add
                        </button>
                    </div>

                    <div className="sb-rosterhead">roster</div>
                    <p className="sb-note" style={{ marginTop: 8 }}>
                        People move, vans don&rsquo;t. A fitter&rsquo;s standing van applies
                        every day; use &ldquo;change crews&rdquo; on the board for a one-off
                        swap.
                    </p>
                    {fitters.map((f) => (
                        <div key={f.id} className="sb-fitterrow">
                            <span className="sb-fname">{f.name}</span>
                            <select
                                defaultValue={vanOf(f.id)}
                                onChange={(e) =>
                                    run(() =>
                                        saveFitter({
                                            id: f.id,
                                            name: f.name,
                                            roster_group: f.roster_group,
                                            default_van_id: e.target.value || null,
                                        })
                                    )
                                }
                            >
                                <option value="">no standing van</option>
                                {vans.map((v) => (
                                    <option key={v.id} value={v.id}>
                                        {v.name}
                                    </option>
                                ))}
                            </select>
                            <select
                                defaultValue={f.roster_group}
                                onChange={(e) =>
                                    run(() =>
                                        saveFitter({
                                            id: f.id,
                                            name: f.name,
                                            roster_group: e.target.value as
                                                | 'crew'
                                                | 'additional',
                                        })
                                    )
                                }
                            >
                                <option value="crew">fitting crew</option>
                                <option value="additional">additional</option>
                            </select>
                            <button
                                className="sb-btn"
                                style={{ flexShrink: 0 }}
                                onClick={() =>
                                    run(() =>
                                        saveFitter({
                                            id: f.id,
                                            name: f.name,
                                            roster_group: f.roster_group,
                                            is_active: !f.is_active,
                                        })
                                    )
                                }
                            >
                                {f.is_active ? 'deactivate' : 'restore'}
                            </button>
                        </div>
                    ))}
                    <div className="sb-fitterrow">
                        <input
                            value={newFitter}
                            onChange={(e) => setNewFitter(e.target.value)}
                            placeholder="add someone…"
                        />
                        <select
                            value={newFitterGroup}
                            onChange={(e) =>
                                setNewFitterGroup(e.target.value as 'crew' | 'additional')
                            }
                        >
                            <option value="crew">fitting crew</option>
                            <option value="additional">additional</option>
                        </select>
                        <button
                            className="sb-btn"
                            style={{ flexShrink: 0 }}
                            disabled={!newFitter.trim() || pending}
                            onClick={() =>
                                run(
                                    () =>
                                        saveFitter({
                                            name: newFitter.trim(),
                                            roster_group: newFitterGroup,
                                            sort_order: fitters.length + 1,
                                        }),
                                    () => setNewFitter('')
                                )
                            }
                        >
                            add
                        </button>
                    </div>

                    {/* Booking a fortnight one day at a time is exactly the admin
                        the whiteboard forced, so the range expands server-side. */}
                    <div className="sb-rosterhead">book holiday</div>
                    <div className="sb-fitterrow">
                        <select
                            value={holFitter}
                            onChange={(e) => setHolFitter(e.target.value)}
                        >
                            {fitters
                                .filter((f) => f.is_active)
                                .map((f) => (
                                    <option key={f.id} value={f.id}>
                                        {f.name}
                                    </option>
                                ))}
                        </select>
                        <input
                            type="date"
                            value={holFrom}
                            onChange={(e) => setHolFrom(e.target.value)}
                        />
                        <input
                            type="date"
                            value={holTo}
                            onChange={(e) => setHolTo(e.target.value)}
                        />
                        <button
                            className="sb-btn"
                            style={{ flexShrink: 0 }}
                            disabled={!holFitter || pending}
                            onClick={() => {
                                setError(null);
                                setHolNote(null);
                                startTransition(async () => {
                                    const res = await bookHolidayRange({
                                        fitter_id: holFitter,
                                        from: holFrom,
                                        to: holTo,
                                    });
                                    if (!res.ok) {
                                        setError(res.error);
                                        return;
                                    }
                                    setHolNote(
                                        `booked ${res.data.days} working day${
                                            res.data.days === 1 ? '' : 's'
                                        }`
                                    );
                                    onSaved();
                                });
                            }}
                        >
                            book
                        </button>
                    </div>
                    <p className="sb-note" style={{ marginTop: 8 }}>
                        Weekends are skipped. The range expands into one entry per working
                        day, so the board shows the holiday on every affected day.
                    </p>
                    {holNote && (
                        <p className="sb-note" style={{ color: 'var(--sb-accent)' }}>
                            {holNote}
                        </p>
                    )}

                    {error && <p className="sb-error">{error}</p>}
                </div>

                <div className="sb-mfoot">
                    <span className="sb-grow" />
                    <button className="sb-btn primary" onClick={onClose}>
                        done
                    </button>
                </div>
            </div>
        </div>
    );
}
