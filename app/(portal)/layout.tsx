import { getUserOrg, isSuperAdmin } from '@/lib/auth';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { SidebarProvider } from './components/SidebarContext';
import { redirect } from 'next/navigation';

export default async function PortalLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // Get user's org context (this also enforces auth)
    const orgContext = await getUserOrg();

    // Super admin is a PLATFORM role, read from profiles.role — it has nothing
    // to do with org_members. Odysseus is a single-tenant internal tool (see
    // CLAUDE.md §3): Onesign staff run every client from here, so pinning an
    // admin to one client is meaningless, and the org-membership gate below is
    // a leftover from the multi-tenant SaaS this was forked from. Staff get in
    // on their role alone.
    const isAdmin = await isSuperAdmin();

    if (!orgContext && !isAdmin) {
        // A non-admin account with no org membership has nothing to look at.
        redirect('/login?error=no_org');
    }

    return (
        <SidebarProvider>
            <div className="min-h-screen bg-[var(--bg)] flex">
                {/* Sidebar */}
                <Sidebar isAdmin={isAdmin} />

                {/* Main content area */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Topbar */}
                    {/* An admin with no membership isn't inside a client's
                        context, so the topbar names the operator instead. */}
                    <Topbar
                        orgName={orgContext?.org.name ?? 'Onesign & Digital'}
                        isAdmin={isAdmin}
                    />

                    {/* Page content */}
                    <main className="flex-1 p-4 md:p-6">
                        {children}
                    </main>
                </div>
            </div>
        </SidebarProvider>
    );
}
