import Link from 'next/link';
import { requireStaff } from '@/lib/auth';
import { signOut } from '@/lib/auth';
import { LogOut, Factory } from 'lucide-react';

export const metadata = { title: 'Shop Floor · Onesign Odysseus' };

/**
 * Shop-floor layout. Lives OUTSIDE the (portal) route group on purpose
 * (mirrors /backshop, CLAUDE.md §2b): a workshop tablet doesn't want the
 * portal sidebar/topbar, and the portal layout's getUserOrg() bounces any
 * user without org membership — which is exactly what shop-floor staff are
 * (they have the `staff` role, not client-org membership).
 *
 * We gate on requireStaff() (staff OR super_admin) rather than getUserOrg,
 * and own a minimal, light, large-touch-target chrome with a single
 * brand bar and a sign-out. The guided-check sub-route paints its own
 * full-screen header on top of this.
 */
export default async function ShopFloorLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await requireStaff();
    return (
        <div className="min-h-screen bg-neutral-100 text-neutral-900">
            <header className="bg-[#1a1f23] text-white sticky top-0 z-30">
                <div className="flex items-center justify-between px-4 py-3 max-w-5xl mx-auto">
                    <Link href="/shop-floor" className="flex items-center gap-2.5 font-bold tracking-tight">
                        <span className="w-7 h-7 rounded-full bg-[#4e7e8c] flex items-center justify-center">
                            <Factory size={16} />
                        </span>
                        Shop Floor
                    </Link>
                    <form action={signOut}>
                        <button
                            type="submit"
                            className="flex items-center gap-1.5 text-sm text-neutral-300 hover:text-white px-3 py-2 rounded-lg hover:bg-white/10 transition-colors"
                        >
                            <LogOut size={15} />
                            Sign out
                        </button>
                    </form>
                </div>
            </header>
            <main className="max-w-5xl mx-auto p-4 md:p-6">{children}</main>
        </div>
    );
}
