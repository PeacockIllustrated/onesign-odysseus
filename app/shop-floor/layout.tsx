// app/shop-floor/layout.tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Shop Floor — Onesign',
};

export default function ShopFloorLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-neutral-100 flex flex-col">
            {/* Header */}
            <header className="bg-[#1a1f23] border-b-4 border-[#4e7e8c] flex items-center px-6 py-3 gap-4">
                <img src="/onesign-icon.svg" alt="Onesign" className="h-7 invert" />
                <span className="text-white font-semibold text-lg tracking-tight">Shop Floor</span>
            </header>
            <main className="flex-1 p-4 md:p-6">
                {children}
            </main>
        </div>
    );
}
