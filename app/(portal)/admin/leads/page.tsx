import { createAdminClient } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/auth';
import { PageHeader } from '@/app/(portal)/components/ui';
import { LeadsClient } from './LeadsClient';

export default async function AdminLeadsPage() {
    await requireAdmin();

    const supabase = createAdminClient();

    // Fetch marketing leads (from growth section)
    const { data: marketingLeads, error: marketingError } = await supabase
        .from('marketing_leads')
        .select('*')
        .order('created_at', { ascending: false });

    if (marketingError) {
        console.error('Error fetching marketing leads:', marketingError);
    }

    // Fetch architect leads (from architects section)
    const { data: architectLeads, error: architectError } = await supabase
        .from('architect_leads')
        .select('*')
        .order('created_at', { ascending: false });

    if (architectError) {
        console.error('Error fetching architect leads:', architectError);
    }

    return (
        <div>
            <PageHeader
                title="Leads"
                description="Manage enquiries from both Growth and Architects sections"
            />
            <LeadsClient
                initialMarketingLeads={marketingLeads || []}
                initialArchitectLeads={architectLeads || []}
            />
        </div>
    );
}

