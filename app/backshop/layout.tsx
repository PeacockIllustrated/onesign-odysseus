import { requireAuth } from '@/lib/auth';
import { BackshopHeader } from './BackshopHeader';

export const metadata = { title: 'Production board · Onesign Odysseus' };

/**
 * Backshop TV board layout. Lives OUTSIDE the (portal) route group on
 * purpose: a wall-mounted TV doesn't want the portal sidebar, and the portal
 * layout's getUserOrg() bounces users without org membership — which would
 * lock out floor staff. Here we only require a session (requireAuth) and own a
 * minimal dark, large-type chrome suited to a display read from across a room.
 */
export default async function BackshopLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await requireAuth();
    return (
        <div className="min-h-screen bg-[#0d0f11] text-neutral-100">
            <BackshopHeader />
            <main>{children}</main>
        </div>
    );
}
