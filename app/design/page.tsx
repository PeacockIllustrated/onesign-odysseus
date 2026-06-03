import { PublicStudioClient } from './PublicStudioClient';

/**
 * Public, unauthenticated entry point for the customer sign designer. No
 * requireAuth()/getUserOrg() here by design — anyone with the link can build a
 * sign and send it in (the server action that records the submission is the
 * only privileged step, and it runs service-side). See CLAUDE.md §3.
 */
export default function DesignStudioPage() {
    return <PublicStudioClient />;
}
