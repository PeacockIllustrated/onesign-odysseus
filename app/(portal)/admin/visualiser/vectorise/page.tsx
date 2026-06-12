// app/(portal)/admin/visualiser/vectorise/page.tsx
import { requireAdmin } from '@/lib/auth';
import { VectoriseClient } from './VectoriseClient';

export const metadata = { title: 'Image → SVG · Onesign Odysseus' };

export default async function VectorisePage() {
    await requireAdmin();
    return <VectoriseClient />;
}
