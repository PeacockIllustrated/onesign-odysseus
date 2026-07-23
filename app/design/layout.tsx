import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'Design Your Sign · Onesign & Digital',
    description:
        'Build your own folded-aluminium aperture or projecting sign in 3D and send it straight to Onesign & Digital for a quote.',
    openGraph: {
        title: 'Design Your Sign · Onesign & Digital',
        description:
            'Build your own aperture or projecting sign in 3D and send it to us for a quote.',
    },
};

/**
 * Standalone layout for the PUBLIC design studio. Deliberately outside the
 * (portal) route group — no auth, no sidebar, no org gate (mirrors why
 * /backshop sits at the top level, CLAUDE.md §2b). Light, customer-facing
 * chrome with the Onesign brand and a single clear way to reach us.
 */
export default function DesignStudioLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex h-[100dvh] flex-col bg-neutral-50">
            <header className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-4 md:px-6">
                <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src="/Onesign-Logo-Black.svg"
                        alt="Onesign & Digital"
                        className="h-7 w-auto"
                    />
                    <div className="hidden h-6 w-px bg-neutral-200 sm:block" />
                    <div className="hidden sm:block">
                        <p className="text-sm font-bold leading-tight text-neutral-900">
                            Design your sign
                        </p>
                        <p className="text-[11px] leading-tight text-neutral-500">
                            Aperture &amp; projecting signage, built to order
                        </p>
                    </div>
                </div>
                <a
                    href="mailto:hello@onesignanddigital.com?subject=Sign%20enquiry"
                    className="rounded-lg border border-neutral-300 px-3.5 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-[#4e7e8c] hover:bg-[#e8f0f3] hover:text-[#3a5f6a]"
                >
                    Talk to us
                </a>
            </header>

            {/* No padding — the builder goes full-bleed to the viewport edges;
                the 3D stage needs every pixel, especially on mobile. */}
            <main className="min-h-0 flex-1 overflow-hidden">{children}</main>

            <footer className="hidden shrink-0 items-center justify-between border-t border-neutral-200 bg-white px-6 py-2 text-[11px] text-neutral-400 md:flex">
                <span>
                    &copy; {new Date().getFullYear()} Onesign &amp; Digital ·
                    Team Valley, Gateshead
                </span>
                <Link href="/login" className="hover:text-neutral-600">
                    Staff sign in
                </Link>
            </footer>
        </div>
    );
}
