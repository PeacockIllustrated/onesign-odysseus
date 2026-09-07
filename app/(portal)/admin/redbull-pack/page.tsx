import { requireAdmin } from '@/lib/auth';
import { getJobPack } from '@/lib/redbull-pack/actions';
import { DEFAULT_PACK_SLUG } from '@/lib/redbull-pack/types';
import { RedbullPackClient } from './RedbullPackClient';

export const dynamic = 'force-dynamic';

/**
 * The band is the club's own navy — #001D46 is literally a value in the pack
 * ("NRB blue #001D46"), the flat colour half the boards are printed in — so
 * the editor is dressed in the thing it is editing.
 */
const NRB_BLUE = '#001D46';

export default async function RedbullPackPage() {
    await requireAdmin();

    const res = await getJobPack(DEFAULT_PACK_SLUG);
    const pack = res.ok ? res.data.pack : null;

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <header
                className="mb-5 flex items-center gap-4 rounded-lg px-5 py-4 shadow-sm"
                style={{ background: NRB_BLUE }}
            >
                {/* eslint-disable-next-line @next/next/no-img-element --
                    a fixed brand SVG: next/image cannot optimise SVG without
                    dangerouslyAllowSVG, and there is nothing to gain here. */}
                <img
                    src="/clients/newcastle-red-bulls.svg"
                    alt=""
                    width={104}
                    height={136}
                    className="h-14 w-auto shrink-0 drop-shadow-sm"
                />
                <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
                        Job pack
                    </p>
                    <h1 className="text-xl font-bold tracking-tight text-white truncate">
                        {pack ? pack.client : 'Newcastle Red Bulls'}
                    </h1>
                    <p className="text-sm text-white/55">
                        {pack
                            ? `${pack.venue} · Revision ${pack.revision}`
                            : 'Kingston Park'}
                    </p>
                </div>
            </header>

            <p className="mb-6 text-sm text-[var(--bg-fg-muted)]">
                Editing a row here changes what redbull.onesignanddigital.co.uk shows within
                about 30 seconds — there is no separate publish step for row edits.
            </p>

            {!res.ok ? (
                <div className="p-3 rounded border border-red-200 bg-red-50 text-sm text-red-700">
                    Failed to load the job pack: {res.error}
                </div>
            ) : (
                <RedbullPackClient pack={res.data.pack} states={res.data.states} />
            )}
        </div>
    );
}
