/**
 * Pure helpers for the delivery planning week view.
 */

export interface PlanningDelivery {
    id: string;
    scheduled_date: string;
    driver_id: string | null;
    driver_name: string | null;
    delivery_number: string;
    site_name: string | null;
    site_lat: number | null;
    site_lng: number | null;
    org_name: string | null;
    status: string;
}

export interface DayGroup {
    drivers: Record<string, PlanningDelivery[]>;
    unassigned: PlanningDelivery[];
}

/**
 * Group deliveries by date, then within each date by driver_id.
 * Deliveries with driver_id=null go into the 'unassigned' bucket.
 */
export function groupDeliveriesByDriverAndDay(
    deliveries: PlanningDelivery[]
): Record<string, DayGroup> {
    const result: Record<string, DayGroup> = {};

    for (const d of deliveries) {
        const date = d.scheduled_date;
        if (!result[date]) {
            result[date] = { drivers: {}, unassigned: [] };
        }
        if (d.driver_id) {
            if (!result[date].drivers[d.driver_id]) {
                result[date].drivers[d.driver_id] = [];
            }
            result[date].drivers[d.driver_id].push(d);
        } else {
            result[date].unassigned.push(d);
        }
    }

    return result;
}

/**
 * Get an array of date strings (YYYY-MM-DD) for a week starting
 * from the given Monday.
 */
export function getWeekDates(monday: string, includeWeekends: boolean): string[] {
    const start = new Date(monday + 'T00:00:00Z');
    const days = includeWeekends ? 7 : 5;
    const dates: string[] = [];
    for (let i = 0; i < days; i++) {
        const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
        dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
}

/**
 * Get the Monday of the week containing the given date.
 */
export function getMonday(date: string): string {
    const d = new Date(date + 'T00:00:00Z');
    const day = d.getUTCDay();
    const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
    d.setUTCDate(diff);
    return d.toISOString().slice(0, 10);
}
