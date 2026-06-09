import { redirect } from 'next/navigation';

// Legacy route: the client-facing slug moved to /sign-off/[token]. Any links
// that were already emailed out before the rename still land here and get
// bounced to the new URL.
export default async function LegacyApprovalRedirect({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;
    redirect(`/sign-off/${token}`);
}
