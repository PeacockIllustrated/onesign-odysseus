import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use service role to bypass RLS for signup
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(request: NextRequest) {
    try {
        const { email, password, fullName, companyName } = await request.json();

        // Validate input
        if (!email || !password || !fullName || !companyName) {
            return NextResponse.json(
                { error: 'All fields are required' },
                { status: 400 }
            );
        }

        // 1. Create user account (using admin client)
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true, // Auto-confirm email
        });

        if (authError) {
            return NextResponse.json(
                { error: authError.message },
                { status: 400 }
            );
        }

        const userId = authData.user?.id;
        if (!userId) {
            return NextResponse.json(
                { error: 'Failed to create account' },
                { status: 500 }
            );
        }

        // 2. Update profile with full name
        await supabaseAdmin
            .from('profiles')
            .update({ full_name: fullName })
            .eq('id', userId);

        // 3. Create organisation (using admin to bypass RLS)
        const slug = companyName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');

        const { data: orgData, error: orgError } = await supabaseAdmin
            .from('orgs')
            .insert({
                name: companyName,
                slug: slug + '-' + Date.now().toString(36),
            })
            .select()
            .single();

        if (orgError) {
            // Rollback: delete user if org creation fails
            await supabaseAdmin.auth.admin.deleteUser(userId);
            return NextResponse.json(
                { error: 'Failed to create organisation: ' + orgError.message },
                { status: 500 }
            );
        }

        // 4. Add user as org owner
        const { error: memberError } = await supabaseAdmin
            .from('org_members')
            .insert({
                org_id: orgData.id,
                user_id: userId,
                role: 'owner',
            });

        if (memberError) {
            // Rollback: delete org and user
            await supabaseAdmin.from('orgs').delete().eq('id', orgData.id);
            await supabaseAdmin.auth.admin.deleteUser(userId);
            return NextResponse.json(
                { error: 'Failed to set up organisation: ' + memberError.message },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            message: 'Account created successfully'
        });

    } catch (error) {
        console.error('Signup error:', error);
        return NextResponse.json(
            { error: 'An unexpected error occurred' },
            { status: 500 }
        );
    }
}
