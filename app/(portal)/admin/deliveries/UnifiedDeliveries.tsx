'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import type { Delivery } from '@/lib/deliveries/types';
import type { Driver } from '@/lib/drivers/types';
import type { PlanningDelivery } from '@/lib/planning/utils';
import { DeliveryList } from './DeliveryList';
import { PlanningPanel } from './PlanningPanel';
import { BottomTabBar, type TabId } from './BottomTabBar';
import type { SitePin } from './MapPanel';

const MapPanel = dynamic(() => import('./MapPanel'), {
    ssr: false,
    loading: () => (
        <div className="h-full bg-neutral-100 animate-pulse rounded-lg flex items-center justify-center text-neutral-400 text-sm">
            Loading map…
        </div>
    ),
});

type DesktopPanel = 'list' | 'plan';

interface Props {
    deliveries: Delivery[];
    planningDeliveries: PlanningDelivery[];
    activeDrivers: Driver[];
    allDrivers: Driver[];
    monday: string;
    includeWeekends: boolean;
    pins: SitePin[];
}

export function UnifiedDeliveries({
    deliveries, planningDeliveries, activeDrivers, allDrivers,
    monday, includeWeekends, pins,
}: Props) {
    const [desktopPanel, setDesktopPanel] = useState<DesktopPanel>('list');
    const [mobileTab, setMobileTab] = useState<TabId>('list');

    return (
        <div className="h-[calc(100vh-8rem)]">
            {/* Desktop (md+) */}
            <div className="hidden md:flex h-full gap-0">
                <div className="w-[45%] border-r border-neutral-200 overflow-y-auto">
                    <div className="sticky top-0 z-10 bg-white border-b border-neutral-200 px-4 py-2 flex items-center gap-2">
                        <button onClick={() => setDesktopPanel('list')}
                            className={`px-3 py-1.5 text-xs font-semibold rounded ${desktopPanel === 'list' ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-600'}`}>
                            List
                        </button>
                        <button onClick={() => setDesktopPanel('plan')}
                            className={`px-3 py-1.5 text-xs font-semibold rounded ${desktopPanel === 'plan' ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-600'}`}>
                            Plan
                        </button>
                    </div>
                    <div className="p-4">
                        {desktopPanel === 'list' ? (
                            <DeliveryList initialDeliveries={deliveries} />
                        ) : (
                            <PlanningPanel deliveries={planningDeliveries} activeDrivers={activeDrivers}
                                allDrivers={allDrivers} monday={monday} includeWeekends={includeWeekends} />
                        )}
                    </div>
                </div>
                <div className="w-[55%] relative">
                    <MapPanel pins={pins} />
                </div>
            </div>

            {/* Mobile (<md) */}
            <div className="md:hidden h-[calc(100vh-8rem-3rem)]">
                {mobileTab === 'list' && (
                    <div className="h-full overflow-y-auto p-4">
                        <DeliveryList initialDeliveries={deliveries} />
                    </div>
                )}
                {mobileTab === 'plan' && (
                    <div className="h-full overflow-y-auto overflow-x-auto p-4">
                        <PlanningPanel deliveries={planningDeliveries} activeDrivers={activeDrivers}
                            allDrivers={allDrivers} monday={monday} includeWeekends={includeWeekends} />
                    </div>
                )}
                {mobileTab === 'map' && (
                    <div className="h-full">
                        <MapPanel pins={pins} />
                    </div>
                )}
                <BottomTabBar activeTab={mobileTab} onChangeTab={setMobileTab} />
            </div>
        </div>
    );
}
