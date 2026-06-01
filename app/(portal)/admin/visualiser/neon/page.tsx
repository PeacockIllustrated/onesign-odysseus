// app/(portal)/admin/visualiser/neon/page.tsx
import { requireAdmin } from '@/lib/auth';
import { NeonMeasureClient } from './NeonMeasureClient';

export const metadata = { title: 'Neon Length Tool · Onesign Odysseus' };

export default async function NeonMeasurePage() {
    await requireAdmin();
    return <NeonMeasureClient />;
}
