'use client';

import { ComponentVersion } from '@/lib/artwork/types';
import { formatDimensionWithReturns, formatDateTime } from '@/lib/artwork/utils';

interface VersionHistoryProps {
    versions: ComponentVersion[];
}

export function VersionHistory({ versions }: VersionHistoryProps) {
    if (versions.length === 0) {
        return null;
    }

    return (
        <div className="space-y-3">
            {versions.map((version) => (
                <div
                    key={version.id}
                    className="relative pl-6 pb-3 border-l-2 border-neutral-200 last:border-0 last:pb-0"
                >
                    {/* Timeline dot */}
                    <div className="absolute left-[-5px] top-0 w-2 h-2 rounded-full bg-neutral-300" />

                    <div className="text-xs space-y-1">
                        <div className="flex items-center justify-between">
                            <span className="font-medium text-neutral-900">
                                version {version.version_number}
                            </span>
                            <span className="text-neutral-400">
                                {formatDateTime(version.created_at)}
                            </span>
                        </div>

                        {version.width_mm && version.height_mm && (
                            <p className="text-neutral-600">
                                {formatDimensionWithReturns(
                                    Number(version.width_mm),
                                    Number(version.height_mm),
                                    version.returns_mm ? Number(version.returns_mm) : null
                                )}
                                {version.material && ` — ${version.material}`}
                            </p>
                        )}

                        {version.file_path && (
                            <p className="text-neutral-400 font-mono truncate" title={version.file_path}>
                                {version.file_path}
                            </p>
                        )}

                        {version.notes && (
                            <p className="text-neutral-500 italic">{version.notes}</p>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
