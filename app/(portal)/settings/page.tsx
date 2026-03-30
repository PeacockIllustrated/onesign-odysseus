'use client';

import { useState } from 'react';
import { createBrowserClient } from '@/lib/supabase';
import { PageHeader, Card } from '@/app/(portal)/components/ui';
import { Loader2, Lock } from 'lucide-react';

export default function SettingsPage() {
    return (
        <div>
            <PageHeader
                title="Account Settings"
                description="Manage your profile and security preferences."
            />

            <div className="max-w-2xl">
                <ChangePasswordCard />
            </div>
        </div>
    );
}

function ChangePasswordCard() {
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    async function handleUpdatePassword(e: React.FormEvent) {
        e.preventDefault();
        setMessage(null);

        if (password.length < 6) {
            setMessage({ type: 'error', text: 'Password must be at least 6 characters' });
            return;
        }

        if (password !== confirm) {
            setMessage({ type: 'error', text: 'Passwords do not match' });
            return;
        }

        setLoading(true);
        const supabase = createBrowserClient();

        const { error } = await supabase.auth.updateUser({
            password: password
        });

        if (error) {
            setMessage({ type: 'error', text: error.message });
        } else {
            setMessage({ type: 'success', text: 'Password updated successfully' });
            setPassword('');
            setConfirm('');
        }

        setLoading(false);
    }

    return (
        <Card>
            <div className="flex items-center gap-2 mb-4 text-neutral-900 font-semibold">
                <Lock size={18} />
                <h3>Change Password</h3>
            </div>

            <form onSubmit={handleUpdatePassword} className="space-y-4">
                {message && (
                    <div className={`p-3 rounded text-sm ${message.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
                        }`}>
                        {message.text}
                    </div>
                )}

                <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                        New Password
                    </label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-3 py-2 border border-neutral-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-black"
                        required
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Confirm New Password
                    </label>
                    <input
                        type="password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        className="w-full px-3 py-2 border border-neutral-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-black"
                        required
                    />
                </div>

                <div className="pt-2">
                    <button
                        type="submit"
                        disabled={loading}
                        className="btn-primary w-full sm:w-auto"
                    >
                        {loading ? (
                            <div className="flex items-center gap-2">
                                <Loader2 size={16} className="animate-spin" />
                                Updating...
                            </div>
                        ) : (
                            'Update Password'
                        )}
                    </button>
                </div>
            </form>
        </Card>
    );
}

