import { requireAuth } from '@/lib/auth';

export const metadata = { title: 'Fitting board · Onesign Odysseus' };

/**
 * Workshop TV layout for the fitting schedule.
 *
 * Lives OUTSIDE the (portal) route group for the same two reasons as
 * /backshop: the portal sidebar and topbar are useless on a wall-mounted TV,
 * and the portal layout's getUserOrg() bounces any user without org membership
 * to /login?error=no_org — which would lock out the very floor staff the board
 * is for. Here we only require a session.
 *
 * Read-only is enforced in the board itself (tv mode hides every edit
 * affordance and disables drag), so a stray press on the TV remote can't move
 * a job.
 */
export default async function FittingBoardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await requireAuth();
    return <div className="min-h-screen">{children}</div>;
}
