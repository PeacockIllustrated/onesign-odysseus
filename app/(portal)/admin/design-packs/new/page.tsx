import { requireAdmin } from '@/lib/auth';
import { PageHeader, Card } from '@/app/(portal)/components/ui';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { CreateDesignPackForm } from './CreateDesignPackForm';

export default async function NewDesignPackPage() {
    await requireAdmin();

    return (
        <div className="p-6 max-w-3xl mx-auto">
            {/* Back Button */}
            <Link
                href="/app/admin/design-packs"
                className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-black mb-4 transition-colors"
            >
                <ChevronLeft size={16} />
                back to design packs
            </Link>

            <PageHeader
                title="new design pack"
                description="create a new interactive design presentation for a client session"
            />

            <Card>
                <CreateDesignPackForm />
            </Card>

            {/* Help Text */}
            <div className="mt-6 p-4 bg-neutral-50 rounded-[var(--radius-md)] border border-neutral-200">
                <h3 className="text-sm font-medium text-neutral-900 mb-2">getting started</h3>
                <ul className="text-sm text-neutral-600 space-y-1">
                    <li>• enter the project and client details to begin</li>
                    <li>• you'll be able to select typography, colours, and materials in the next step</li>
                    <li>• all progress is auto-saved as you work</li>
                    <li>• use presentation mode for live client sessions</li>
                </ul>
            </div>
        </div>
    );
}
