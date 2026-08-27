import { requireAdmin } from '@/lib/auth';
import { PageHeader } from '@/app/(portal)/components/ui';
import { QrCode, ExternalLink } from 'lucide-react';
import { listQrLinks, getQrLinksOverview } from '@/lib/qr-links/actions';
import { lynxRedirectBase } from '@/lib/qr-links/client';
import { QrLinksClient } from './QrLinksClient';

export const dynamic = 'force-dynamic';

/**
 * QR Links — a read-only overview of the managed QR / NFC codes Onesign Lynx
 * runs, with Lynx's own scan analytics, so the office can see how the codes on
 * a client's signage are actually performing without a second login.
 *
 * Lynx stays the place a link is created, restyled, redirected or paused; this
 * is the window, not a second editor (see `lib/qr-links/client.ts`).
 */
export default async function QrLinksPage() {
    await requireAdmin();

    // Independent reads — the overview roll-up and the link list don't depend
    // on each other, so don't make one wait for the other.
    const [linksResult, overviewResult] = await Promise.all([listQrLinks(), getQrLinksOverview()]);

    const lynxUrl = lynxRedirectBase();

    if (!linksResult.ok) {
        return (
            <div className="mx-auto max-w-6xl p-6">
                <Header lynxUrl={lynxUrl} />
                <div className="card-base">
                    <div className="py-12 text-center">
                        <QrCode size={36} className="mx-auto mb-3 text-[var(--fg-subtle)]" />
                        <p className="text-sm font-medium text-[var(--fg)]">Lynx isn&rsquo;t connected</p>
                        <p className="mx-auto mt-2 max-w-md text-sm text-[var(--fg-muted)]">
                            {linksResult.error}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    if (linksResult.data.length === 0) {
        return (
            <div className="mx-auto max-w-6xl p-6">
                <Header lynxUrl={lynxUrl} />
                <div className="card-base">
                    <div className="py-12 text-center">
                        <QrCode size={36} className="mx-auto mb-3 text-[var(--fg-subtle)]" />
                        <p className="text-sm font-medium text-[var(--fg)]">No QR links yet</p>
                        <p className="mx-auto mt-2 max-w-md text-sm text-[var(--fg-muted)]">
                            Codes created in Lynx appear here automatically, with their scan
                            analytics.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-[1600px] p-6">
            <Header lynxUrl={lynxUrl} />
            <QrLinksClient
                links={linksResult.data}
                // The roll-up is a nice-to-have: if it fails, the list and the
                // per-link analytics still work, so degrade rather than error out.
                overview={overviewResult.ok ? overviewResult.data : null}
                redirectBase={lynxUrl}
            />
        </div>
    );
}

function Header({ lynxUrl }: { lynxUrl: string }) {
    return (
        <PageHeader
            title="QR Links"
            description="live QR and NFC codes running on Onesign Lynx — scans, devices and reach for every code we've put out in the field"
            action={
                <a
                    href={lynxUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary inline-flex items-center gap-2"
                >
                    <ExternalLink size={14} />
                    Manage in Lynx
                </a>
            }
        />
    );
}
