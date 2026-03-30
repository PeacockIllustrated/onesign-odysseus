'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase';

export default function SignupPage() {
    const router = useRouter();
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        fullName: '',
        companyName: '',
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    function updateField(field: string, value: string) {
        setFormData((prev) => ({ ...prev, [field]: value }));
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            // Use server API route to create account (bypasses RLS)
            const response = await fetch('/api/auth/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            const result = await response.json();

            if (!response.ok) {
                setError(result.error || 'Failed to create account');
                setLoading(false);
                return;
            }

            // Now sign in with the created credentials
            const supabase = createBrowserClient();
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email: formData.email,
                password: formData.password,
            });

            if (signInError) {
                setError('Account created but login failed: ' + signInError.message);
                setLoading(false);
                return;
            }

            // Redirect to dashboard
            router.push('/app/dashboard');
            router.refresh();
        } catch {
            setError('An unexpected error occurred');
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen bg-white flex items-center justify-center px-4">
            <div className="w-full max-w-sm">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="flex justify-center mb-2">
                        <img src="/logo-black.svg" alt="OneSign" className="h-8" />
                    </div>
                    <p className="text-sm text-neutral-500">Create your account</p>
                </div>

                {/* Error message */}
                {error && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-[var(--radius-sm)] text-sm text-red-700">
                        {error}
                    </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="fullName" className="block text-sm font-medium text-neutral-700 mb-1">
                            Your name
                        </label>
                        <input
                            id="fullName"
                            type="text"
                            value={formData.fullName}
                            onChange={(e) => updateField('fullName', e.target.value)}
                            required
                            className="w-full px-3 py-2 border border-neutral-200 rounded-[var(--radius-sm)] text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                            placeholder="Jane Smith"
                        />
                    </div>

                    <div>
                        <label htmlFor="companyName" className="block text-sm font-medium text-neutral-700 mb-1">
                            Company name
                        </label>
                        <input
                            id="companyName"
                            type="text"
                            value={formData.companyName}
                            onChange={(e) => updateField('companyName', e.target.value)}
                            required
                            className="w-full px-3 py-2 border border-neutral-200 rounded-[var(--radius-sm)] text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                            placeholder="Acme Ltd"
                        />
                    </div>

                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-neutral-700 mb-1">
                            Email
                        </label>
                        <input
                            id="email"
                            type="email"
                            value={formData.email}
                            onChange={(e) => updateField('email', e.target.value)}
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
                            value={formData.password}
                            onChange={(e) => updateField('password', e.target.value)}
                            required
                            minLength={6}
                            className="w-full px-3 py-2 border border-neutral-200 rounded-[var(--radius-sm)] text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                            placeholder="••••••••"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="btn-primary w-full"
                    >
                        {loading ? 'Creating account...' : 'Create account'}
                    </button>
                </form>

                {/* Footer */}
                <p className="mt-6 text-center text-sm text-neutral-500">
                    Already have an account?{' '}
                    <Link href="/login" className="text-black font-medium hover:underline">
                        Sign in
                    </Link>
                </p>
            </div>
        </div>
    );
}
