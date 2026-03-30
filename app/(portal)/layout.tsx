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

    if (!orgContext) {
        // User is authenticated but not part of any org
        redirect('/login?error=no_org');
    }

    // Only show admin tab to OneSign super admins
    const isAdmin = await isSuperAdmin();

    return (
        <SidebarProvider>
            <div className="min-h-screen bg-[hsl(var(--surface-50))] flex">
                {/* Sidebar */}
                <Sidebar isAdmin={isAdmin} />

                {/* Main content area */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Topbar */}
                    <Topbar org={orgContext.org} isAdmin={isAdmin} />

                    {/* Page content */}
                    <main className="flex-1 p-4 md:p-6">
                        {children}
                    </main>
                </div>
            </div>
        </SidebarProvider>
    );
}
