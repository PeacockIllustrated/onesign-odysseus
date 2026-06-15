// app/(portal)/admin/visualiser/led-layout/page.tsx
import { requireAdmin } from '@/lib/auth';
import { listLedLayouts, getDriverSpecs } from '@/lib/visualiser/led-layout-actions';
import { LedLayoutClient } from './LedLayoutClient';

export const metadata = { title: 'LED Layout & Wiring · Onesign Odysseus' };

export default async function LedLayoutPage() {
    await requireAdmin();
    const [jobsRes, driversRes] = await Promise.all([listLedLayouts(), getDriverSpecs()]);
    return (
        <LedLayoutClient
            initialJobs={jobsRes.ok ? jobsRes.data : []}
            driverSpecs={driversRes.ok ? driversRes.data : []}
        />
    );
}
