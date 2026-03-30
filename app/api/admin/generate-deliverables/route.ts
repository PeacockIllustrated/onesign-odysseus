import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getTemplatesForPackage } from '@/lib/deliverables/templates';

/**
 * POST /api/admin/generate-deliverables
 * 
 * Generates monthly deliverables for an org based on their package subscription.
 * 
 * Body: { org_id: string, month: string (YYYY-MM-DD first of month) }
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createServerClient();

        // Check if user is authenticated
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Check if user is super_admin
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        if (profile?.role !== 'super_admin') {
            return NextResponse.json(
                { error: 'Admin access required' },
                { status: 403 }
            );
        }

        // Parse request body
        const body = await request.json();
        const { org_id, month } = body;

        if (!org_id || !month) {
            return NextResponse.json(
                { error: 'org_id and month are required' },
                { status: 400 }
            );
        }

        // Get the org's active subscription
        const { data: subscription, error: subError } = await supabase
            .from('subscriptions')
            .select('package_key')
            .eq('org_id', org_id)
            .eq('status', 'active')
            .single();

        if (subError || !subscription) {
            return NextResponse.json(
                { error: 'No active subscription found for this organisation' },
                { status: 404 }
            );
        }

        // Get templates for the package
        const templates = getTemplatesForPackage(subscription.package_key);

        // Check if deliverables already exist for this month
        const { data: existing } = await supabase
            .from('deliverables')
            .select('id')
            .eq('org_id', org_id)
            .eq('month', month);

        if (existing && existing.length > 0) {
            return NextResponse.json(
                { error: `Deliverables already exist for this month (${existing.length} items)` },
                { status: 409 }
            );
        }

        // Calculate due date (end of month)
        const monthDate = new Date(month);
        const dueDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
        const dueDateStr = dueDate.toISOString().split('T')[0];

        // Create deliverable rows
        const deliverablesToInsert = templates.map(template => ({
            org_id,
            month,
            title: template.title,
            description: template.description,
            status: 'draft' as const,
            category: template.category,
            template_key: template.key,
            due_date: dueDateStr,
            created_by: user.id,
        }));

        const { data: created, error: insertError } = await supabase
            .from('deliverables')
            .insert(deliverablesToInsert)
            .select();

        if (insertError) {
            console.error('Error inserting deliverables:', insertError);
            return NextResponse.json(
                { error: 'Failed to create deliverables' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            count: created?.length || 0,
            package: subscription.package_key,
            month,
        });

    } catch (error) {
        console.error('Generate deliverables error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
