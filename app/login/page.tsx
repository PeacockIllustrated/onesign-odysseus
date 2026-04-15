'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase';

function LoginForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const errorParam = searchParams.get('error');

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const supabase = createBrowserClient();
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) {
                setError(error.message);
                setLoading(false);
                return;
            }

            // Check role to determine redirect target
            const { data: { user } } = await supabase.auth.getUser();
            let redirectTo = '/dashboard';

            if (user) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', user.id)
                    .single();

                if (profile?.role === 'super_admin') {
                    redirectTo = '/admin';
                }
            }

            router.push(redirectTo);
            router.refresh();
        } catch {
            setError('An unexpected error occurred');
            setLoading(false);
        }
    }

    return (
        <div className="w-full max-w-sm">
            {/* Header */}
            <div className="text-center mb-8">
                <div className="flex justify-center mb-2">
                    <img src="/Odysseus-Logo-Black.svg" alt="Onesign Odysseus" className="h-20 w-auto" />
                </div>
                <p className="text-sm text-neutral-500">Sign in to your account</p>
            </div>

            {/* Error messages */}
            {(error || errorParam) && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-[var(--radius-sm)] text-sm text-red-700">
                    {error || (errorParam === 'no_org' ? 'Your account is not associated with any organisation.' : errorParam)}
                </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="email" className="block text-sm font-medium text-neutral-700 mb-1">
                        Email
                    </label>
                    <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="w-full px-3 py-2 border border-neutral-200 rounded-[var(--radius-sm)] text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                        placeholder="you@company.com"
                    />
                </div>

                <div>
                    <label htmlFor="password" className="block text-sm font-medium text-neutral-700 mb-1">
                        Password
                    </label>
                    <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="w-full px-3 py-2 border border-neutral-200 rounded-[var(--radius-sm)] text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                        placeholder="••••••••"
                    />
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="btn-primary w-full"
                >
                    {loading ? 'Signing in...' : 'Sign in'}
                </button>
            </form>

            {/* Footer */}
            <p className="mt-6 text-center text-sm text-neutral-500">
                Don&apos;t have an account?{' '}
                <Link href="/signup" className="text-black font-medium hover:underline">
                    Sign up
                </Link>
            </p>
        </div>
    );
}

export default function LoginPage() {
    return (
        <div className="min-h-screen bg-white flex items-center justify-center px-4">
            <Suspense fallback={<div className="w-full max-w-sm text-center text-neutral-500">Loading...</div>}>
                <LoginForm />
            </Suspense>
        </div>
    );
}
