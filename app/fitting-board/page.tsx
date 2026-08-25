import { redirect } from 'next/navigation';

/**
 * The workshop TV board moved to /schedule/tv, which says what it is and sits
 * next to the schedule it shows. This redirect keeps any kiosk browser or
 * bookmark already pointed at the old URL working, query string intact.
 */
export default async function FittingBoardRedirect({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(await searchParams)) {
        if (typeof value === 'string') params.set(key, value);
    }
    const qs = params.toString();
    redirect(qs ? `/schedule/tv?${qs}` : '/schedule/tv');
}
