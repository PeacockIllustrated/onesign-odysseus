/**
 * Portal route loading fallback. Shown while server components of a nested
 * admin page are streaming in.
 */

export default function PortalLoading() {
    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="animate-pulse space-y-4">
                <div className="h-6 bg-neutral-200 rounded w-1/3" />
                <div className="h-4 bg-neutral-200 rounded w-1/2" />
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[0, 1, 2].map((i) => (
                        <div
                            key={i}
                            className="h-24 bg-neutral-100 rounded-[var(--radius-md)]"
                        />
                    ))}
                </div>
                <div className="mt-6 h-64 bg-neutral-100 rounded-[var(--radius-md)]" />
            </div>
        </div>
    );
}
