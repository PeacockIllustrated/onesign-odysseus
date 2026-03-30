export const metadata = {
    title: 'Shop Floor — Onesign Portal',
};

export default function ShopFloorLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-neutral-100">
            <header className="h-14 bg-white border-b border-neutral-200 flex items-center px-6">
                <img src="/logo-black.svg" alt="OneSign" className="h-5" />
                <span className="ml-3 text-sm font-medium text-neutral-500">Shop Floor</span>
            </header>
            <main className="p-6">
                {children}
            </main>
        </div>
    );
}
