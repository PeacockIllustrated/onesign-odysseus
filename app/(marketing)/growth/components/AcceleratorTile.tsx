'use client';

import { AddOnDisplay } from '@/lib/offers/onesignDigital';
import { Zap } from '@/lib/icons';

interface AcceleratorTileProps {
    item: AddOnDisplay;
}

export function AcceleratorTile({ item }: AcceleratorTileProps) {
    return (
        <div className="bg-white border border-neutral-200 p-5 rounded-[var(--radius-md)] flex justify-between items-start hover:border-black hover:shadow-md transition-all duration-200 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black" tabIndex={0}>
            <div className="flex gap-3">
                <div className="shrink-0 w-10 h-10 bg-neutral-100 rounded-[var(--radius-sm)] flex items-center justify-center group-hover:bg-black group-hover:text-white transition-colors">
                    <Zap size={18} />
                </div>
                <div>
                    <h4 className="font-semibold text-sm text-neutral-900 group-hover:text-black transition-colors">
                        {item.title}
                    </h4>
                    {item.description && (
                        <p className="text-xs text-neutral-500 mt-1">{item.description}</p>
                    )}
                </div>
            </div>
            <span className="text-sm font-bold whitespace-nowrap bg-neutral-50 px-3 py-1.5 rounded-[var(--radius-sm)] border border-neutral-100 group-hover:bg-black group-hover:text-white group-hover:border-black transition-all">
                {item.price}
            </span>
        </div>
    );
}
