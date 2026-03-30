import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use service role for server-side inserts (bypasses RLS)
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

interface ArchitectLeadInsert {
    practice_name: string;
    contact_name: string;
    contact_role?: string;
    email: string;
    phone?: string;
    project_name?: string;
    project_type?: string;
    riba_stage?: string;
    location?: string;
    planning_sensitive?: boolean;
    support_needed?: string[];
    notes?: string;
}

export async function POST(request: Request) {
    try {
        const body: ArchitectLeadInsert = await request.json();

        // Basic validation
        if (!body.practice_name || !body.contact_name || !body.email) {
            return NextResponse.json(
                { error: 'Missing required fields: practice_name, contact_name, email' },
                { status: 400 }
            );
        }

        const { data: lead, error } = await supabaseAdmin
            .from('architect_leads')
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
        console.error('Failed to create architect lead:', error);
        return NextResponse.json(
            { error: 'Failed to submit enquiry' },
            { status: 500 }
        );
    }
}
