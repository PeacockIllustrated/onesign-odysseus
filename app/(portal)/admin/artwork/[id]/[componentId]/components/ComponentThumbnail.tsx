'use client';

import { uploadArtworkThumbnail } from '@/lib/artwork/actions';
import { ThumbnailUpload } from './ThumbnailUpload';

interface Props {
    componentId: string;
    currentUrl: string | null;
    readOnly?: boolean;
}

/**
 * Thin wrapper around ThumbnailUpload that binds the component-level
 * uploadArtworkThumbnail action. Lives in a client component so the
 * server-action FormData dance stays in one place.
 */
export function ComponentThumbnail({ componentId, currentUrl, readOnly }: Props) {
    return (
        <ThumbnailUpload
            currentUrl={currentUrl}
            uploadAction={(fd) => uploadArtworkThumbnail(componentId, fd)}
            size="md"
            label="component artwork"
            readOnly={readOnly}
        />
    );
}
