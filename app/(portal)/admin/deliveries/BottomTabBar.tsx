'use client';

import { List, Calendar, Map } from 'lucide-react';

export type TabId = 'list' | 'plan' | 'map';

interface Props {
    activeTab: TabId;
    onChangeTab: (tab: TabId) => void;
}

const TABS: Array<{ id: TabId; label: string; icon: typeof List }> = [
    { id: 'list', label: 'List', icon: List },
    { id: 'plan', label: 'Plan', icon: Calendar },
    { id: 'map', label: 'Map', icon: Map },
];

export function BottomTabBar({ activeTab, onChangeTab }: Props) {
    return (
        <nav className="fixed bottom-0 left-0 right-0 z-30 md:hidden bg-white border-t border-neutral-200 flex">
            {TABS.map(({ id, label, icon: Icon }) => {
                const active = activeTab === id;
                return (
                    <button
                        key={id}
                        type="button"
                        onClick={() => onChangeTab(id)}
                        className={`flex-1 flex flex-col items-center justify-center py-2.5 text-[11px] font-semibold transition-colors ${
                            active ? 'text-[#4e7e8c] bg-[#e8f0f3]' : 'text-neutral-500'
                        }`}
                    >
                        <Icon size={18} />
                        <span className="mt-0.5">{label}</span>
                    </button>
                );
            })}
        </nav>
    );
}
