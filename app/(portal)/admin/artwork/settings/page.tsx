import { requireAdmin } from '@/lib/auth';
import { getComponentStageDefaults } from '@/lib/artwork/actions';
import { getProductionStages } from '@/lib/production/queries';
import { SettingsClient } from './SettingsClient';

export default async function ArtworkSettingsPage() {
    await requireAdmin();

    const [defaults, stages] = await Promise.all([
        getComponentStageDefaults(),
        getProductionStages(),
    ]);

    return <SettingsClient defaults={defaults} stages={stages} />;
}
