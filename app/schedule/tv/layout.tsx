import { requireAuth } from '@/lib/auth';

export const metadata = { title: 'Fitting board · Onesign Odysseus' };

/**
 * Workshop TV layout for the fitting schedule (/schedule/tv).
 *
 * Lives OUTSIDE the (portal) route group on purpose, and it is the ONLY way
 * to get a board with no chrome: a page nested under (portal) — including
 * /admin/schedule/tv — inherits the portal layout, so the sidebar and topbar
 * come with it however the board itself is styled. Same reasoning as
 * /backshop: that chrome is useless on a wall-mounted TV, and the portal
 * layout's org gate is the wrong question to ask of floor staff. Here we only
 * require a session.
 *
 * The TV always runs the dark stage: there is no topbar toggle out here, and a
 * bright wall panel in a workshop is glare. `dark` is the app's own theme
 * class, so the board picks up the same tokens every other page uses rather
 * than carrying a palette of its own.
 *
 * Read-only is enforced in the board itself (tv mode hides every edit
 * affordance and disables drag), so a stray press on the TV remote can't move
 * a job.
 */
export default async function ScheduleTvLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await requireAuth();
    return (
        <div className="dark min-h-screen bg-[var(--bg)] text-[var(--bg-fg)]">
            {children}
        </div>
    );
}
