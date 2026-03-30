import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { MarketingLeadInsert } from '@/lib/supabase';

// Use service role for server-side inserts (bypasses RLS)
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(request: Request) {
    try {
        const body: MarketingLeadInsert = await request.json();

        // Basic validation
        if (!body.contact_name || !body.contact_email || !body.company_name) {
            return NextResponse.json(
                { error: 'Missing required fields: contact_name, contact_email, company_name' },
                { status: 400 }
            );
        }

        const { data: lead, error } = await supabaseAdmin
            .from('marketing_leads')
            .insert([body])
            .select()
            .single();

        if (error) {
            console.error('Supabase error:', error);
            return NextResponse.json(
                { error: `Failed to submit enquiry: ${error.message}` },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true, lead }, { status: 201 });
    } catch (error: unknown) {
        console.error('Failed to create lead:', error);
        return NextResponse.json(
            { error: 'Failed to submit enquiry' },
            { status: 500 }
        );
    }
}

