import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'Signage & Wayfinding for Architects | OneSign',
    description: 'Supporting design intent from concept to construction. Design-led signage and wayfinding services for architecture practices.',
};

export default function ArchitectsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-white">
            {/* Sticky Header */}
            <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-neutral-200">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="flex items-center justify-between h-14">
                        <Link href="/" className="flex items-center">
                            <img src="/logo-black.svg" alt="OneSign" className="h-6" />
                        </Link>
                        <a
                            href="#enquire"
                            className="btn-primary text-sm"
                        >
                            Get in Touch
                        </a>
                    </div>
                </div>
            </nav>

            <main>{children}</main>

            {/* Footer */}
            <footer className="bg-neutral-900 text-white py-12">
                <div className="max-w-6xl mx-auto px-6 text-center">
                    <p className="text-neutral-500 text-xs">
                        &copy; {new Date().getFullYear()} OneSign. All rights reserved.
                    </p>
                </div>
            </footer>
        </div>
    );
}
