import { Puzzle } from 'lucide-react';
import { requireAdmin } from '@/lib/auth';
import { listNestingDesigns } from '@/lib/nesting/actions';
import { NestingClient } from './NestingClient';

export const metadata = { title: 'Acrylic Nesting · Onesign Odysseus' };
export const dynamic = 'force-dynamic';

export default async function NestingPage() {
    await requireAdmin();

    const res = await listNestingDesigns();
    const initialDesigns = res.ok ? res.data : [];

    return (
        <div className="mx-auto max-w-[1500px] p-4 md:p-6">
            <div className="mb-4 flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#4e7e8c] text-white">
                    <Puzzle size={18} />
                </span>
                <div className="leading-tight">
                    <h1 className="text-xl font-bold tracking-tight text-neutral-900">
                        Acrylic Nesting
                    </h1>
                    <p className="text-[11px] uppercase tracking-widest text-neutral-400">
                        Artwork in · cut-ready sheets out
                    </p>
                </div>
            </div>
            <NestingClient initialDesigns={initialDesigns} />
        </div>
    );
}
