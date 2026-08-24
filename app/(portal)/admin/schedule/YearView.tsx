'use client';

import type { FittingJobView, Van } from '@/lib/schedule/types';
import {
    MONTH_NAMES,
    addDaysISO,
    formatWC,
    fromISO,
    heatLevel,
    indexByDateAndVan,
    mondaysTouchingMonth,
    weekLoad,
} from '@/lib/schedule/utils';

interface Props {
    year: number;
    jobs: FittingJobView[];
    vans: Van[];
    onJumpWeek: (monday: string) => void;
}

/**
 * Twelve month panels, each listing its w/c rows with one heat cell per van.
 * The point is spotting quiet and overloaded weeks months ahead — it is a
 * capacity read, not an editing surface, so nothing here drags.
 */
export function YearView({ year, jobs, vans, onJumpWeek }: Props) {
    const index = indexByDateAndVan(jobs);

    const annualTotal = (vanId: string) =>
        jobs.filter(
            (j) =>
                j.archived_at == null &&
                j.van_id === vanId &&
                j.scheduled_date?.slice(0, 4) === String(year)
        ).length;

    return (
        <>
            <div className="sb-ytotals">
                {vans.map((v) => (
                    <span key={v.id}>
                        {v.name} — <b>{annualTotal(v.id)} jobs in {year}</b>
                    </span>
                ))}
                <span className="sb-heatkey">
                    Quiet
                    {[0, 1, 2, 3, 4].map((h) => (
                        <span key={h} className={`sb-hk sb-heat h${h}`} />
                    ))}
                    Busy
                </span>
            </div>

            <div className="sb-ymgrid">
                {MONTH_NAMES.map((name, m) => {
                    // Only weeks that genuinely belong to this month, so a
                    // straddling week isn't counted twice down the page.
                    const mondays = mondaysTouchingMonth(year, m).filter(
                        (mon) =>
                            fromISO(mon).getMonth() === m ||
                            fromISO(addDaysISO(mon, 6)).getMonth() === m
                    );
                    return (
                        <div key={name} className="sb-ymonth">
                            <h3>{name}</h3>
                            {mondays.map((mon) => (
                                <button
                                    key={mon}
                                    className="sb-yweek"
                                    onClick={() => onJumpWeek(mon)}
                                >
                                    <span className="wcl">w/c {formatWC(mon)}</span>
                                    <span
                                        className="cells"
                                        style={{ ['--sb-vans' as string]: vans.length }}
                                    >
                                        {vans.map((v) => {
                                            const n = weekLoad(index, mon, v.id);
                                            return (
                                                <span
                                                    key={v.id}
                                                    className={`sb-heat h${heatLevel(n)}`}
                                                    title={`${v.name}: ${n} live job${
                                                        n === 1 ? '' : 's'
                                                    }`}
                                                >
                                                    {n > 0 ? n : ''}
                                                </span>
                                            );
                                        })}
                                    </span>
                                </button>
                            ))}
                        </div>
                    );
                })}
            </div>
        </>
    );
}
