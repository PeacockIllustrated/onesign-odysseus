import { SectionNav } from './components/SectionNav';

export default function GrowthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-white">
            <SectionNav />
            <main>{children}</main>
            {/* Footer CTA */}
            <footer className="bg-neutral-900 text-white py-12">
                <div className="max-w-6xl mx-auto px-6 text-center">
                    <p className="text-neutral-400 text-sm mb-3">Ready to accelerate your growth?</p>
                    <a
                        href="/growth/enquire"
                        className="inline-flex items-center justify-center px-8 py-3 text-sm font-medium bg-white text-black rounded-[var(--radius-sm)] hover:bg-neutral-100 transition-colors"
                    >
                        Start Your Growth Journey
                    </a>
                    <p className="text-neutral-500 text-xs mt-6">
                        &copy; {new Date().getFullYear()} OneSign Digital. All rights reserved.
                    </p>
                </div>
            </footer>
        </div>
    );
}
