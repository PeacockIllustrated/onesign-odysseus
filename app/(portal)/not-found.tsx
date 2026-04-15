import Link from 'next/link';

export default function PortalNotFound() {
    return (
        <div className="p-6 max-w-xl mx-auto">
            <div className="border border-neutral-200 rounded-[var(--radius-md)] p-8 text-center">
                <p className="text-xs font-mono text-neutral-400 uppercase tracking-wider">404</p>
                <h1 className="text-lg font-semibold text-neutral-900 mt-1">
                    That record doesn&rsquo;t exist.
                </h1>
                <p className="text-sm text-neutral-600 mt-2">
                    It may have been deleted, or you may have an old link. Check the
                    URL or head back to the job board.
                </p>
                <div className="mt-6 flex justify-center gap-2">
                    <Link href="/admin/jobs" className="btn-primary">
                        job board
                    </Link>
                    <Link href="/admin/artwork" className="btn-secondary">
                        artwork
                    </Link>
                </div>
            </div>
        </div>
    );
}
