'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient, type Org, type OrgMember } from '@/lib/supabase';
import { Modal, Chip } from '@/app/(portal)/components/ui';
import { User, Plus, Trash2, Loader2, Crown, Shield, Users } from 'lucide-react';
import { createPortalUser } from '../actions';

interface OrgDetailModalProps {
    org: Org | null;
    open: boolean;
    onClose: () => void;
}

interface MemberWithProfile extends OrgMember {
    profile?: {
        email: string;
        full_name?: string;
    };
}

const roleOptions = ['owner', 'admin', 'member'] as const;
const roleIcons = {
    owner: Crown,
    admin: Shield,
    member: Users,
};

export function OrgDetailModal({ org, open, onClose }: OrgDetailModalProps) {
    const [members, setMembers] = useState<MemberWithProfile[]>([]);
    const [loading, setLoading] = useState(false);
    const [addEmail, setAddEmail] = useState('');
    const [addRole, setAddRole] = useState<typeof roleOptions[number]>('member');
    const [adding, setAdding] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (org && open) {
            loadMembers();
        }
    }, [org, open]);

    async function loadMembers() {
        if (!org) return;
        setLoading(true);

        const supabase = createBrowserClient();

        // 1. Get members
        const { data: membersData, error: membersError } = await supabase
            .from('org_members')
            .select('*')
            .eq('org_id', org.id);

        if (membersError) {
            console.error('Error loading members:', membersError);
            setLoading(false);
            return;
        }

        if (!membersData || membersData.length === 0) {
            setMembers([]);
            setLoading(false);
            return;
        }

        // 2. Get profiles
        const userIds = membersData.map(m => m.user_id);
        const { data: profilesData } = await supabase
            .from('profiles')
            .select('id, email, full_name')
            .in('id', userIds);

        // 3. Merge
        const joined = membersData.map(m => ({
            ...m,
            profile: profilesData?.find(p => p.id === m.user_id)
        }));

        setMembers((joined as MemberWithProfile[]) || []);
        setLoading(false);
    }

    async function handleAddMember(e: React.FormEvent) {
        e.preventDefault();
        if (!org || !addEmail.trim()) return;

        setAdding(true);
        setError(null);

        const supabase = createBrowserClient();
        let targetUserId = '';

        // Find profile by email
        const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', addEmail.trim())
            .single();

        if (profile) {
            targetUserId = profile.id;
        } else {
            // User not found, create them
            try {
                targetUserId = await createPortalUser(addEmail.trim(), org.name);
                const defaultPassword = `${org.name}@2026`.replace(/\s+/g, '');
                alert(`New user created!\n\nEmail: ${addEmail.trim()}\nPassword: ${defaultPassword}\n\nPlease share these credentials with the user.`);
            } catch (err: any) {
                console.error(err);
                setError(err.message || 'Failed to create user');
                setAdding(false);
                return;
            }
        }

        // Check if already member
        const existing = members.find(m => m.user_id === targetUserId);
        if (existing) {
            setError('User is already a member');
            setAdding(false);
            return;
        }

        const { error: insertError } = await supabase
            .from('org_members')
            .insert({
                org_id: org.id,
                user_id: targetUserId,
                role: addRole,
            });

        if (insertError) {
            setError(insertError.message);
        } else {
            setAddEmail('');
            loadMembers();
        }

        setAdding(false);
    }

    async function handleRoleChange(memberId: string, newRole: string) {
        const supabase = createBrowserClient();
        await supabase
            .from('org_members')
            .update({ role: newRole })
            .eq('id', memberId);

        setMembers(prev => prev.map(m =>
            m.id === memberId ? { ...m, role: newRole as typeof roleOptions[number] } : m
        ));
    }

    async function handleRemoveMember(memberId: string) {
        if (!confirm('Remove this member from the organisation?')) return;

        const supabase = createBrowserClient();
        await supabase
            .from('org_members')
            .delete()
            .eq('id', memberId);

        setMembers(prev => prev.filter(m => m.id !== memberId));
    }

    if (!org) return null;

    return (
        <Modal open={open} onClose={onClose} title={org.name}>
            <div className="space-y-6">
                {/* Org Info */}
                <div className="bg-neutral-50 rounded-lg p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                        <div>
                            <span className="text-neutral-500">Slug:</span>
                            <p className="font-mono">{org.slug}</p>
                        </div>
                        <div>
                            <span className="text-neutral-500">Created:</span>
                            <p>{new Date(org.created_at).toLocaleDateString('en-GB')}</p>
                        </div>
                    </div>
                </div>

                {/* Members List */}
                <div>
                    <h3 className="text-sm font-semibold text-neutral-900 mb-3 flex items-center gap-2">
                        <Users size={16} />
                        Members ({members.length})
                    </h3>

                    {loading ? (
                        <div className="flex justify-center py-4">
                            <Loader2 size={24} className="animate-spin text-neutral-400" />
                        </div>
                    ) : members.length === 0 ? (
                        <p className="text-sm text-neutral-500 py-4 text-center">No members yet</p>
                    ) : (
                        <div className="space-y-2">
                            {members.map(member => {
                                const RoleIcon = roleIcons[member.role];
                                return (
                                    <div key={member.id} className="flex items-center justify-between p-3 bg-white border border-neutral-100 rounded-lg">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-neutral-100 rounded-full flex items-center justify-center">
                                                <User size={14} className="text-neutral-400" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-neutral-900">
                                                    {member.profile?.full_name || member.profile?.email || 'Unknown'}
                                                </p>
                                                <p className="text-xs text-neutral-500">{member.profile?.email}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <select
                                                value={member.role}
                                                onChange={(e) => handleRoleChange(member.id, e.target.value)}
                                                className="text-xs border border-neutral-200 rounded px-2 py-1 bg-white"
                                            >
                                                {roleOptions.map(r => (
                                                    <option key={r} value={r}>{r}</option>
                                                ))}
                                            </select>
                                            <button
                                                onClick={() => handleRemoveMember(member.id)}
                                                className="p-1 text-neutral-400 hover:text-red-500 transition-colors"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Add Member */}
                <form onSubmit={handleAddMember} className="border-t border-neutral-200 pt-4">
                    <h4 className="text-sm font-medium text-neutral-700 mb-2">Add Member</h4>

                    {error && (
                        <div className="mb-2 p-2 bg-red-50 text-red-700 rounded text-xs">{error}</div>
                    )}

                    <div className="flex gap-2">
                        <input
                            type="email"
                            value={addEmail}
                            onChange={(e) => setAddEmail(e.target.value)}
                            placeholder="email@example.com"
                            className="flex-1 px-3 py-2 border border-neutral-200 rounded-md text-sm"
                        />
                        <select
                            value={addRole}
                            onChange={(e) => setAddRole(e.target.value as typeof roleOptions[number])}
                            className="px-3 py-2 border border-neutral-200 rounded-md text-sm"
                        >
                            {roleOptions.map(r => (
                                <option key={r} value={r}>{r}</option>
                            ))}
                        </select>
                        <button
                            type="submit"
                            disabled={adding}
                            className="btn-primary px-3"
                        >
                            {adding ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                        </button>
                    </div>
                </form>
            </div>
        </Modal>
    );
}

