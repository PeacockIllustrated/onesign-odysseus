import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const { status } = body;

        if (!status) {
            return NextResponse.json(
                { error: 'Status is required' },
                { status: 400 }
            );
        }

        const validStatuses = ['new', 'contacted', 'qualified', 'converted', 'lost'];
        if (!validStatuses.includes(status)) {
            return NextResponse.json(
                { error: 'Invalid status value' },
                { status: 400 }
            );
        }

        const { data, error } = await supabaseAdmin
            .from('architect_leads')
            .update({ status })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating architect lead:', error);
            return NextResponse.json(
                { error: 'Failed to update lead' },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true, lead: data });
    } catch (error: unknown) {
        console.error('PATCH error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
