import { createClient } from '@supabase/supabase-js';

const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
);

const tables = [
    'orgs', 'quotes', 'artwork_jobs', 'production_jobs', 'deliveries',
    'invoices', 'purchase_orders', 'contacts', 'org_sites',
    'production_stages', 'profiles', 'drivers', 'maintenance_visits',
];

for (const t of tables) {
    const { count, error } = await sb.from(t).select('*', { count: 'exact', head: true });
    console.log(error ? `FAIL ${t.padEnd(20)} ${error.message}` : `OK   ${t.padEnd(20)} rows=${count}`);
}
