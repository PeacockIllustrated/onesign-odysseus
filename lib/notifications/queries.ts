import { createAdminClient } from '@/lib/supabase-admin';

export type AttentionKind =
    | 'artwork_approved'
    | 'artwork_changes_requested'
    | 'shop_floor_flag'
    | 'quote_expiring'
    | 'quote_to_convert'
    | 'invoice_overdue'
    | 'delivery_overdue'
    | 'delivery_pod_received'
    | 'maintenance_due';

export type AttentionSeverity = 'urgent' | 'action' | 'info';

export interface AttentionItem {
    kind: AttentionKind;
    severity: AttentionSeverity;
    title: string;
    detail?: string;
    href: string;
    timestamp?: string;
}

export interface AttentionSummary {
    items: AttentionItem[];
    counts: Record<AttentionKind, number>;
}

function todayISO() {
    return new Date().toISOString().split('T')[0];
}

function daysFromNowISO(days: number) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}

export async function getAttentionItems(): Promise<AttentionSummary> {
    const supabase = createAdminClient();
    const items: AttentionItem[] = [];
    const counts: Record<AttentionKind, number> = {
        artwork_approved: 0,
        artwork_changes_requested: 0,
        shop_floor_flag: 0,
        quote_expiring: 0,
        quote_to_convert: 0,
        invoice_overdue: 0,
        delivery_overdue: 0,
        delivery_pod_received: 0,
        maintenance_due: 0,
    };

    const today = todayISO();
    const in7 = daysFromNowISO(7);

    // 1. Artwork approvals returned (approved or changes_requested) where the
    //    job hasn't yet been released to production or completed.
    try {
        const { data } = await supabase
            .from('artwork_approvals')
            .select('id, job_id, status, approved_at, client_name, updated_at, artwork_jobs!inner(id, title, status)')
            .in('status', ['approved', 'changes_requested'])
            .order('updated_at', { ascending: false })
            .limit(25);
        for (const row of (data || []) as any[]) {
            const job = row.artwork_jobs;
            if (!job) continue;
            if (job.status === 'in_production' || job.status === 'completed') continue;
            const kind: AttentionKind = row.status === 'approved' ? 'artwork_approved' : 'artwork_changes_requested';
            counts[kind]++;
            items.push({
                kind,
                severity: kind === 'artwork_changes_requested' ? 'urgent' : 'action',
                title: kind === 'artwork_approved'
                    ? `Artwork approved: ${job.title}`
                    : `Changes requested: ${job.title}`,
                detail: row.client_name ? `by ${row.client_name}` : undefined,
                href: `/admin/artwork/${job.id}`,
                timestamp: row.approved_at || row.updated_at,
            });
        }
    } catch { /* table missing */ }

    // 2. Open shop-floor problem reports
    try {
        const { data } = await supabase
            .from('shop_floor_flags')
            .select('id, notes, reported_by_name, created_at, job_item_id')
            .eq('status', 'open')
            .order('created_at', { ascending: false })
            .limit(10);
        for (const row of (data || []) as any[]) {
            counts.shop_floor_flag++;
            items.push({
                kind: 'shop_floor_flag',
                severity: 'urgent',
                title: `Shop-floor problem: ${row.notes.slice(0, 60)}${row.notes.length > 60 ? '…' : ''}`,
                detail: row.reported_by_name ? `from ${row.reported_by_name}` : undefined,
                href: '/admin/jobs',
                timestamp: row.created_at,
            });
        }
    } catch { /* table missing */ }

    // 3. Quotes expiring within 7 days (sent but not accepted)
    try {
        const { data } = await supabase
            .from('quotes')
            .select('id, quote_number, customer_name, valid_until, status')
            .eq('status', 'sent')
            .not('valid_until', 'is', null)
            .gte('valid_until', today)
            .lte('valid_until', in7)
            .order('valid_until', { ascending: true })
            .limit(10);
        for (const row of (data || []) as any[]) {
            counts.quote_expiring++;
            items.push({
                kind: 'quote_expiring',
                severity: 'action',
                title: `Quote expiring: ${row.quote_number}`,
                detail: row.customer_name,
                href: `/admin/quotes/${row.id}`,
                timestamp: row.valid_until,
            });
        }
    } catch { /* noop */ }

    // 4. Accepted quotes still waiting to be converted (no production job yet)
    try {
        const { data: jobs } = await supabase
            .from('production_jobs')
            .select('quote_id')
            .not('quote_id', 'is', null);
        const converted = new Set((jobs || []).map((j: any) => j.quote_id).filter(Boolean));
        const { data: accepted } = await supabase
            .from('quotes')
            .select('id, quote_number, customer_name, updated_at')
            .eq('status', 'accepted')
            .order('updated_at', { ascending: false })
            .limit(25);
        for (const row of (accepted || []) as any[]) {
            if (converted.has(row.id)) continue;
            counts.quote_to_convert++;
            items.push({
                kind: 'quote_to_convert',
                severity: 'action',
                title: `Quote accepted: ${row.quote_number}`,
                detail: `${row.customer_name} — generate artwork`,
                href: `/admin/quotes/${row.id}`,
                timestamp: row.updated_at,
            });
        }
    } catch { /* noop */ }

    // 5. Overdue invoices
    try {
        const { data } = await supabase
            .from('invoices')
            .select('id, invoice_number, customer_name, due_date, status, total_pence')
            .eq('status', 'overdue')
            .order('due_date', { ascending: true })
            .limit(10);
        for (const row of (data || []) as any[]) {
            counts.invoice_overdue++;
            items.push({
                kind: 'invoice_overdue',
                severity: 'urgent',
                title: `Invoice overdue: ${row.invoice_number}`,
                detail: row.customer_name,
                href: `/admin/invoices/${row.id}`,
                timestamp: row.due_date,
            });
        }
    } catch { /* noop */ }

    // 6. Deliveries past their scheduled date but not yet delivered
    try {
        const { data } = await supabase
            .from('deliveries')
            .select('id, delivery_number, scheduled_date, status')
            .in('status', ['scheduled', 'in_transit'])
            .lt('scheduled_date', today)
            .order('scheduled_date', { ascending: true })
            .limit(10);
        for (const row of (data || []) as any[]) {
            counts.delivery_overdue++;
            items.push({
                kind: 'delivery_overdue',
                severity: 'urgent',
                title: `Delivery overdue: ${row.delivery_number}`,
                detail: `scheduled ${row.scheduled_date}`,
                href: `/admin/deliveries/${row.id}`,
                timestamp: row.scheduled_date,
            });
        }
    } catch { /* noop */ }

    // 7. Recently delivered (POD received) — informational
    try {
        const { data } = await supabase
            .from('deliveries')
            .select('id, delivery_number, updated_at, status')
            .eq('status', 'delivered')
            .order('updated_at', { ascending: false })
            .limit(5);
        const cutoff = daysFromNowISO(-3);
        for (const row of (data || []) as any[]) {
            if (row.updated_at && row.updated_at < cutoff) continue;
            counts.delivery_pod_received++;
            items.push({
                kind: 'delivery_pod_received',
                severity: 'info',
                title: `Proof of delivery received: ${row.delivery_number}`,
                href: `/admin/deliveries/${row.id}`,
                timestamp: row.updated_at,
            });
        }
    } catch { /* noop */ }

    // 8. Maintenance visits due this week
    try {
        const { data } = await supabase
            .from('maintenance_visits')
            .select('id, visit_type, scheduled_date, status, orgs(name)')
            .eq('status', 'scheduled')
            .lte('scheduled_date', in7)
            .order('scheduled_date', { ascending: true })
            .limit(10);
        for (const row of (data || []) as any[]) {
            const overdue = row.scheduled_date < today;
            counts.maintenance_due++;
            items.push({
                kind: 'maintenance_due',
                severity: overdue ? 'urgent' : 'action',
                title: overdue
                    ? `Maintenance overdue: ${row.visit_type || 'visit'}`
                    : `Maintenance due: ${row.visit_type || 'visit'}`,
                detail: `${row.orgs?.name ? row.orgs.name + ' — ' : ''}scheduled ${row.scheduled_date}`,
                href: '/admin/maintenance',
                timestamp: row.scheduled_date,
            });
        }
    } catch { /* noop */ }

    const severityRank: Record<AttentionSeverity, number> = { urgent: 0, action: 1, info: 2 };
    items.sort((a, b) => {
        const s = severityRank[a.severity] - severityRank[b.severity];
        if (s !== 0) return s;
        return (b.timestamp || '').localeCompare(a.timestamp || '');
    });

    return { items, counts };
}
