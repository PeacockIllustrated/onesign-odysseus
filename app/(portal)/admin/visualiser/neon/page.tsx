// app/(portal)/admin/visualiser/neon/page.tsx
import { requireAdmin } from '@/lib/auth';
import { listNeonDesigns } from '@/lib/visualiser/neon-actions';
import { NeonMeasureClient } from './NeonMeasureClient';

export const metadata = { title: 'Neon Length Tool · Onesign Odysseus' };

export default async function NeonMeasurePage() {
    await requireAdmin();
    const res = await listNeonDesigns();
    const designs = res.ok ? res.data : [];
    return <NeonMeasureClient initialDesigns={designs} />;
}
